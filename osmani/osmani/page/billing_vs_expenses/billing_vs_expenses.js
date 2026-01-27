frappe.pages['billing-vs-expenses'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Billing Vs Expenses',
		single_column: true
	});

	new BillingVsExpensesReport(page);
};

class BillingVsExpensesReport {
	constructor(page) {
		this.page = page;
		this.parent = $(this.page.body);
		this.filters = {
			from_date: frappe.datetime.add_months(frappe.datetime.get_today(), -3),
			to_date: frappe.datetime.get_today(),
			projects: [],
			include_tax: false
		};
		
		this.make();
	}

	make() {
		this.parent.html(`
			<div class="billing-vs-expenses-report" style="padding: 20px;">
				<div class="report-filters" style="background: white; padding: 20px; margin-bottom: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
					<div class="row">
						<div class="col-sm-2">
							<div class="bve-from-date-field"></div>
						</div>
						<div class="col-sm-2">
							<div class="bve-to-date-field"></div>
						</div>
						<div class="col-sm-3">
							<div class="bve-project-field"></div>
						</div>
						<div class="col-sm-2">
							<div class="bve-tax-field"></div>
						</div>
						<div class="col-sm-3" style="padding-top: 22px;">
							<button class="btn btn-primary btn-sm bve-generate-btn" title="Generate Report">
								<i class="fa fa-refresh"></i>
							</button>
							<button class="btn btn-success btn-sm bve-export-btn" style="margin-left: 5px;" title="Export to Excel">
								<i class="fa fa-file-excel-o"></i> Excel
							</button>
							<button class="btn btn-default btn-sm bve-print-btn" style="margin-left: 5px;" title="Print Report">
								<i class="fa fa-print"></i>
							</button>
						</div>
					</div>
				</div>
				<div class="bve-report-content" style="background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); min-height: 400px;">
					<div style="text-align: center; padding: 60px; color: #888;">
						<p><i class="fa fa-spinner fa-spin fa-2x"></i></p>
						<p style="margin-top: 15px;">Loading...</p>
					</div>
				</div>
			</div>
		`);

		this.setup_filters();
		this.bind_events();
		
		// Auto generate report after a short delay
		setTimeout(() => this.generate_report(), 800);
	}

	setup_filters() {
		const me = this;

		// From Date Field
		this.from_date_field = frappe.ui.form.make_control({
			parent: this.parent.find('.bve-from-date-field'),
			df: {
				fieldtype: 'Date',
				label: 'From Date',
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
			parent: this.parent.find('.bve-to-date-field'),
			df: {
				fieldtype: 'Date',
				label: 'To Date',
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
			parent: this.parent.find('.bve-project-field'),
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
		
		// Load all projects initially (no status filter - show all)
		frappe.db.get_list('Project', {
			fields: ['name'],
			limit: 0,
			order_by: 'name'
		}).then(projects => {
			// MultiSelectList doesn't have set_data, it uses get_data callback
			// Just refresh to trigger the get_data
			if (me.project_field) {
				me.project_field.refresh();
			}
		});
		
		this.project_field.set_value([]);

		// Include Tax Checkbox
		this.tax_field = frappe.ui.form.make_control({
			parent: this.parent.find('.bve-tax-field'),
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
	}

	bind_events() {
		const me = this;

		this.parent.find('.bve-generate-btn').on('click', function() {
			me.filters.from_date = me.from_date_field.get_value();
			me.filters.to_date = me.to_date_field.get_value();
			me.filters.projects = me.project_field.get_value() || [];
			me.filters.include_tax = me.tax_field.get_value() ? true : false;
			
			if (!me.filters.from_date || !me.filters.to_date) {
				frappe.msgprint(__('Please select both dates'));
				return;
			}

			me.generate_report();
		});

		this.parent.find('.bve-export-btn').on('click', function() {
			me.export_to_excel();
		});

		this.parent.find('.bve-print-btn').on('click', function() {
			me.print_report();
		});
	}

	generate_report() {
		const me = this;
		
		this.parent.find('.bve-report-content').html(`
			<div style="text-align: center; padding: 60px; color: #888;">
				<p><i class="fa fa-spinner fa-spin fa-2x"></i></p>
				<p style="margin-top: 15px;">Generating report...</p>
			</div>
		`);

		// Call server-side method to get GL entries
		frappe.call({
			method: 'osmani.osmani.page.billing_vs_expenses.billing_vs_expenses.get_gl_entries_for_projects',
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
				
				me.render_report_from_gl(gl_entries);
			}
		});
	}

	render_report_from_gl(gl_entries) {
		const months = this.get_months_between(this.filters.from_date, this.filters.to_date);
		const project_data = {};

		// Determine tax label
		const tax_label = this.filters.include_tax ? 'Incl. ST' : 'Excl. ST';
		
		// Store report data for export
		this.report_data = { months, project_data, tax_label };

		console.log('Months to display:', months);
		console.log('Processing', gl_entries.length, 'GL entries');

		// Process GL Entries - EXACT same logic as Profitability Analysis (line 111-114)
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
			
			// Skip if not Income or Expense
			if (type !== 'Income' && type !== 'Expense') return;
			
			if (!project_data[project]) {
				project_data[project] = {};
			}

			const month_key = posting_date.substr(0, 7); // YYYY-MM
			
			if (!project_data[project][month_key]) {
				project_data[project][month_key] = { billing: 0, expense: 0 };
			}

			// EXACT logic from Profitability Analysis (lines 111-114)
			if (type === 'Income') {
				project_data[project][month_key].billing += (credit - debit);
			}
			if (type === 'Expense') {
				project_data[project][month_key].expense += (debit - credit);
			}
			
			console.log('Entry:', project, month_key, type, 'Debit:', debit, 'Credit:', credit);
		});

		// Update stored report data with processed project_data
		this.report_data.project_data = project_data;

		console.log('Final project_data:', project_data);

		const projects = Object.keys(project_data).sort();

		if (projects.length === 0) {
			this.parent.find('.bve-report-content').html(`
				<div style="text-align: center; padding: 60px; color: #888;">
					<p><i class="fa fa-exclamation-triangle fa-2x"></i></p>
					<p style="margin-top: 15px;">No data found for the selected filters</p>
				</div>
			`);
			return;
		}

		this.render_table(months, project_data, projects, tax_label);
	}

	render_report(sales_data, purchase_data) {
		const months = this.get_months_between(this.filters.from_date, this.filters.to_date);
		const project_data = {};

		// Filter by selected projects if any
		const selected_projects = this.filters.projects;
		
		// Determine tax label
		const tax_label = this.filters.include_tax ? 'Incl. ST' : 'Excl. ST';
		
		// Store report data for export
		this.report_data = { months, project_data, tax_label };

		console.log('Months to display:', months);
		console.log('Selected projects:', selected_projects);

		// Process sales data
		sales_data.forEach(inv => {
			// Skip return invoices (double check)
			if (inv.is_return) return;
			// Skip if no project
			if (!inv.project) return;
			
			if (!project_data[inv.project]) {
				project_data[inv.project] = {};
			}

			const month_key = inv.posting_date.substr(0, 7); // YYYY-MM
			
			if (!project_data[inv.project][month_key]) {
				project_data[inv.project][month_key] = { billing: 0, expense: 0 };
			}

			// Use grand_total if include_tax is true, otherwise use net_total
			const amount = this.filters.include_tax ? (inv.grand_total || 0) : (inv.net_total || 0);
			project_data[inv.project][month_key].billing += amount;
			
			console.log('Sales Invoice:', inv.name, 'Project:', inv.project, 'Month:', month_key, 'Amount:', amount);
		});

		// Process purchase data
		purchase_data.forEach(inv => {
			// Skip return invoices (double check)
			if (inv.is_return) return;
			// Skip if no project
			if (!inv.project) return;
			
			if (!project_data[inv.project]) {
				project_data[inv.project] = {};
			}

			const month_key = inv.posting_date.substr(0, 7); // YYYY-MM
			
			if (!project_data[inv.project][month_key]) {
				project_data[inv.project][month_key] = { billing: 0, expense: 0 };
			}

			project_data[inv.project][month_key].expense += (inv.grand_total || 0);
			
			console.log('Purchase Invoice:', inv.name, 'Project:', inv.project, 'Month:', month_key, 'Amount:', inv.grand_total);
		});

		// Update stored report data with processed project_data
		this.report_data.project_data = project_data;

		console.log('Final project_data:', project_data);

		const projects = Object.keys(project_data).sort();

		if (projects.length === 0) {
			this.parent.find('.bve-report-content').html(`
				<div style="text-align: center; padding: 60px; color: #888;">
					<p><i class="fa fa-exclamation-triangle fa-2x"></i></p>
					<p style="margin-top: 15px;">No data found for the selected filters</p>
				</div>
			`);
			return;
		}

		this.render_table(months, project_data, projects, tax_label);
	}

	render_table(months, project_data, projects, tax_label) {
		// Generate month headers
		const month_headers = months.map(m => `<th colspan="2">${m.label}</th>`).join('');
		const month_subheaders = months.map(() => `<th>Billing</th><th>Expense</th>`).join('');

		// Initialize grand totals
		const grand_totals = {
			billing_by_month: {},
			expense_by_month: {},
			total_billing: 0,
			total_expense: 0
		};

		months.forEach(m => {
			grand_totals.billing_by_month[m.key] = 0;
			grand_totals.expense_by_month[m.key] = 0;
		});

		// Generate project rows
		const project_rows = projects.map(project => {
			const project_totals = { billing: 0, expense: 0 };

			const month_cells = months.map(m => {
				const data_point = project_data[project][m.key] || { billing: 0, expense: 0 };
				project_totals.billing += data_point.billing;
				project_totals.expense += data_point.expense;
				
				grand_totals.billing_by_month[m.key] += data_point.billing;
				grand_totals.expense_by_month[m.key] += data_point.expense;

				return `
					<td>${this.format_currency(data_point.billing)}</td>
					<td>${this.format_currency(data_point.expense)}</td>
				`;
			}).join('');

			const difference = project_totals.billing - project_totals.expense;
			const diff_class = difference > 0 ? 'positive' : (difference < 0 ? 'negative' : '');
			let diff_display = '';
			if (difference !== 0) {
				diff_display = (difference < 0 ? '-' : '') + this.format_currency(Math.abs(difference));
			}

			grand_totals.total_billing += project_totals.billing;
			grand_totals.total_expense += project_totals.expense;

			return `
				<tr>
					<td class="project">${project}</td>
					${month_cells}
					<td class="total-col">${this.format_currency(project_totals.billing)}</td>
					<td class="total-col">${this.format_currency(project_totals.expense)}</td>
					<td class="${diff_class}">${diff_display}</td>
				</tr>
			`;
		}).join('');

		// Generate grand total row
		const grand_month_cells = months.map(m => `
			<td>${this.format_currency(grand_totals.billing_by_month[m.key])}</td>
			<td>${this.format_currency(grand_totals.expense_by_month[m.key])}</td>
		`).join('');

		const grand_difference = grand_totals.total_billing - grand_totals.total_expense;
		const grand_diff_class = grand_difference > 0 ? 'positive' : (grand_difference < 0 ? 'negative' : '');
		let grand_diff_display = '';
		if (grand_difference !== 0) {
			grand_diff_display = (grand_difference < 0 ? '-' : '') + this.format_currency(Math.abs(grand_difference));
		}

		// Store data for charts
		this.store_chart_data(months, project_data, projects, grand_totals);
		
		const report_html = `
			<div class="report-header" style="text-align: center; margin-bottom: 20px;">
				<h1 style="font-size: 18px; margin: 0; font-weight: 700;">OCL ERP Reports</h1>
				<h2 style="font-size: 14px; margin: 6px 0; font-weight: 600;">Billing (${tax_label}) Vs Expenses (Project Wise)</h2>
				<h3 style="font-size: 12px; margin: 4px 0; font-weight: 500;">From ${this.format_date_display(this.filters.from_date)} To ${this.format_date_display(this.filters.to_date)}</h3>
			</div>

			<div class="report-meta" style="text-align: right; font-size: 11px; margin-bottom: 20px;">
				Report on : <strong>${this.format_datetime_display()}</strong>
			</div>

			<div style="overflow-x: auto;">
				<table class="table table-bordered" style="width: 100%; font-size: 12px;">
					<thead>
						<tr>
							<th rowspan="2" style="background-color: #f4f6f8; font-weight: 600; text-align: center;">Project</th>
							${month_headers}
							<th colspan="3" style="background-color: #f4f6f8; font-weight: 600; text-align: center;">Total</th>
						</tr>
						<tr>
							${month_subheaders}
							<th style="background-color: #f4f6f8; font-weight: 600; text-align: center;">Billing</th>
							<th style="background-color: #f4f6f8; font-weight: 600; text-align: center;">Expense</th>
							<th style="background-color: #f4f6f8; font-weight: 600; text-align: center;">Difference</th>
						</tr>
					</thead>
					<tbody>
						${project_rows}
					</tbody>
					<tfoot>
						<tr style="background-color: #e9ecef; font-weight: 700;">
							<td class="project" style="text-align: left; font-weight: 700;">Total</td>
							${grand_month_cells}
							<td style="text-align: right;">${this.format_currency(grand_totals.total_billing)}</td>
							<td style="text-align: right;">${this.format_currency(grand_totals.total_expense)}</td>
							<td class="${grand_diff_class}" style="text-align: right;">${grand_diff_display}</td>
						</tr>
					</tfoot>
				</table>
			</div>

			<style>
				.project { text-align: left; font-weight: 600; }
				.total-col { background-color: #fafafa; font-weight: 600; text-align: right; }
				.positive { color: #0a7a2f; font-weight: 600; }
				.negative { color: #c0392b; font-weight: 600; }
				td { text-align: right; }
			</style>
			
			<div class="bve-charts-section">
				<div class="charts-row">
					<div class="chart-container">
						<h4 class="chart-title">Project-wise Billing vs Expenses (3D)</h4>
						<div id="bve-3d-bar-chart"></div>
					</div>
					<div class="chart-container">
						<h4 class="chart-title">Monthly Trend: Billing vs Expenses</h4>
						<div id="bve-line-chart"></div>
					</div>
				</div>
				<div class="charts-row" style="margin-top: 15px;">
					<div class="chart-container">
						<h4 class="chart-title">Top Projects by Profit Margin</h4>
						<div id="bve-profit-chart"></div>
					</div>
					<div class="chart-container">
						<h4 class="chart-title">Billing vs Expenses Distribution</h4>
						<div id="bve-donut-chart"></div>
					</div>
				</div>
			</div>
		`;

		this.parent.find('.bve-report-content').html(report_html);
		
		// Render charts
		setTimeout(() => this.render_charts(), 100);
	}
	
	store_chart_data(months, project_data, projects, grand_totals) {
		// Calculate project totals for charts
		const project_chart_data = [];
		
		projects.forEach(project => {
			let billing = 0;
			let expense = 0;
			
			months.forEach(m => {
				const data = project_data[project][m.key] || { billing: 0, expense: 0 };
				billing += data.billing;
				expense += data.expense;
			});
			
			project_chart_data.push({
				project,
				billing,
				expense,
				profit: billing - expense
			});
		});
		
		// Sort by profit descending
		project_chart_data.sort((a, b) => b.profit - a.profit);
		
		this.chart_data = {
			projects: project_chart_data,
			months,
			project_data,
			grand_totals
		};
	}
	
	render_charts() {
		if (!this.chart_data) return;
		
		this.render_3d_bar_chart();
		this.render_line_chart();
		this.render_profit_chart();
		this.render_donut_chart();
	}
	
	render_3d_bar_chart() {
		const container = document.getElementById('bve-3d-bar-chart');
		if (!container) return;
		
		// Get top 8 projects
		const top_projects = this.chart_data.projects.slice(0, 8);
		
		// Find max value for scaling
		let max_value = 0;
		top_projects.forEach(p => {
			max_value = Math.max(max_value, p.billing, p.expense);
		});
		
		let html = '<div class="custom-3d-bar-chart">';
		html += '<svg viewBox="0 0 500 220" class="bar-svg-3d">';
		
		const barWidth = 50;
		const spacing = 60;
		const chartHeight = 140;
		const startX = 40;
		
		top_projects.forEach((proj, idx) => {
			const x = startX + (idx * spacing);
			const billingHeight = (proj.billing / max_value) * chartHeight;
			const expenseHeight = (proj.expense / max_value) * chartHeight;
			
			// 3D Billing bar
			const billingY = 160 - billingHeight;
			html += this.create_3d_bar(x, billingY, 20, billingHeight, '#4CAF50', proj.project, 'Billing', this.format_currency(proj.billing));
			
			// 3D Expense bar
			const expenseY = 160 - expenseHeight;
			html += this.create_3d_bar(x + 22, expenseY, 20, expenseHeight, '#FF5722', proj.project, 'Expense', this.format_currency(proj.expense));
			
			// Project label
			html += `<text x="${x + 20}" y="185" class="bar-label-3d" text-anchor="middle" transform="rotate(-45 ${x + 20} 185)">${this.truncate_text(proj.project, 12)}</text>`;
		});
		
		// Legend
		html += `<rect x="50" y="10" width="15" height="15" fill="#4CAF50" class="legend-rect-3d"/>`;
		html += `<text x="70" y="22" class="legend-text-3d">Billing</text>`;
		html += `<rect x="140" y="10" width="15" height="15" fill="#FF5722" class="legend-rect-3d"/>`;
		html += `<text x="160" y="22" class="legend-text-3d">Expense</text>`;
		
		html += '</svg></div>';
		
		container.innerHTML = html;
		this.add_tooltip_events(container);
	}
	
	create_3d_bar(x, y, width, height, color, project, type, value) {
		if (height < 1) return '';
		
		// Calculate darker shade for 3D effect
		const darkColor = this.darken_color(color, 30);
		const lightColor = this.lighten_color(color, 10);
		
		return `
			<g class="bar-3d" data-project="${project}" data-type="${type}" data-value="${value}">
				<!-- Front face -->
				<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${color}" stroke="#fff" stroke-width="0.5"/>
				<!-- Top face (3D) -->
				<polygon points="${x},${y} ${x + width},${y} ${x + width + 5},${y - 5} ${x + 5},${y - 5}" fill="${lightColor}" stroke="#fff" stroke-width="0.5"/>
				<!-- Right face (3D) -->
				<polygon points="${x + width},${y} ${x + width},${y + height} ${x + width + 5},${y + height - 5} ${x + width + 5},${y - 5}" fill="${darkColor}" stroke="#fff" stroke-width="0.5"/>
			</g>
		`;
	}
	
	render_line_chart() {
		const container = document.getElementById('bve-line-chart');
		if (!container) return;
		
		const months = this.chart_data.months;
		const grand_totals = this.chart_data.grand_totals;
		
		// Get monthly totals
		const billing_values = months.map(m => grand_totals.billing_by_month[m.key]);
		const expense_values = months.map(m => grand_totals.expense_by_month[m.key]);
		
		const max_value = Math.max(...billing_values, ...expense_values);
		
		let html = '<div class="custom-line-chart">';
		html += '<svg viewBox="0 0 450 200" class="line-svg">';
		
		const chartHeight = 140;
		const chartWidth = 380;
		const startX = 40;
		const startY = 150;
		const pointSpacing = chartWidth / (months.length - 1);
		
		// Grid lines
		for (let i = 0; i <= 4; i++) {
			const y = startY - (i * chartHeight / 4);
			html += `<line x1="${startX}" y1="${y}" x2="${startX + chartWidth}" y2="${y}" stroke="#e0e0e0" stroke-width="0.5"/>`;
		}
		
		// Billing line
		let billingPath = `M ${startX},${startY - (billing_values[0] / max_value * chartHeight)}`;
		billing_values.forEach((val, idx) => {
			if (idx > 0) {
				const x = startX + (idx * pointSpacing);
				const y = startY - (val / max_value * chartHeight);
				billingPath += ` L ${x},${y}`;
			}
		});
		html += `<path d="${billingPath}" fill="none" stroke="#4CAF50" stroke-width="3" class="line-path"/>`;
		
		// Expense line
		let expensePath = `M ${startX},${startY - (expense_values[0] / max_value * chartHeight)}`;
		expense_values.forEach((val, idx) => {
			if (idx > 0) {
				const x = startX + (idx * pointSpacing);
				const y = startY - (val / max_value * chartHeight);
				expensePath += ` L ${x},${y}`;
			}
		});
		html += `<path d="${expensePath}" fill="none" stroke="#FF5722" stroke-width="3" class="line-path"/>`;
		
		// Points and labels
		billing_values.forEach((val, idx) => {
			const x = startX + (idx * pointSpacing);
			const y = startY - (val / max_value * chartHeight);
			html += `<circle cx="${x}" cy="${y}" r="4" fill="#4CAF50" stroke="white" stroke-width="2" class="line-point" 
				data-month="${months[idx].label}" data-type="Billing" data-value="${this.format_currency(val)}"/>`;
		});
		
		expense_values.forEach((val, idx) => {
			const x = startX + (idx * pointSpacing);
			const y = startY - (val / max_value * chartHeight);
			html += `<circle cx="${x}" cy="${y}" r="4" fill="#FF5722" stroke="white" stroke-width="2" class="line-point" 
				data-month="${months[idx].label}" data-type="Expense" data-value="${this.format_currency(val)}"/>`;
		});
		
		// Month labels
		months.forEach((month, idx) => {
			const x = startX + (idx * pointSpacing);
			html += `<text x="${x}" y="175" class="month-label-line" text-anchor="middle">${month.label}</text>`;
		});
		
		// Legend
		html += `<line x1="50" y1="15" x2="80" y2="15" stroke="#4CAF50" stroke-width="3"/>`;
		html += `<text x="85" y="20" class="legend-text-3d">Billing</text>`;
		html += `<line x1="150" y1="15" x2="180" y2="15" stroke="#FF5722" stroke-width="3"/>`;
		html += `<text x="185" y="20" class="legend-text-3d">Expense</text>`;
		
		html += '</svg></div>';
		
		container.innerHTML = html;
		this.add_tooltip_events(container);
	}
	
	render_profit_chart() {
		const container = document.getElementById('bve-profit-chart');
		if (!container) return;
		
		// Get top 10 by profit
		const top_projects = this.chart_data.projects
			.filter(p => p.profit > 0)
			.slice(0, 10);
		
		if (top_projects.length === 0) {
			container.innerHTML = '<div style="text-align: center; padding: 60px; color: #888;">No profitable projects</div>';
			return;
		}
		
		const max_profit = Math.max(...top_projects.map(p => p.profit));
		
		let html = '<div class="profit-bar-chart">';
		
		top_projects.forEach((proj, idx) => {
			const percentage = (proj.profit / max_profit) * 100;
			const color = this.get_chart_color(idx);
			
			html += `
				<div class="profit-bar-item">
					<div class="profit-bar-wrapper">
						<div class="profit-bar-fill" style="width: ${percentage}%; background: linear-gradient(90deg, ${color}, ${this.lighten_color(color, 20)});"
							data-project="${proj.project}" data-value="${this.format_currency(proj.profit)}">
							<span class="profit-project-name">${this.truncate_text(proj.project, 25)}</span>
							<span class="profit-value">${this.format_currency(proj.profit)}</span>
						</div>
					</div>
				</div>
			`;
		});
		
		html += '</div>';
		
		container.innerHTML = html;
		this.add_tooltip_events(container);
	}
	
	render_donut_chart() {
		const container = document.getElementById('bve-donut-chart');
		if (!container) return;
		
		const total_billing = this.chart_data.grand_totals.total_billing;
		const total_expense = this.chart_data.grand_totals.total_expense;
		const total = total_billing + total_expense;
		
		const billing_percentage = (total_billing / total) * 100;
		const expense_percentage = (total_expense / total) * 100;
		
		// Create donut chart
		let html = '<div class="custom-donut-chart">';
		html += '<svg viewBox="0 0 200 200" class="donut-svg">';
		
		const radius = 70;
		const innerRadius = 45;
		const cx = 100;
		const cy = 100;
		
		// Billing arc
		const billingPath = this.create_donut_arc(cx, cy, radius, innerRadius, 0, billing_percentage * 3.6);
		html += `<path d="${billingPath}" fill="#4CAF50" class="donut-slice" 
			data-label="Billing" data-value="${this.format_currency(total_billing)}" data-percentage="${billing_percentage.toFixed(1)}%"/>`;
		
		// Expense arc
		const expensePath = this.create_donut_arc(cx, cy, radius, innerRadius, billing_percentage * 3.6, 360);
		html += `<path d="${expensePath}" fill="#FF5722" class="donut-slice" 
			data-label="Expense" data-value="${this.format_currency(total_expense)}" data-percentage="${expense_percentage.toFixed(1)}%"/>`;
		
		// Center text
		html += `<text x="${cx}" y="${cy - 5}" text-anchor="middle" class="donut-center-label">Total</text>`;
		html += `<text x="${cx}" y="${cy + 10}" text-anchor="middle" class="donut-center-value">${this.format_currency(total)}</text>`;
		
		html += '</svg>';
		
		// Legend
		html += '<div class="donut-legend">';
		html += `<div class="donut-legend-item">
			<span class="legend-color" style="background: #4CAF50;"></span>
			<span>Billing: ${billing_percentage.toFixed(1)}%</span>
		</div>`;
		html += `<div class="donut-legend-item">
			<span class="legend-color" style="background: #FF5722;"></span>
			<span>Expense: ${expense_percentage.toFixed(1)}%</span>
		</div>`;
		html += '</div>';
		
		html += '</div>';
		
		container.innerHTML = html;
		this.add_tooltip_events(container);
	}
	
	create_donut_arc(cx, cy, radius, innerRadius, startAngle, endAngle) {
		const start = this.polar_to_cartesian(cx, cy, radius, endAngle);
		const end = this.polar_to_cartesian(cx, cy, radius, startAngle);
		const innerStart = this.polar_to_cartesian(cx, cy, innerRadius, endAngle);
		const innerEnd = this.polar_to_cartesian(cx, cy, innerRadius, startAngle);
		const largeArc = endAngle - startAngle <= 180 ? '0' : '1';
		
		return [
			'M', start.x, start.y,
			'A', radius, radius, 0, largeArc, 0, end.x, end.y,
			'L', innerEnd.x, innerEnd.y,
			'A', innerRadius, innerRadius, 0, largeArc, 1, innerStart.x, innerStart.y,
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
	
	add_tooltip_events(container) {
		const tooltip = document.createElement('div');
		tooltip.className = 'chart-tooltip';
		tooltip.style.display = 'none';
		container.appendChild(tooltip);
		
		const showTooltip = (e) => {
			const target = e.target.closest('[data-project], [data-month], [data-label]');
			if (!target) return;
			
			let text = '';
			if (target.dataset.project) {
				text = `<strong>${target.dataset.project}</strong><br>${target.dataset.type}: ${target.dataset.value}`;
			} else if (target.dataset.month) {
				text = `<strong>${target.dataset.month}</strong><br>${target.dataset.type}: ${target.dataset.value}`;
			} else if (target.dataset.label) {
				text = `<strong>${target.dataset.label}</strong><br>${target.dataset.value}<br>(${target.dataset.percentage})`;
			}
			
			tooltip.innerHTML = text;
			tooltip.style.display = 'block';
		};
		
		const moveTooltip = (e) => {
			const rect = container.getBoundingClientRect();
			tooltip.style.left = (e.clientX - rect.left + 10) + 'px';
			tooltip.style.top = (e.clientY - rect.top + 10) + 'px';
		};
		
		const hideTooltip = () => {
			tooltip.style.display = 'none';
		};
		
		container.addEventListener('mouseenter', showTooltip, true);
		container.addEventListener('mousemove', moveTooltip, true);
		container.addEventListener('mouseleave', hideTooltip, true);
	}
	
	truncate_text(text, maxLength) {
		if (text.length <= maxLength) return text;
		return text.substring(0, maxLength) + '...';
	}
	
	darken_color(color, percent) {
		const num = parseInt(color.replace('#', ''), 16);
		const amt = Math.round(2.55 * percent);
		const R = (num >> 16) - amt;
		const G = (num >> 8 & 0x00FF) - amt;
		const B = (num & 0x0000FF) - amt;
		return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
			(G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
			(B < 255 ? B < 1 ? 0 : B : 255))
			.toString(16).slice(1);
	}
	
	lighten_color(color, percent) {
		const num = parseInt(color.replace('#', ''), 16);
		const amt = Math.round(2.55 * percent);
		const R = (num >> 16) + amt;
		const G = (num >> 8 & 0x00FF) + amt;
		const B = (num & 0x0000FF) + amt;
		return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
			(G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
			(B < 255 ? B < 1 ? 0 : B : 255))
			.toString(16).slice(1);
	}
	
	get_chart_color(index) {
		const colors = [
			'#667eea', '#764ba2', '#f093fb', '#4facfe', '#43e97b',
			'#fa709a', '#fee140', '#30cfd0', '#a8edea', '#ff6a88',
			'#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#00d2d3'
		];
		return colors[index % colors.length];
	}

	get_months_between(from_date, to_date) {
		const months = [];
		
		// Parse dates properly
		const start = frappe.datetime.str_to_obj(from_date);
		const end = frappe.datetime.str_to_obj(to_date);

		// Start from the first day of the from_date month
		let current = new Date(start.getFullYear(), start.getMonth(), 1);
		const last = new Date(end.getFullYear(), end.getMonth(), 1);

		while (current <= last) {
			// Format as YYYY-MM for consistency
			const year = current.getFullYear();
			const month = String(current.getMonth() + 1).padStart(2, '0');
			const month_key = `${year}-${month}`;
			
			// Format label as "Jan-2025"
			const month_label = current.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
			
			months.push({ key: month_key, label: month_label });
			
			// Move to next month
			current.setMonth(current.getMonth() + 1);
		}

		console.log('Months calculated:', months);
		return months;
	}

	format_currency(value) {
		// Return empty string for zero values
		if (value === 0 || value === null || value === undefined) {
			return '';
		}
		return value.toLocaleString('en-IN', {
			maximumFractionDigits: 0,
			minimumFractionDigits: 0
		});
	}

	format_date_display(date_str) {
		// Format: 01-JAN-2026
		const date = new Date(date_str);
		const day = String(date.getDate()).padStart(2, '0');
		const month = date.toLocaleString('en-US', { month: 'short' }).toUpperCase();
		const year = date.getFullYear();
		return `${day}-${month}-${year}`;
	}

	format_datetime_display() {
		// Format: 01-JAN-2026 14:51:15
		const now = new Date();
		const day = String(now.getDate()).padStart(2, '0');
		const month = now.toLocaleString('en-US', { month: 'short' }).toUpperCase();
		const year = now.getFullYear();
		const hours = String(now.getHours()).padStart(2, '0');
		const minutes = String(now.getMinutes()).padStart(2, '0');
		const seconds = String(now.getSeconds()).padStart(2, '0');
		return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
	}

	export_to_excel() {
		if (!this.report_data) {
			frappe.msgprint(__('Please generate report first'));
			return;
		}

		const { months, project_data, tax_label } = this.report_data;
		const projects = Object.keys(project_data).sort();

		if (projects.length === 0) {
			frappe.msgprint(__('No data to export'));
			return;
		}

		// Create CSV content
		let csv = '\uFEFF'; // UTF-8 BOM for Excel compatibility
		
		// Header
		csv += `OCL ERP Reports\n`;
		csv += `Billing (${tax_label}) Vs Expenses (Project Wise)\n`;
		csv += `From ${this.format_date_display(this.filters.from_date)} To ${this.format_date_display(this.filters.to_date)}\n`;
		csv += `Report Generated: ${this.format_datetime_display()}\n\n`;

		// Table headers
		csv += 'Project,';
		months.forEach(m => {
			csv += `${m.label} Billing,${m.label} Expense,`;
		});
		csv += 'Total Billing,Total Expense,Difference\n';

		// Initialize grand totals
		const grand_totals = {
			billing_by_month: {},
			expense_by_month: {},
			total_billing: 0,
			total_expense: 0
		};

		months.forEach(m => {
			grand_totals.billing_by_month[m.key] = 0;
			grand_totals.expense_by_month[m.key] = 0;
		});

		// Project rows
		projects.forEach(project => {
			const project_totals = { billing: 0, expense: 0 };
			csv += `"${project}",`;

			months.forEach(m => {
				const data_point = project_data[project][m.key] || { billing: 0, expense: 0 };
				project_totals.billing += data_point.billing;
				project_totals.expense += data_point.expense;
				
				grand_totals.billing_by_month[m.key] += data_point.billing;
				grand_totals.expense_by_month[m.key] += data_point.expense;

				csv += `${data_point.billing || ''},${data_point.expense || ''},`;
			});

			const difference = project_totals.billing - project_totals.expense;
			grand_totals.total_billing += project_totals.billing;
			grand_totals.total_expense += project_totals.expense;

			csv += `${project_totals.billing || ''},${project_totals.expense || ''},${difference || ''}\n`;
		});

		// Grand total row
		csv += 'Total,';
		months.forEach(m => {
			csv += `${grand_totals.billing_by_month[m.key] || ''},${grand_totals.expense_by_month[m.key] || ''},`;
		});
		const grand_difference = grand_totals.total_billing - grand_totals.total_expense;
		csv += `${grand_totals.total_billing},${grand_totals.total_expense},${grand_difference}\n`;

		// Create download link
		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
		const link = document.createElement('a');
		const url = URL.createObjectURL(blob);
		
		const filename = `Billing_vs_Expenses_${this.format_date_display(frappe.datetime.nowdate())}.csv`;
		link.setAttribute('href', url);
		link.setAttribute('download', filename);
		link.style.visibility = 'hidden';
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);

		frappe.show_alert({
			message: __('Report exported successfully'),
			indicator: 'green'
		}, 3);
	}

	print_report() {
		const report_content = this.parent.find('.bve-report-content')[0];
		if (!report_content || !report_content.querySelector('table')) {
			frappe.msgprint(__('Please generate report first'));
			return;
		}

		// Clone the content and remove charts section
		const clone = report_content.cloneNode(true);
		const chartsSection = clone.querySelector('.bve-charts-section');
		if (chartsSection) {
			chartsSection.remove();
		}
		
		const content = clone.innerHTML;

		const printWindow = window.open('', '_blank');
		printWindow.document.write(`
			<!DOCTYPE html>
			<html>
			<head>
				<meta charset="utf-8">
				<title>Billing Vs Expenses - Project Wise</title>
				<style>
					@page {
						size: landscape;
						margin: 15mm;
					}
					
					body {
						font-family: Arial, sans-serif;
						font-size: 9px;
						color: #000;
						margin: 0;
						padding: 0;
						width: 100%;
						max-width: 100%;
					}
					
					.report-header {
						text-align: center;
						margin-bottom: 15px;
					}
					
					.report-header h1 {
						font-size: 14px;
						margin: 0;
						font-weight: 700;
						color: #000;
					}
					
					.report-header h2 {
						font-size: 12px;
						margin: 5px 0;
						font-weight: 600;
						color: #000;
					}
					
					.report-header h3 {
						font-size: 10px;
						margin: 3px 0;
						font-weight: 500;
						color: #000;
					}
					
					.report-meta {
						text-align: right;
						font-size: 9px;
						margin-bottom: 10px;
						color: #000;
					}
					
					table {
						width: 100%;
						border-collapse: collapse;
						margin-top: 10px;
						font-size: 8px;
					}
					
					th, td {
						border: 1px solid #333;
						padding: 4px 6px;
						vertical-align: middle;
					}
					
					th {
						background-color: #f4f6f8;
						font-weight: 600;
						text-align: center;
						color: #000;
					}
					
					td {
						text-align: right;
						color: #000;
					}
					
					.project {
						text-align: left;
						font-weight: 600;
						color: #000;
					}
					
					.total-col {
						background-color: #fafafa;
						font-weight: 600;
					}
					
					.positive {
						color: #0a7a2f;
						font-weight: 600;
					}
					
					.negative {
						color: #c0392b;
						font-weight: 600;
					}
					
					tfoot tr {
						background-color: #e9ecef;
						font-weight: 700;
					}
					
					tfoot td {
						font-weight: 700;
						color: #000;
					}
					
					/* Hide any charts if present */
					.bve-charts-section {
						display: none !important;
					}
					
					/* Ensure content fits page */
					* {
						box-sizing: border-box;
					}
				</style>
			</head>
			<body>
				${content}
			</body>
			</html>
		`);
		printWindow.document.close();
		printWindow.focus();
		setTimeout(() => {
			printWindow.print();
		}, 250);
	}
}
