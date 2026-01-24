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
		`;

		this.parent.find('.bve-report-content').html(report_html);
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

		const content = report_content.innerHTML;

		const printWindow = window.open('', '_blank');
		printWindow.document.write(`
			<!DOCTYPE html>
			<html>
			<head>
				<meta charset="utf-8">
				<title>Billing Vs Expenses - Project Wise</title>
				<style>
					body {
						font-family: Arial, sans-serif;
						font-size: 12px;
						color: #111;
						margin: 20px;
					}
					table {
						width: 100%;
						border-collapse: collapse;
						margin-top: 15px;
					}
					th, td {
						border: 1px solid #333;
						padding: 8px;
						vertical-align: middle;
					}
					th {
						background-color: #f4f6f8;
						font-weight: 600;
						text-align: center;
					}
					td {
						text-align: right;
					}
					.project {
						text-align: left;
						font-weight: 600;
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
					@media print {
						body { margin: 10mm; }
						@page { size: A4 landscape; margin: 10mm; }
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
