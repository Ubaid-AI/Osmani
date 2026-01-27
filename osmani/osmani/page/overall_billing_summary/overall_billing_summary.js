frappe.pages['overall-billing-summary'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Overall Billing Summary',
		single_column: true
	});

	// Initialize the report
	new OverallBillingSummaryReport(page);
}

class OverallBillingSummaryReport {
	constructor(page) {
		this.page = page;
		this.parent = $(this.page.body);
		this.filters = {
			from_date: frappe.datetime.add_months(frappe.datetime.get_today(), -3),
			to_date: frappe.datetime.get_today(),
			projects: [],
			include_tax: false
		};
		
		this.setup_page();
		this.render_filters();
	}

	setup_page() {
		this.parent.html(`
			<div class="obs-page-content">
				<div class="obs-filters"></div>
				<div class="obs-report-content"></div>
			</div>
		`);
	}

	render_filters() {
		const me = this;
		
		this.parent.find('.obs-filters').html(`
			<div class="row">
				<div class="col-sm-2">
					<label style="font-weight: 600; margin-bottom: 6px; font-size: 12px; color: #333;">From Date</label>
					<div class="obs-from-date"></div>
				</div>
				<div class="col-sm-2">
					<label style="font-weight: 600; margin-bottom: 6px; font-size: 12px; color: #333;">To Date</label>
					<div class="obs-to-date"></div>
				</div>
				<div class="col-sm-3">
					<label style="font-weight: 600; margin-bottom: 6px; font-size: 12px; color: #333;">Projects</label>
					<div class="obs-project-field"></div>
				</div>
				<div class="col-sm-2">
					<div class="obs-tax-field"></div>
				</div>
				<div class="col-sm-3" style="padding-top: 22px;">
					<button class="btn btn-primary btn-sm obs-generate-btn" title="Generate Report">
						<i class="fa fa-refresh"></i>
					</button>
					<button class="btn btn-success btn-sm obs-export-btn" style="margin-left: 5px;" title="Export to Excel">
						<i class="fa fa-file-excel-o"></i> Excel
					</button>
					<button class="btn btn-default btn-sm obs-print-btn" style="margin-left: 5px;" title="Print Report">
						<i class="fa fa-print"></i>
					</button>
				</div>
			</div>
		`);

		// From Date Field
		this.from_date_field = frappe.ui.form.make_control({
			parent: this.parent.find('.obs-from-date'),
			df: {
				fieldtype: 'Date',
				fieldname: 'from_date',
				default: this.filters.from_date,
				onchange: function() {
					me.filters.from_date = me.from_date_field.get_value();
				}
			},
			render_input: true
		});
		this.from_date_field.set_value(this.filters.from_date);

		// To Date Field
		this.to_date_field = frappe.ui.form.make_control({
			parent: this.parent.find('.obs-to-date'),
			df: {
				fieldtype: 'Date',
				fieldname: 'to_date',
				default: this.filters.to_date,
				onchange: function() {
					me.filters.to_date = me.to_date_field.get_value();
				}
			},
			render_input: true
		});
		this.to_date_field.set_value(this.filters.to_date);

		// Project Multi-Select Field
		this.project_field = frappe.ui.form.make_control({
			parent: this.parent.find('.obs-project-field'),
			df: {
				fieldtype: 'MultiSelectList',
				fieldname: 'projects',
				placeholder: 'Select Projects (leave empty for all)',
				get_data: function(txt) {
					return frappe.db.get_link_options('Project', txt);
				},
				onchange: function() {
					me.filters.projects = me.project_field.get_value() || [];
				}
			},
			render_input: true,
			only_input: true
		});
		
		// Load all projects initially
		frappe.db.get_list('Project', {
			fields: ['name'],
			limit: 0,
			order_by: 'name'
		}).then(projects => {
			if (me.project_field) {
				me.project_field.refresh();
			}
		});
		
		this.project_field.set_value([]);

		// Include Tax Checkbox
		this.tax_field = frappe.ui.form.make_control({
			parent: this.parent.find('.obs-tax-field'),
			df: {
				fieldtype: 'Check',
				label: 'Include Tax',
				fieldname: 'include_tax',
				default: 0,
				onchange: function() {
					me.filters.include_tax = me.tax_field.get_value() ? true : false;
				}
			},
			render_input: true
		});
		this.tax_field.set_value(0);

		// Button Events
		this.parent.find('.obs-generate-btn').on('click', () => this.generate_report());
		this.parent.find('.obs-export-btn').on('click', () => this.export_to_excel());
		this.parent.find('.obs-print-btn').on('click', () => window.print());

		// Generate initial report
		this.generate_report();
	}

	generate_report() {
		const me = this;
		
		this.parent.find('.obs-report-content').html(`
			<div style="text-align: center; padding: 60px; color: #888;">
				<p><i class="fa fa-spinner fa-spin fa-2x"></i></p>
				<p style="margin-top: 15px;">Generating report...</p>
			</div>
		`);

		// Call server-side method to get GL entries
		frappe.call({
			method: 'osmani.osmani.page.overall_billing_summary.overall_billing_summary.get_billing_data',
			args: {
				from_date: this.filters.from_date,
				to_date: this.filters.to_date,
				projects: this.filters.projects
			},
			callback: function(r) {
				const gl_entries = r.message || [];
				console.log('GL Entries found:', gl_entries.length);
				if (gl_entries.length > 0) {
					console.log('Sample GL Entry:', gl_entries[0]);
				}
				
				me.process_and_render(gl_entries);
			}
		});
	}

	process_and_render(gl_entries) {
		const months = this.get_months_between(this.filters.from_date, this.filters.to_date);
		const project_data = {};
		const month_totals = {};

		// Determine tax label
		const tax_label = this.filters.include_tax ? 'Incl. ST' : 'Excl. ST';
		
		// Store report data for export
		this.report_data = { months, project_data, month_totals, tax_label };

		console.log('Months to display:', months);
		console.log('Processing', gl_entries.length, 'GL entries');

		// Initialize month totals
		months.forEach(month => {
			month_totals[month] = 0;
		});

		// Process GL Entries - Only Income (Billing)
		gl_entries.forEach(entry => {
			if (!entry[1]) return; // project is at index 1
			
			const project = entry[1];
			const posting_date = entry[0];
			const debit = entry[2] || 0;
			const credit = entry[3] || 0;
			const is_opening = entry[4];
			const type = entry[5]; // 'Income' or 'Expense'
			
			// Skip opening entries
			if (is_opening === 'Yes') return;
			
			// Only process Income entries
			if (type !== 'Income') return;
			
			if (!project_data[project]) {
				project_data[project] = {};
			}

			const month_key = posting_date.substr(0, 7); // YYYY-MM
			
			if (!project_data[project][month_key]) {
				project_data[project][month_key] = 0;
			}

			// For Income: credit - debit
			const billing = credit - debit;
			project_data[project][month_key] += billing;
			month_totals[month_key] = (month_totals[month_key] || 0) + billing;
		});

		// Update stored report data
		this.report_data.project_data = project_data;
		this.report_data.month_totals = month_totals;

		console.log('Final project_data:', project_data);
		console.log('Month totals:', month_totals);

		const projects = Object.keys(project_data).sort();

		if (projects.length === 0) {
			this.parent.find('.obs-report-content').html(`
				<div style="text-align: center; padding: 60px; color: #888;">
					<p><i class="fa fa-exclamation-triangle fa-2x"></i></p>
					<p style="margin-top: 15px;">No data found for the selected filters</p>
				</div>
			`);
			return;
		}

		this.render_table(months, project_data, projects, month_totals, tax_label);
	}

	get_months_between(from_date, to_date) {
		const months = [];
		let current = new Date(from_date);
		const end = new Date(to_date);
		
		while (current <= end) {
			const year = current.getFullYear();
			const month = String(current.getMonth() + 1).padStart(2, '0');
			months.push(`${year}-${month}`);
			current.setMonth(current.getMonth() + 1);
		}
		
		return months;
	}

	format_currency(value) {
		if (!value || value === 0) return '';
		return frappe.format(value, {fieldtype: 'Currency'});
	}

	format_date_display(date_str) {
		// Format: 01-JAN-2026
		const date = new Date(date_str);
		const day = String(date.getDate()).padStart(2, '0');
		const month = date.toLocaleString('en-US', { month: 'short' }).toUpperCase();
		const year = date.getFullYear();
		return `${day}-${month}-${year}`;
	}

	format_datetime_display(datetime_str) {
		// Format: 01-JAN-2026 14:51:15
		const date = new Date(datetime_str);
		const day = String(date.getDate()).padStart(2, '0');
		const month = date.toLocaleString('en-US', { month: 'short' }).toUpperCase();
		const year = date.getFullYear();
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');
		const seconds = String(date.getSeconds()).padStart(2, '0');
		return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
	}

	render_table(months, project_data, projects, month_totals, tax_label) {
		// Build month headers
		const month_headers = months.map(month => {
			const [year, mon] = month.split('-');
			const date = new Date(year, parseInt(mon) - 1);
			return date.toLocaleString('en-US', { month: 'short', year: 'numeric' });
		}).join('</th><th>');

		// Calculate totals for each project and sort by total descending
		const project_totals = [];
		projects.forEach(project => {
			let row_total = 0;
			months.forEach(month => {
				row_total += project_data[project][month] || 0;
			});
			project_totals.push({ project, total: row_total });
		});
		
		// Sort by total descending
		project_totals.sort((a, b) => b.total - a.total);
		
		// Build project rows with sorted data
		let project_rows = '';
		const chart_data = { projects: [], totals: [] };
		
		project_totals.forEach(({ project, total }) => {
			const cells = months.map(month => {
				const value = project_data[project][month] || 0;
				return `<td>${this.format_currency(value)}</td>`;
			}).join('');
			
			project_rows += `
				<tr>
					<td class="project-name">${project}</td>
					${cells}
					<td class="total-col">${this.format_currency(total)}</td>
				</tr>
			`;
			
			// Collect data for charts
			chart_data.projects.push(project);
			chart_data.totals.push(total);
		});
		
		// Store chart data
		this.chart_data = chart_data;
		this.chart_months = months;
		this.chart_project_data = project_data;

		// Build grand total row
		let grand_total = 0;
		const total_cells = months.map(month => {
			const value = month_totals[month] || 0;
			grand_total += value;
			return `<td>${this.format_currency(value)}</td>`;
		}).join('');

		// Current date/time
		const report_datetime = this.format_datetime_display(new Date());
		const date_range = `From ${this.format_date_display(this.filters.from_date)} To ${this.format_date_display(this.filters.to_date)}`;

		const html = `
			<div class="obs-report-header">
				<div class="obs-report-badge">SALES-1A</div>
				<h1>OCL ERP REPORT</h1>
				<h2>Overall Billing Summary (${tax_label})</h2>
				<h3>${date_range}</h3>
				<div class="obs-report-meta">
					Report on : <strong>${report_datetime}</strong>
				</div>
			</div>
			<table>
				<thead>
					<tr>
						<th>Project</th>
						<th>${month_headers}</th>
						<th>Total</th>
					</tr>
				</thead>
				<tbody>
					${project_rows}
				</tbody>
				<tfoot>
					<tr class="grand-total">
						<td class="project-name">Total</td>
						${total_cells}
						<td>${this.format_currency(grand_total)}</td>
					</tr>
				</tfoot>
			</table>
			
			<div class="obs-charts-section">
				<div class="charts-row">
					<div class="chart-container">
						<h4 class="chart-title">Project-wise Total Billing</h4>
						<div id="obs-pie-chart"></div>
					</div>
					<div class="chart-container">
						<h4 class="chart-title">Monthly Comparison (Top 10 Projects)</h4>
						<div id="obs-bar-chart"></div>
					</div>
				</div>
			</div>
		`;

		this.parent.find('.obs-report-content').html(html);
		
		// Render charts
		setTimeout(() => this.render_charts(), 100);
	}
	
	render_charts() {
		if (!this.chart_data) return;
		
		// Simple approach: render charts using HTML/CSS for better compatibility
		this.render_pie_chart_html();
		this.render_bar_chart_html();
	}
	
	render_pie_chart_html() {
		const container = document.getElementById('obs-pie-chart');
		if (!container) return;
		
		const total = this.chart_data.totals.reduce((sum, val) => sum + val, 0);
		
		// Calculate angles for pie slices
		let currentAngle = 0;
		const slices = [];
		
		this.chart_data.projects.forEach((project, idx) => {
			const value = this.chart_data.totals[idx];
			const percentage = (value / total) * 100;
			const angle = (percentage / 100) * 360;
			
			slices.push({
				project,
				value,
				percentage: percentage.toFixed(1),
				startAngle: currentAngle,
				endAngle: currentAngle + angle,
				color: this.get_chart_color(idx)
			});
			
			currentAngle += angle;
		});
		
		// Create SVG pie chart
		let html = '<div class="custom-pie-chart">';
		html += '<svg viewBox="0 0 200 200" class="pie-svg">';
		
		slices.forEach(slice => {
			const path = this.create_pie_slice(100, 100, 80, slice.startAngle, slice.endAngle);
			html += `<path d="${path}" fill="${slice.color}" class="pie-slice" 
				data-project="${slice.project}" data-value="${this.format_currency(slice.value)}" 
				data-percentage="${slice.percentage}%"></path>`;
		});
		
		html += '</svg>';
		
		// Add legend
		html += '<div class="pie-legend-compact">';
		slices.forEach(slice => {
			html += `
				<div class="legend-item-compact">
					<span class="legend-color" style="background-color: ${slice.color};"></span>
					<span class="legend-text">${slice.project} (${slice.percentage}%)</span>
				</div>
			`;
		});
		html += '</div></div>';
		
		container.innerHTML = html;
		
		// Create tooltip element
		const tooltip = document.createElement('div');
		tooltip.className = 'chart-tooltip';
		tooltip.style.display = 'none';
		container.appendChild(tooltip);
		
		// Add hover tooltips
		container.querySelectorAll('.pie-slice').forEach(slice => {
			slice.addEventListener('mouseenter', (e) => {
				const project = e.target.getAttribute('data-project');
				const value = e.target.getAttribute('data-value');
				const percentage = e.target.getAttribute('data-percentage');
				tooltip.innerHTML = `<strong>${project}</strong><br>${value}<br>(${percentage})`;
				tooltip.style.display = 'block';
			});
			
			slice.addEventListener('mousemove', (e) => {
				const rect = container.getBoundingClientRect();
				tooltip.style.left = (e.clientX - rect.left + 10) + 'px';
				tooltip.style.top = (e.clientY - rect.top + 10) + 'px';
			});
			
			slice.addEventListener('mouseleave', () => {
				tooltip.style.display = 'none';
			});
		});
	}
	
	create_pie_slice(cx, cy, radius, startAngle, endAngle) {
		const start = this.polar_to_cartesian(cx, cy, radius, endAngle);
		const end = this.polar_to_cartesian(cx, cy, radius, startAngle);
		const largeArc = endAngle - startAngle <= 180 ? '0' : '1';
		
		return [
			'M', cx, cy,
			'L', start.x, start.y,
			'A', radius, radius, 0, largeArc, 0, end.x, end.y,
			'Z'
		].join(' ');
	}
	
	polar_to_cartesian(cx, cy, radius, angle) {
		const rad = (angle - 90) * Math.PI / 180;
		return {
			x: cx + radius * Math.cos(rad),
			y: cy + radius * Math.sin(rad)
		};
	}
	
	render_bar_chart_html() {
		const container = document.getElementById('obs-bar-chart');
		if (!container) return;
		
		// Get top 8 projects for compact view
		const top_count = Math.min(8, this.chart_data.projects.length);
		const top_projects = this.chart_data.projects.slice(0, top_count);
		
		// Get month labels
		const month_labels = this.chart_months.map(month => {
			const [year, mon] = month.split('-');
			const date = new Date(year, parseInt(mon) - 1);
			return date.toLocaleString('en-US', { month: 'short' });
		});
		
		// Calculate totals per month
		const month_totals = this.chart_months.map(month => {
			let total = 0;
			top_projects.forEach(project => {
				total += this.chart_project_data[project][month] || 0;
			});
			return total;
		});
		
		const max_value = Math.max(...month_totals);
		
		let html = '<div class="custom-bar-chart">';
		
		// Create bar chart with SVG
		html += '<div class="bar-chart-svg-container">';
		html += '<svg viewBox="0 0 400 180" class="bar-svg">';
		
		const barWidth = 360 / this.chart_months.length;
		const chartHeight = 140;
		
		this.chart_months.forEach((month, idx) => {
			const x = 20 + (idx * barWidth);
			let currentY = chartHeight;
			
			// Draw stacked bars for each project
			top_projects.forEach((project, proj_idx) => {
				const value = this.chart_project_data[project][month] || 0;
				const height = max_value > 0 ? (value / max_value * chartHeight) : 0;
				
				if (height > 0) {
					const barX = x + (barWidth * 0.2);
					const barW = barWidth * 0.6;
					const color = this.get_chart_color(proj_idx);
					
					html += `<rect x="${barX}" y="${currentY - height}" width="${barW}" height="${height}" 
						fill="${color}" class="bar-rect" rx="2"
						data-project="${project}" data-value="${this.format_currency(value)}" 
						data-month="${month_labels[idx]}"></rect>`;
					
					currentY -= height;
				}
			});
			
			// Month label
			html += `<text x="${x + barWidth/2}" y="165" class="bar-month-label" text-anchor="middle">${month_labels[idx]}</text>`;
		});
		
		html += '</svg></div>';
		
		// Add compact legend
		html += '<div class="bar-legend-compact">';
		top_projects.forEach((project, idx) => {
			const color = this.get_chart_color(idx);
			html += `
				<div class="bar-legend-item-compact">
					<span class="legend-color" style="background-color: ${color};"></span>
					<span class="legend-text">${project}</span>
				</div>
			`;
		});
		html += '</div>';
		
		html += '</div>';
		
		container.innerHTML = html;
		
		// Create tooltip element
		const tooltip = document.createElement('div');
		tooltip.className = 'chart-tooltip';
		tooltip.style.display = 'none';
		container.appendChild(tooltip);
		
		// Add hover tooltips
		container.querySelectorAll('.bar-rect').forEach(rect => {
			rect.addEventListener('mouseenter', (e) => {
				const project = e.target.getAttribute('data-project');
				const value = e.target.getAttribute('data-value');
				const month = e.target.getAttribute('data-month');
				tooltip.innerHTML = `<strong>${month}</strong><br>${project}<br>${value}`;
				tooltip.style.display = 'block';
			});
			
			rect.addEventListener('mousemove', (e) => {
				const containerRect = container.getBoundingClientRect();
				tooltip.style.left = (e.clientX - containerRect.left + 10) + 'px';
				tooltip.style.top = (e.clientY - containerRect.top + 10) + 'px';
			});
			
			rect.addEventListener('mouseleave', () => {
				tooltip.style.display = 'none';
			});
		});
	}
	
	get_chart_color(index) {
		const colors = [
			'#667eea', '#764ba2', '#f093fb', '#4facfe', '#43e97b',
			'#fa709a', '#fee140', '#30cfd0', '#a8edea', '#ff6a88',
			'#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#00d2d3'
		];
		return colors[index % colors.length];
	}
	
	format_number_short(num) {
		if (num >= 10000000) {
			return (num / 10000000).toFixed(1) + 'Cr';
		} else if (num >= 100000) {
			return (num / 100000).toFixed(1) + 'L';
		} else if (num >= 1000) {
			return (num / 1000).toFixed(1) + 'K';
		}
		return num.toFixed(0);
	}

	export_to_excel() {
		if (!this.report_data || !this.report_data.project_data) {
			frappe.msgprint('Please generate the report first');
			return;
		}

		const { months, project_data, month_totals, tax_label } = this.report_data;
		const projects = Object.keys(project_data).sort();

		// Build CSV
		let csv = 'Overall Billing Summary (' + tax_label + ')\n';
		csv += 'From ' + this.format_date_display(this.filters.from_date) + ' To ' + this.format_date_display(this.filters.to_date) + '\n\n';

		// Headers
		csv += 'Project';
		months.forEach(month => {
			const [year, mon] = month.split('-');
			const date = new Date(year, parseInt(mon) - 1);
			csv += ',' + date.toLocaleString('en-US', { month: 'short', year: 'numeric' });
		});
		csv += ',Total\n';

		// Data rows
		projects.forEach(project => {
			csv += project;
			let row_total = 0;
			months.forEach(month => {
				const value = project_data[project][month] || 0;
				row_total += value;
				csv += ',' + (value || '');
			});
			csv += ',' + row_total + '\n';
		});

		// Total row
		csv += 'Total';
		let grand_total = 0;
		months.forEach(month => {
			const value = month_totals[month] || 0;
			grand_total += value;
			csv += ',' + value;
		});
		csv += ',' + grand_total + '\n';

		// Download
		const blob = new Blob([csv], { type: 'text/csv' });
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'Overall_Billing_Summary_' + frappe.datetime.now_date() + '.csv';
		a.click();
		window.URL.revokeObjectURL(url);
	}
}
