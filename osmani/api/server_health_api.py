import frappe
import psutil
import os
import subprocess
from datetime import datetime

@frappe.whitelist()
def get_server_health():
    """
    Get comprehensive server health statistics
    Returns real-time metrics for CPU, Memory, Disk, Network, Database, and Processes
    """
    try:
        # CPU Information
        cpu_percent = psutil.cpu_percent(interval=1)
        cpu_count = psutil.cpu_count()
        cpu_freq = psutil.cpu_freq()
        load_avg = os.getloadavg() if hasattr(os, 'getloadavg') else (0, 0, 0)
        
        # Memory Information
        memory = psutil.virtual_memory()
        swap = psutil.swap_memory()
        
        # Disk Information
        disk = psutil.disk_usage('/')
        disk_io = psutil.disk_io_counters()
        
        # Network Information
        network = psutil.net_io_counters()
        
        # System Information
        boot_time = datetime.fromtimestamp(psutil.boot_time())
        uptime_seconds = (datetime.now() - boot_time).total_seconds()
        uptime_days = int(uptime_seconds // 86400)
        uptime_hours = int((uptime_seconds % 86400) // 3600)
        uptime_minutes = int((uptime_seconds % 3600) // 60)
        
        # Database Information
        db_connections = get_database_connections()
        
        # Sites Information
        sites_info = get_sites_info()
        
        # Bench Processes
        bench_processes = get_bench_processes()
        
        # Additional Disk Partitions
        disk_partitions = []
        for partition in psutil.disk_partitions():
            try:
                usage = psutil.disk_usage(partition.mountpoint)
                disk_partitions.append({
                    'device': partition.device,
                    'mountpoint': partition.mountpoint,
                    'fstype': partition.fstype,
                    'total': usage.total,
                    'used': usage.used,
                    'free': usage.free,
                    'percent': usage.percent
                })
            except PermissionError:
                continue
        
        return {
            'cpu': {
                'percent': cpu_percent,
                'count': cpu_count,
                'frequency': cpu_freq.current if cpu_freq else 0,
                'load_1': round(load_avg[0], 2),
                'load_5': round(load_avg[1], 2),
                'load_15': round(load_avg[2], 2)
            },
            'memory': {
                'total': memory.total,
                'available': memory.available,
                'used': memory.used,
                'percent': memory.percent,
                'swap_total': swap.total,
                'swap_used': swap.used,
                'swap_percent': swap.percent
            },
            'disk': {
                'total': disk.total,
                'used': disk.used,
                'free': disk.free,
                'percent': disk.percent,
                'read_bytes': disk_io.read_bytes if disk_io else 0,
                'write_bytes': disk_io.write_bytes if disk_io else 0,
                'partitions': disk_partitions
            },
            'network': {
                'bytes_sent': network.bytes_sent,
                'bytes_recv': network.bytes_recv,
                'packets_sent': network.packets_sent,
                'packets_recv': network.packets_recv
            },
            'system': {
                'boot_time': boot_time.strftime('%Y-%m-%d %H:%M:%S'),
                'uptime_days': uptime_days,
                'uptime_hours': uptime_hours,
                'uptime_minutes': uptime_minutes,
                'hostname': os.uname().nodename,
                'platform': os.uname().sysname,
                'release': os.uname().release
            },
            'database': db_connections,
            'sites': sites_info,
            'processes': bench_processes
        }
        
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Server Health API Error")
        return {'error': str(e)}


def get_database_connections():
    """Get MySQL/MariaDB connection statistics"""
    try:
        # Get database statistics
        result = frappe.db.sql("""
            SELECT 
                COUNT(*) as total_connections,
                SUM(CASE WHEN command = 'Sleep' THEN 1 ELSE 0 END) as sleeping,
                SUM(CASE WHEN command != 'Sleep' THEN 1 ELSE 0 END) as active
            FROM information_schema.PROCESSLIST
        """, as_dict=True)
        
        # Get database size
        db_size = frappe.db.sql("""
            SELECT 
                ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS size_mb
            FROM information_schema.TABLES
        """, as_dict=True)
        
        # Get all databases count
        db_count = frappe.db.sql("""
            SELECT COUNT(*) as count 
            FROM information_schema.SCHEMATA
            WHERE SCHEMA_NAME NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
        """, as_dict=True)
        
        return {
            'total_connections': result[0]['total_connections'] if result else 0,
            'active_connections': result[0]['active'] if result else 0,
            'sleeping_connections': result[0]['sleeping'] if result else 0,
            'total_size_mb': db_size[0]['size_mb'] if db_size else 0,
            'database_count': db_count[0]['count'] if db_count else 0
        }
    except Exception as e:
        frappe.logger().error(f"Error getting database connections: {str(e)}")
        return {
            'total_connections': 0,
            'active_connections': 0,
            'sleeping_connections': 0,
            'total_size_mb': 0,
            'database_count': 0
        }


def get_sites_info():
    """Get information about all sites in the bench"""
    try:
        sites_path = '/home/frappe/frappe-bench/sites'
        sites = []
        
        # List all site directories
        for item in os.listdir(sites_path):
            item_path = os.path.join(sites_path, item)
            if os.path.isdir(item_path) and item not in ['assets', 'common_site_config.json']:
                site_config_path = os.path.join(item_path, 'site_config.json')
                if os.path.exists(site_config_path):
                    sites.append(item)
        
        # Get active sites count from Customer Site doctype
        try:
            active_sites = frappe.db.count('Customer Site', {'status': 'Active'})
            suspended_sites = frappe.db.count('Customer Site', {'status': 'Suspended'})
        except:
            active_sites = 0
            suspended_sites = 0
        
        return {
            'total': len(sites),
            'active': active_sites,
            'suspended': suspended_sites,
            'sites_list': sites[:10]  # Return first 10 sites
        }
    except Exception as e:
        frappe.logger().error(f"Error getting sites info: {str(e)}")
        return {
            'total': 0,
            'active': 0,
            'suspended': 0,
            'sites_list': []
        }


def get_bench_processes():
    """Get Frappe bench process information"""
    try:
        processes = []
        
        # Get processes related to bench
        for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent', 'status']):
            try:
                pinfo = proc.info
                # Filter for Frappe/Bench related processes
                if any(keyword in pinfo['name'].lower() for keyword in ['gunicorn', 'node', 'redis', 'nginx', 'supervisor', 'bench']):
                    processes.append({
                        'pid': pinfo['pid'],
                        'name': pinfo['name'],
                        'cpu_percent': round(pinfo['cpu_percent'], 2),
                        'memory_percent': round(pinfo['memory_percent'], 2),
                        'status': pinfo['status']
                    })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        
        # Try to get supervisor status
        supervisor_status = get_supervisor_status()
        
        return {
            'processes': processes[:20],  # Return top 20 processes
            'supervisor': supervisor_status
        }
    except Exception as e:
        frappe.logger().error(f"Error getting bench processes: {str(e)}")
        return {
            'processes': [],
            'supervisor': {}
        }


def get_supervisor_status():
    """Get supervisor process status"""
    try:
        result = subprocess.run(
            ['sudo', 'supervisorctl', 'status'],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        if result.returncode == 0:
            lines = result.stdout.strip().split('\n')
            services = []
            for line in lines:
                if line.strip():
                    parts = line.split()
                    if len(parts) >= 2:
                        services.append({
                            'name': parts[0],
                            'status': parts[1],
                            'info': ' '.join(parts[2:]) if len(parts) > 2 else ''
                        })
            return {'services': services, 'available': True}
        else:
            return {'services': [], 'available': False, 'error': result.stderr}
    except Exception as e:
        frappe.logger().error(f"Error getting supervisor status: {str(e)}")
        return {'services': [], 'available': False, 'error': str(e)}


@frappe.whitelist()
def get_server_metrics_history():
    """Get historical server metrics (last 24 hours)"""
    # This would require storing metrics in a database
    # For now, return empty or implement based on requirements
    return {
        'cpu_history': [],
        'memory_history': [],
        'disk_history': []
    }

