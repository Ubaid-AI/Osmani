// frappe.pages['server-health-1'].on_page_load = function(wrapper) {
// 	var page = frappe.ui.make_app_page({
// 		parent: wrapper,
// 		title: 'Server Health',
// 		single_column: true
// 	});
// }

frappe.pages['server-health-1'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Server Health Monitor',
		single_column: true
	});
	
	// Initialize dashboard
	new ServerHealthDashboard(page);
};

class ServerHealthDashboard {
	constructor(page) {
		this.page = page;
		this.wrapper = $(this.page.body);
		this.refresh_interval = null;
		this.auto_refresh_seconds = 5;
		
		// Ensure Font Awesome is loaded
		this.load_font_awesome();
		
		this.setup_page();
		this.load_data();
		this.start_auto_refresh();
	}
	
	load_font_awesome() {
		// Check if Font Awesome 6.0 is already loaded
		if (!document.querySelector('link[href*="font-awesome"]')) {
			const link = document.createElement('link');
			link.rel = 'stylesheet';
			link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css';
			document.head.appendChild(link);
		}
	}
	
	setup_page() {
		// Add refresh button
		this.page.set_primary_action('Refresh Now', () => {
			this.load_data();
		}, 'refresh');
		
		// Add auto-refresh toggle
		this.page.add_action_item('Auto-Refresh: ON', () => {
			if (this.refresh_interval) {
				this.stop_auto_refresh();
				this.page.set_action_items_text('Auto-Refresh: OFF');
			} else {
				this.start_auto_refresh();
				this.page.set_action_items_text('Auto-Refresh: ON');
			}
		});
		
		// Render dashboard structure
		this.render_dashboard();
	}
	
	render_dashboard() {
		this.wrapper.html(`
			<div class="server-health-dashboard">
				<!-- Loading State -->
				<div id="health-loading" class="text-center p-5">
					<div class="spinner-border text-primary" role="status">
						<span class="sr-only">Loading...</span>
					</div>
					<p class="mt-3 text-muted">Fetching server health data...</p>
				</div>
				
				<!-- Dashboard Content -->
				<div id="health-content" style="display: none;">
					<!-- Last Updated -->
					<div class="row mb-3">
						<div class="col-md-12">
							<div class="alert alert-info" style="background: #000000 !important; background-color: #000000 !important; background-image: none !important; color: #ffffff !important; border: none !important;">
								<i class="fas fa-clock" style="color: #ffffff !important;"></i> <span style="color: #ffffff !important;">Last updated:</span> <span id="last-updated" style="color: #ffffff !important;">-</span>
								<span class="float-right" style="color: #ffffff !important;">Auto-refresh every ${this.auto_refresh_seconds}s</span>
							</div>
						</div>
					</div>
					
					<!-- Quick Stats Row -->
					<div class="row mb-4">
						<div class="col-md-3">
							<div class="health-card">
								<div class="health-card-icon cpu-icon">
									<i class="fas fa-microchip"></i>
								</div>
								<div class="health-card-content">
									<div class="health-card-label">CPU Usage</div>
									<div class="health-card-value" id="cpu-usage">-</div>
									<div class="progress mt-2" style="height: 6px;">
										<div class="progress-bar" id="cpu-progress" style="width: 0%"></div>
									</div>
									<small class="text-muted" id="cpu-cores">-</small>
								</div>
							</div>
						</div>
						
						<div class="col-md-3">
							<div class="health-card">
								<div class="health-card-icon memory-icon">
									<i class="fas fa-memory"></i>
								</div>
								<div class="health-card-content">
									<div class="health-card-label">Memory Usage</div>
									<div class="health-card-value" id="memory-usage">-</div>
									<div class="progress mt-2" style="height: 6px;">
										<div class="progress-bar" id="memory-progress" style="width: 0%"></div>
									</div>
									<small class="text-muted" id="memory-details">-</small>
								</div>
							</div>
						</div>
						
						<div class="col-md-3">
							<div class="health-card">
								<div class="health-card-icon disk-icon">
									<i class="fas fa-hdd"></i>
								</div>
								<div class="health-card-content">
									<div class="health-card-label">Disk Usage</div>
									<div class="health-card-value" id="disk-usage">-</div>
									<div class="progress mt-2" style="height: 6px;">
										<div class="progress-bar" id="disk-progress" style="width: 0%"></div>
									</div>
									<small class="text-muted" id="disk-details">-</small>
								</div>
							</div>
						</div>
						
						<div class="col-md-3">
							<div class="health-card">
								<div class="health-card-icon db-icon">
									<i class="fas fa-database"></i>
								</div>
								<div class="health-card-content">
									<div class="health-card-label">Database</div>
									<div class="health-card-value" id="db-connections">-</div>
									<small class="text-muted" id="db-details">-</small>
								</div>
							</div>
						</div>
					</div>
					
					<!-- System Info & Load Average -->
					<div class="row mb-4">
						<div class="col-md-6">
							<div class="info-panel">
								<h5><i class="fas fa-server"></i> System Information</h5>
								<table class="table table-sm">
									<tbody>
										<tr>
											<td><strong>Hostname:</strong></td>
											<td id="sys-hostname">-</td>
										</tr>
										<tr>
											<td><strong>Platform:</strong></td>
											<td id="sys-platform">-</td>
										</tr>
										<tr>
											<td><strong>Uptime:</strong></td>
											<td id="sys-uptime">-</td>
										</tr>
										<tr>
											<td><strong>Boot Time:</strong></td>
											<td id="sys-boot-time">-</td>
										</tr>
									</tbody>
								</table>
							</div>
						</div>
						
						<div class="col-md-6">
							<div class="info-panel">
								<h5><i class="fas fa-tachometer-alt"></i> Load Average</h5>
								<table class="table table-sm">
									<tbody>
										<tr>
											<td><strong>1 minute:</strong></td>
											<td id="load-1">-</td>
										</tr>
										<tr>
											<td><strong>5 minutes:</strong></td>
											<td id="load-5">-</td>
										</tr>
										<tr>
											<td><strong>15 minutes:</strong></td>
											<td id="load-15">-</td>
										</tr>
										<tr>
											<td><strong>CPU Frequency:</strong></td>
											<td id="cpu-freq">-</td>
										</tr>
									</tbody>
								</table>
							</div>
						</div>
					</div>
					
					<!-- Sites & Network Info -->
					<div class="row mb-4">
						<div class="col-md-6">
							<div class="info-panel">
								<h5><i class="fas fa-globe"></i> Sites Information</h5>
								<table class="table table-sm">
									<tbody>
										<tr>
											<td><strong>Total Sites:</strong></td>
											<td id="sites-total">-</td>
										</tr>
										<tr>
											<td><strong>Active Sites:</strong></td>
											<td id="sites-active">-</td>
										</tr>
										<tr>
											<td><strong>Suspended Sites:</strong></td>
											<td id="sites-suspended">-</td>
										</tr>
										<tr>
											<td><strong>Total Databases:</strong></td>
											<td id="db-count">-</td>
										</tr>
									</tbody>
								</table>
							</div>
						</div>
						
						<div class="col-md-6">
							<div class="info-panel">
								<h5><i class="fas fa-network-wired"></i> Network Statistics</h5>
								<table class="table table-sm">
									<tbody>
										<tr>
											<td><strong>Bytes Sent:</strong></td>
											<td id="net-sent">-</td>
										</tr>
										<tr>
											<td><strong>Bytes Received:</strong></td>
											<td id="net-recv">-</td>
										</tr>
										<tr>
											<td><strong>Packets Sent:</strong></td>
											<td id="net-packets-sent">-</td>
										</tr>
										<tr>
											<td><strong>Packets Received:</strong></td>
											<td id="net-packets-recv">-</td>
										</tr>
									</tbody>
								</table>
							</div>
						</div>
					</div>
					
					<!-- Disk Partitions -->
					<div class="row mb-4">
						<div class="col-md-12">
							<div class="info-panel">
								<h5><i class="fas fa-hard-drive"></i> Disk Partitions</h5>
								<div class="table-responsive">
									<table class="table table-sm">
										<thead>
											<tr>
												<th>Device</th>
												<th>Mount Point</th>
												<th>File System</th>
												<th>Total</th>
												<th>Used</th>
												<th>Free</th>
												<th>Usage %</th>
											</tr>
										</thead>
										<tbody id="disk-partitions-table">
											<tr><td colspan="7" class="text-center">Loading...</td></tr>
										</tbody>
									</table>
								</div>
							</div>
						</div>
					</div>
					
					<!-- Processes -->
					<div class="row mb-4">
						<div class="col-md-12">
							<div class="info-panel">
								<h5><i class="fas fa-tasks"></i> Bench Processes (Top 20)</h5>
								<div class="table-responsive">
									<table class="table table-sm table-hover">
										<thead>
											<tr>
												<th>PID</th>
												<th>Name</th>
												<th>CPU %</th>
												<th>Memory %</th>
												<th>Status</th>
											</tr>
										</thead>
										<tbody id="processes-table">
											<tr><td colspan="5" class="text-center">Loading...</td></tr>
										</tbody>
									</table>
								</div>
							</div>
						</div>
					</div>
					
					<!-- Supervisor Services -->
					<div class="row mb-4">
						<div class="col-md-12">
							<div class="info-panel">
								<h5><i class="fas fa-cogs"></i> Supervisor Services</h5>
								<div id="supervisor-services">
									<p class="text-muted">Loading supervisor status...</p>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		`);
	}
	
	async load_data() {
		try {
			const response = await frappe.call({
				method: 'osmani.api.server_health_api.get_server_health',
				freeze: false
			});
			
			if (response.message && !response.message.error) {
				this.data = response.message;
				this.render_health_data();
				$('#health-loading').hide();
				$('#health-content').fadeIn();
			} else {
				throw new Error(response.message.error || 'Failed to load server health data');
			}
		} catch (error) {
			console.error('Error loading server health:', error);
			frappe.msgprint({
				title: 'Error',
				message: 'Failed to load server health data. Please try again.',
				indicator: 'red'
			});
		}
	}
	
	render_health_data() {
		if (!this.data) return;
		
		const { cpu, memory, disk, network, system, database, sites, processes } = this.data;
		
		// Update timestamp
		$('#last-updated').text(frappe.datetime.now_datetime());
		
		// CPU
		$('#cpu-usage').text(`${cpu.percent}%`);
		$('#cpu-progress').css('width', `${cpu.percent}%`).removeClass('bg-success bg-warning bg-danger');
		if (cpu.percent < 60) $('#cpu-progress').addClass('bg-success');
		else if (cpu.percent < 80) $('#cpu-progress').addClass('bg-warning');
		else $('#cpu-progress').addClass('bg-danger');
		$('#cpu-cores').text(`${cpu.count} cores`);
		
		// Memory
		const memUsedGB = (memory.used / (1024 ** 3)).toFixed(2);
		const memTotalGB = (memory.total / (1024 ** 3)).toFixed(2);
		$('#memory-usage').text(`${memory.percent}%`);
		$('#memory-progress').css('width', `${memory.percent}%`).removeClass('bg-success bg-warning bg-danger');
		if (memory.percent < 60) $('#memory-progress').addClass('bg-success');
		else if (memory.percent < 80) $('#memory-progress').addClass('bg-warning');
		else $('#memory-progress').addClass('bg-danger');
		$('#memory-details').text(`${memUsedGB} GB / ${memTotalGB} GB`);
		
		// Disk
		const diskUsedGB = (disk.used / (1024 ** 3)).toFixed(2);
		const diskTotalGB = (disk.total / (1024 ** 3)).toFixed(2);
		$('#disk-usage').text(`${disk.percent}%`);
		$('#disk-progress').css('width', `${disk.percent}%`).removeClass('bg-success bg-warning bg-danger');
		if (disk.percent < 60) $('#disk-progress').addClass('bg-success');
		else if (disk.percent < 80) $('#disk-progress').addClass('bg-warning');
		else $('#disk-progress').addClass('bg-danger');
		$('#disk-details').text(`${diskUsedGB} GB / ${diskTotalGB} GB`);
		
		// Database
		$('#db-connections').text(`${database.active_connections} / ${database.total_connections}`);
		$('#db-details').text(`${database.database_count} databases, ${database.total_size_mb} MB`);
		
		// System Info
		$('#sys-hostname').html(`<span class="value-badge">${system.hostname}</span>`);
		$('#sys-platform').html(`<span class="value-badge info">${system.platform} ${system.release}</span>`);
		$('#sys-uptime').html(`<span class="value-badge success">${system.uptime_days}d ${system.uptime_hours}h ${system.uptime_minutes}m</span>`);
		$('#sys-boot-time').html(`<span class="value-badge">${system.boot_time}</span>`);
		
		// Load Average
		$('#load-1').html(this.format_load_badge(cpu.load_1, cpu.count));
		$('#load-5').html(this.format_load_badge(cpu.load_5, cpu.count));
		$('#load-15').html(this.format_load_badge(cpu.load_15, cpu.count));
		$('#cpu-freq').html(`<span class="value-badge info">${cpu.frequency.toFixed(2)} MHz</span>`);
		
		// Sites
		$('#sites-total').html(`<span class="value-badge">${sites.total}</span>`);
		$('#sites-active').html(`<span class="value-badge success">${sites.active}</span>`);
		$('#sites-suspended').html(`<span class="value-badge warning">${sites.suspended}</span>`);
		$('#db-count').html(`<span class="value-badge">${database.database_count}</span>`);
		
		// Network
		$('#net-sent').html(`<span class="value-badge success">${this.format_bytes(network.bytes_sent)}</span>`);
		$('#net-recv').html(`<span class="value-badge info">${this.format_bytes(network.bytes_recv)}</span>`);
		$('#net-packets-sent').html(`<span class="value-badge">${network.packets_sent.toLocaleString()}</span>`);
		$('#net-packets-recv').html(`<span class="value-badge">${network.packets_recv.toLocaleString()}</span>`);
		
		// Disk Partitions
		this.render_disk_partitions(disk.partitions);
		
		// Processes
		this.render_processes(processes.processes);
		
		// Supervisor
		this.render_supervisor(processes.supervisor);
	}
	
	format_load_badge(load, cores) {
		const threshold = cores * 0.7;
		let badgeClass = 'success';
		if (load > cores) badgeClass = 'warning';
		else if (load > threshold) badgeClass = 'info';
		return `<span class="value-badge ${badgeClass}">${load}</span>`;
	}
	
	format_bytes(bytes) {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
	}
	
	render_disk_partitions(partitions) {
		let html = '';
		partitions.forEach(partition => {
			const totalGB = (partition.total / (1024 ** 3)).toFixed(2);
			const usedGB = (partition.used / (1024 ** 3)).toFixed(2);
			const freeGB = (partition.free / (1024 ** 3)).toFixed(2);
			
			let badgeClass = 'success';
			if (partition.percent > 80) badgeClass = 'warning';
			else if (partition.percent > 60) badgeClass = 'info';
			
			html += `
				<tr>
					<td>${partition.device}</td>
					<td><span class="value-badge">${partition.mountpoint}</span></td>
					<td>${partition.fstype}</td>
					<td><span class="value-badge info">${totalGB} GB</span></td>
					<td><span class="value-badge ${badgeClass}">${usedGB} GB</span></td>
					<td><span class="value-badge success">${freeGB} GB</span></td>
					<td><span class="value-badge ${badgeClass}">${partition.percent}%</span></td>
				</tr>
			`;
		});
		$('#disk-partitions-table').html(html || '<tr><td colspan="7" class="text-center text-muted">No partitions found</td></tr>');
	}
	
	render_processes(processes) {
		let html = '';
		processes.forEach(proc => {
			let statusClass = 'success';
			if (proc.status === 'zombie') statusClass = 'warning';
			else if (proc.status === 'sleeping') statusClass = 'info';
			
			// CPU and Memory badge classes based on usage
			let cpuBadgeClass = 'success';
			if (proc.cpu_percent > 50) cpuBadgeClass = 'warning';
			else if (proc.cpu_percent > 10) cpuBadgeClass = 'info';
			
			let memBadgeClass = 'success';
			if (proc.memory_percent > 5) memBadgeClass = 'warning';
			else if (proc.memory_percent > 1) memBadgeClass = 'info';
			
			html += `
				<tr>
					<td><span class="value-badge">${proc.pid}</span></td>
					<td><strong>${proc.name}</strong></td>
					<td><span class="value-badge ${cpuBadgeClass}">${proc.cpu_percent}%</span></td>
					<td><span class="value-badge ${memBadgeClass}">${proc.memory_percent}%</span></td>
					<td><span class="value-badge ${statusClass}">${proc.status}</span></td>
				</tr>
			`;
		});
		$('#processes-table').html(html || '<tr><td colspan="5" class="text-center text-muted">No processes found</td></tr>');
	}
	
	render_supervisor(supervisor) {
		if (!supervisor.available) {
			$('#supervisor-services').html(`
				<div class="alert alert-warning">
					<i class="fas fa-exclamation-triangle"></i> Supervisor is not available or not accessible.
					${supervisor.error ? `<br><small>${supervisor.error}</small>` : ''}
				</div>
			`);
			return;
		}
		
		let html = '<div class="row">';
		supervisor.services.forEach((service, index) => {
			let statusClass = 'badge-success';
			let iconClass = 'fa-check-circle';
			
			if (service.status === 'STOPPED' || service.status === 'FATAL') {
				statusClass = 'badge-danger';
				iconClass = 'fa-times-circle';
			} else if (service.status === 'STARTING' || service.status === 'STOPPING') {
				statusClass = 'badge-warning';
				iconClass = 'fa-sync fa-spin';
			}
			
			html += `
				<div class="col-md-4 mb-3">
					<div class="service-card">
						<i class="fas ${iconClass}"></i>
						<strong>${service.name}</strong>
						<span class="badge ${statusClass}">${service.status}</span>
						${service.info ? `<small class="text-muted d-block mt-1">${service.info}</small>` : ''}
					</div>
				</div>
			`;
		});
		html += '</div>';
		$('#supervisor-services').html(html);
	}
	
	start_auto_refresh() {
		this.refresh_interval = setInterval(() => {
			this.load_data();
		}, this.auto_refresh_seconds * 1000);
	}
	
	stop_auto_refresh() {
		if (this.refresh_interval) {
			clearInterval(this.refresh_interval);
			this.refresh_interval = null;
		}
	}
	
	destroy() {
		this.stop_auto_refresh();
	}
}

// Cleanup on page unload
frappe.pages['server-health-1'].on_page_unload = function(wrapper) {
	const page = wrapper.page;
	if (page.health_dashboard) {
		page.health_dashboard.destroy();
	}
};
