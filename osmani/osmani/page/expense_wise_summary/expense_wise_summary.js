frappe.pages['expense-wise-summary'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Expense Wise Summary',
		single_column: true
	});

	new ExpenseWiseSummaryReport(page);
}

class ExpenseWiseSummaryReport {
	constructor(page) {
		this.page = page;
		this.parent = $(this.page.body);
		this.filters = {
			from_date: frappe.datetime.add_months(frappe.datetime.get_today(), -3),
			to_date: frappe.datetime.get_today(),
			projects: [],
			show_zero_values: 0  // 0 = hide zero values by default
		};
		
		this.expanded_accounts = new Set();
		this.setup_page();
		this.render_filters();
	}

	setup_page() {
		this.parent.html(`
			<div class="ews-page-content">
				<div class="ews-filters"></div>
				<div class="ews-report-content"></div>
			</div>
		`);
	}

	render_filters() {
		const me = this;
		
		this.parent.find('.ews-filters').html(`
			<div class="row">
				<div class="col-sm-2">
					<label>From Date</label>
					<div class="ews-from-date"></div>
				</div>
				<div class="col-sm-2">
					<label>To Date</label>
					<div class="ews-to-date"></div>
				</div>
				<div class="col-sm-2">
					<label>Projects</label>
					<div class="ews-project-field"></div>
				</div>
				<div class="col-sm-2">
					<div class="ews-zero-field"></div>
				</div>
				<div class="col-sm-4" style="padding-top: 22px;">
					<button class="btn btn-primary btn-sm ews-generate-btn" title="Generate Report">
						<i class="fa fa-refresh"></i>
					</button>
					<button class="btn btn-info btn-sm ews-expand-all-btn" style="margin-left: 5px;">
						<i class="fa fa-plus-square"></i> Expand All
					</button>
					<button class="btn btn-warning btn-sm ews-collapse-all-btn" style="margin-left: 5px;">
						<i class="fa fa-minus-square"></i> Collapse All
					</button>
					<button class="btn btn-success btn-sm ews-export-btn" style="margin-left: 5px;">
						<i class="fa fa-file-excel-o"></i> Excel
					</button>
					<button class="btn btn-default btn-sm ews-print-btn" style="margin-left: 5px;">
						<i class="fa fa-print"></i>
					</button>
				</div>
			</div>
		`);

		this.from_date_field = frappe.ui.form.make_control({
			parent: this.parent.find('.ews-from-date'),
			df: {
				fieldtype: 'Date',
				fieldname: 'from_date',
				default: this.filters.from_date,
				onchange: () => { me.filters.from_date = me.from_date_field.get_value(); }
			},
			render_input: true
		});
		this.from_date_field.set_value(this.filters.from_date);

		this.to_date_field = frappe.ui.form.make_control({
			parent: this.parent.find('.ews-to-date'),
			df: {
				fieldtype: 'Date',
				fieldname: 'to_date',
				default: this.filters.to_date,
				onchange: () => { me.filters.to_date = me.to_date_field.get_value(); }
			},
			render_input: true
		});
		this.to_date_field.set_value(this.filters.to_date);

		this.project_field = frappe.ui.form.make_control({
			parent: this.parent.find('.ews-project-field'),
			df: {
				fieldtype: 'MultiSelectList',
				fieldname: 'projects',
				placeholder: 'All Projects',
				get_data: (txt) => frappe.db.get_link_options('Project', txt),
				onchange: () => { me.filters.projects = me.project_field.get_value() || []; }
			},
			render_input: true,
			only_input: true
		});
		this.project_field.set_value([]);

		this.zero_field = frappe.ui.form.make_control({
			parent: this.parent.find('.ews-zero-field'),
			df: {
				fieldtype: 'Check',
				label: 'Show Zero Values',
				fieldname: 'show_zero_values',
				default: 0,
				onchange: () => {
					me.filters.show_zero_values = me.zero_field.get_value();
					me.generate_report();
				}
			},
			render_input: true
		});
		this.zero_field.set_value(0);

		this.parent.find('.ews-generate-btn').on('click', () => this.generate_report());
		this.parent.find('.ews-expand-all-btn').on('click', () => this.expand_all());
		this.parent.find('.ews-collapse-all-btn').on('click', () => this.collapse_all());
		this.parent.find('.ews-export-btn').on('click', () => this.export_to_excel());
		this.parent.find('.ews-print-btn').on('click', () => window.print());

		this.generate_report();
	}

	generate_report() {
		const me = this;
		
		this.parent.find('.ews-report-content').html(`
			<div style="text-align: center; padding: 60px; color: #888;">
				<p><i class="fa fa-spinner fa-spin fa-2x"></i></p>
				<p style="margin-top: 15px;">Generating report...</p>
			</div>
		`);

		frappe.call({
			method: 'osmani.osmani.page.expense_wise_summary.expense_wise_summary.get_expense_data',
			args: {
				from_date: this.filters.from_date,
				to_date: this.filters.to_date,
				projects: this.filters.projects,
				show_zero_values: this.filters.show_zero_values
			},
			callback: function(r) {
				if (!r.message || !r.message.accounts) {
					frappe.msgprint('No data found');
					return;
				}
				
				console.log('Accounts received:', r.message.accounts.length);
				console.log('Months:', r.message.months);
				me.render_report(r.message.accounts, r.message.months);
			}
		});
	}

	render_report(accounts, months) {
		// Build account map
		const account_map = {};
		accounts.forEach(acc => {
			account_map[acc.account] = acc;
		});
		
		// Find root accounts
		const root_accounts = accounts.filter(acc => !acc.parent_account);
		
		if (root_accounts.length === 0) {
			this.parent.find('.ews-report-content').html(`
				<div style="text-align: center; padding: 60px; color: #888;">
					<p><i class="fa fa-exclamation-triangle fa-2x"></i></p>
					<p>No expense accounts found</p>
				</div>
			`);
			return;
		}
		
		// Store for later use
		this.accounts = accounts;
		this.account_map = account_map;
		this.months = months;
		
		// Build HTML
		const month_headers = months.map(m => m.label).join('</th><th>');
		
		let rows_html = '';
		root_accounts.forEach(acc => {
			rows_html += this.render_account_tree(acc, 0);
		});
		
		// Calculate grand totals
		const grand_totals = {};
		let grand_total = 0;
		
		months.forEach(m => { grand_totals[m.key] = 0; });
		
		root_accounts.forEach(acc => {
			months.forEach(m => {
				grand_totals[m.key] += (acc[m.key] || 0);
			});
			grand_total += this.get_account_total(acc);
		});
		
		const total_cells = months.map(m => 
			`<td>${this.format_currency(grand_totals[m.key])}</td>`
		).join('');
		
		const date_range = `From ${this.format_date(this.filters.from_date)} To ${this.format_date(this.filters.to_date)}`;
		
		// Get current datetime for "Report on"
		const now = new Date();
		const report_datetime = this.format_datetime(now);
		
		// Build project names if filtered
		let project_line = '';
		if (this.filters.projects && this.filters.projects.length > 0) {
			const project_names = this.filters.projects.join(', ');
			project_line = `<h3>Project: ${project_names}</h3>`;
		}
		
		const html = `
			<div class="ews-report-header">
				<div class="ews-report-meta">Report on: <strong>${report_datetime}</strong></div>
				<h1>OCL ERP REPORT</h1>
				<h2>Expense Wise Summary</h2>
				<h3>${date_range}</h3>
				${project_line}
			</div>
			<table>
				<thead>
					<tr>
						<th class="account-header">Expense Head</th>
						<th>${month_headers}</th>
						<th>Total</th>
					</tr>
				</thead>
				<tbody>
					${rows_html}
				</tbody>
				<tfoot>
					<tr class="total-row">
						<td class="account-name">TOTAL</td>
						${total_cells}
						<td>${this.format_currency(grand_total)}</td>
					</tr>
				</tfoot>
			</table>
		`;
		
		this.parent.find('.ews-report-content').html(html);
		this.bind_events();
	}

	render_account_tree(account, level) {
		const indent = 10 + (account.indent * 20);
		const is_expanded = this.expanded_accounts.has(account.account);
		const has_children = this.has_children(account);
		const total = this.get_account_total(account);
		
		let icon = '';
		if (has_children) {
			icon = `<span class="expand-icon ${is_expanded ? 'expanded' : 'collapsed'}" style="cursor: pointer;"></span>`;
		} else {
			icon = '<span class="no-children"></span>';
		}
		
		const row_class = account.is_group ? 'account-group' : 'account-child';
		
		const month_cells = this.months.map(m => 
			`<td>${this.format_currency(account[m.key] || 0)}</td>`
		).join('');
		
		let html = `
			<tr class="${row_class}" 
				data-account="${account.account}" 
				data-has-children="${has_children ? '1' : '0'}"
				data-indent="${account.indent}">
				<td class="account-name" style="padding-left: ${indent}px; cursor: ${has_children ? 'pointer' : 'default'};">
					${icon}${account.account_name}
				</td>
				${month_cells}
				<td class="total-col">${this.format_currency(total)}</td>
			</tr>
		`;
		
		if (has_children) {
			const children = this.get_children(account);
			children.forEach(child => {
				const child_html = this.render_account_tree(child, level + 1);
				
				// Split by lines and add parent reference to ONLY the first <tr> tag (the direct child)
				const lines = child_html.split('\n');
				let first_tr_found = false;
				
				const modified_lines = lines.map(line => {
					if (!first_tr_found && line.trim().startsWith('<tr ')) {
						first_tr_found = true;
						const hidden_class = is_expanded ? '' : 'hidden-row ';
						
						// Check if class attribute already exists
						if (line.includes('class="')) {
							return line.replace(/class="([^"]*)"/, `class="${hidden_class}$1" data-parent="${account.account}"`);
						} else {
							return line.replace('<tr ', `<tr data-parent="${account.account}" class="${hidden_class}"`);
						}
					}
					return line;
				});
				
				html += modified_lines.join('\n');
			});
		}
		
		return html;
	}
	
	has_children(account) {
		return this.accounts.some(acc => acc.parent_account === account.account);
	}
	
	get_children(account) {
		return this.accounts.filter(acc => acc.parent_account === account.account);
	}

	get_account_total(account) {
		let total = 0;
		this.months.forEach(m => {
			total += (account[m.key] || 0);
		});
		return total;
	}

	bind_events() {
		const me = this;
		
		// Bind click event to rows with children
		this.parent.find('tr[data-has-children="1"] .account-name').off('click').on('click', function(e) {
			e.preventDefault();
			e.stopPropagation();
			
			const $row = $(this).closest('tr');
			const account_name = $row.data('account');
			const $icon = $(this).find('.expand-icon');
			
			console.log('Toggle account:', account_name);
			
			if (me.expanded_accounts.has(account_name)) {
				// Collapse
				console.log('Collapsing:', account_name);
				me.expanded_accounts.delete(account_name);
				$icon.removeClass('expanded').addClass('collapsed');
				me.hide_children(account_name);
			} else {
				// Expand
				console.log('Expanding:', account_name);
				me.expanded_accounts.add(account_name);
				$icon.removeClass('collapsed').addClass('expanded');
				// Show only direct children
				me.parent.find(`tr[data-parent="${account_name}"]`).removeClass('hidden-row');
			}
		});
	}

	hide_children(account_name) {
		const me = this;
		const $children = me.parent.find(`tr[data-parent="${account_name}"]`);
		
		$children.each(function() {
			const $child = $(this);
			$child.addClass('hidden-row');
			
			const child_account = $child.data('account');
			const $icon = $child.find('.expand-icon');
			
			// Collapse the child's icon and remove from expanded set
			if ($icon.length) {
				$icon.removeClass('expanded').addClass('collapsed');
				me.expanded_accounts.delete(child_account);
			}
			
			// Recursively hide this child's children
			me.hide_children(child_account);
		});
	}

	expand_all() {
		this.parent.find('tr[data-has-children="1"]').each((i, el) => {
			const account = $(el).data('account');
			this.expanded_accounts.add(account);
			$(el).find('.expand-icon').removeClass('collapsed').addClass('expanded');
		});
		this.parent.find('tr[data-parent]').removeClass('hidden-row');
	}

	collapse_all() {
		this.expanded_accounts.clear();
		this.parent.find('.expand-icon').removeClass('expanded').addClass('collapsed');
		this.parent.find('tr[data-parent]').addClass('hidden-row');
	}



	format_currency(value) {
		if (!value || value === 0) return '';
		return frappe.format(value, {fieldtype: 'Currency'});
	}

	format_date(date_str) {
		const d = new Date(date_str);
		const day = String(d.getDate()).padStart(2, '0');
		const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
		const year = d.getFullYear();
		return `${day}-${month}-${year}`;
	}

	format_datetime(date_obj) {
		const day = String(date_obj.getDate()).padStart(2, '0');
		const month = date_obj.toLocaleString('en-US', { month: 'short' }).toUpperCase();
		const year = date_obj.getFullYear();
		const hours = String(date_obj.getHours()).padStart(2, '0');
		const minutes = String(date_obj.getMinutes()).padStart(2, '0');
		const seconds = String(date_obj.getSeconds()).padStart(2, '0');
		return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
	}

	export_to_excel() {
		if (!this.accounts) {
			frappe.msgprint('Please generate the report first');
			return;
		}

		let csv = 'Expense Wise Summary\n';
		csv += `From ${this.format_date(this.filters.from_date)} To ${this.format_date(this.filters.to_date)}\n\n`;
		csv += 'Expense Head';
		
		this.months.forEach(m => {
			csv += ',' + m.label;
		});
		csv += ',Total\n';

		this.accounts.forEach(acc => {
			csv += `"${acc.account_name}"`;
			
			this.months.forEach(m => {
				csv += ',' + (acc[m.key] || '');
			});
			csv += ',' + this.get_account_total(acc) + '\n';
		});

		const blob = new Blob([csv], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `Expense_Wise_Summary_${frappe.datetime.now_date()}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}
}
