frappe.pages['receipts-vs-payments'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Receipts Vs Payments',
		single_column: true
	});

	new ReceiptsVsPaymentsReport(page);
}

class ReceiptsVsPaymentsReport {
	constructor(page) {
		this.page = page;
		this.parent = $(this.page.body);
		this.filters = {
			from_date: frappe.datetime.add_months(frappe.datetime.get_today(), -3),
			to_date: frappe.datetime.get_today(),
			project: null,
			include_tax: false
		};

		this.report_data = null;
		this.setup_page();
		this.render_filters();
	}

	setup_page() {
		this.parent.html(`
			<div class="rvp-page-content">
				<div class="rvp-filters"></div>
				<div class="rvp-report-content"></div>
			</div>
		`);
	}

	render_filters() {
		const me = this;

		this.parent.find('.rvp-filters').html(`
			<div class="row">
				<div class="col-sm-2">
					<label style="font-weight: 600; margin-bottom: 6px; font-size: 12px; color: #333;">From Date</label>
					<div class="rvp-from-date"></div>
				</div>
				<div class="col-sm-2">
					<label style="font-weight: 600; margin-bottom: 6px; font-size: 12px; color: #333;">To Date</label>
					<div class="rvp-to-date"></div>
				</div>
				<div class="col-sm-3">
					<label style="font-weight: 600; margin-bottom: 6px; font-size: 12px; color: #333;">Project</label>
					<div class="rvp-projects"></div>
				</div>
				<div class="col-sm-2">
					<label style="font-weight: 600; margin-bottom: 6px; font-size: 12px; color: #333;">&nbsp;</label>
					<div class="rvp-include-tax"></div>
				</div>
				<div class="col-sm-3 rvp-buttons">
					<button class="btn btn-primary rvp-generate-btn" title="Refresh">
						<i class="fa fa-refresh"></i>
					</button>
					<button class="btn btn-default rvp-export-btn" title="Export to Excel">
						<i class="fa fa-file-excel-o"></i>
					</button>
					<button class="btn btn-default rvp-print-btn" title="Print">
						<i class="fa fa-print"></i>
					</button>
				</div>
			</div>
		`);

		// From date
		this.from_date_field = frappe.ui.form.make_control({
			parent: this.parent.find('.rvp-from-date'),
			df: {
				fieldtype: 'Date',
				fieldname: 'from_date',
				placeholder: 'From Date',
				default: this.filters.from_date
			},
			render_input: true
		});
		this.from_date_field.set_value(this.filters.from_date);

		// To date
		this.to_date_field = frappe.ui.form.make_control({
			parent: this.parent.find('.rvp-to-date'),
			df: {
				fieldtype: 'Date',
				fieldname: 'to_date',
				placeholder: 'To Date',
				default: this.filters.to_date
			},
			render_input: true
		});
		this.to_date_field.set_value(this.filters.to_date);

		// Single Project (this report is for one project at a time)
		this.project_field = frappe.ui.form.make_control({
			parent: this.parent.find('.rvp-projects'),
			df: {
				fieldtype: 'Link',
				fieldname: 'project',
				options: 'Project',
				placeholder: 'Select Project'
			},
			render_input: true
		});

		// Include tax checkbox
		this.tax_field = frappe.ui.form.make_control({
			parent: this.parent.find('.rvp-include-tax'),
			df: {
				fieldtype: 'Check',
				fieldname: 'include_tax',
				label: 'Include Tax',
				default: 0
			},
			render_input: true
		});
		this.tax_field.set_value(0);

		// Bind buttons
		this.parent.find('.rvp-generate-btn').on('click', function() {
			me.filters.from_date = me.from_date_field.get_value();
			me.filters.to_date = me.to_date_field.get_value();
			me.filters.project = me.project_field.get_value() || null;
			me.filters.include_tax = me.tax_field.get_value() ? true : false;

			if (!me.filters.from_date || !me.filters.to_date) {
				frappe.msgprint(__('Please select both dates'));
				return;
			}

			if (!me.filters.project) {
				frappe.msgprint(__('Please select a Project'));
				return;
			}

			me.generate_report();
		});

		this.parent.find('.rvp-export-btn').on('click', function() {
			me.export_to_excel();
		});

		this.parent.find('.rvp-print-btn').on('click', function() {
			me.print_report();
		});
	}

	generate_report() {
		const me = this;

		this.parent.find('.rvp-report-content').html(`
			<div style="text-align: center; padding: 60px; color: #888;">
				<p><i class="fa fa-spinner fa-spin fa-2x"></i></p>
				<p style="margin-top: 15px;">Generating report...</p>
			</div>
		`);

		frappe.call({
			method: 'osmani.osmani.page.receipts_vs_payments.receipts_vs_payments.get_receipts_vs_payments_data',
			args: {
				from_date: this.filters.from_date,
				to_date: this.filters.to_date,
				project: this.filters.project,
				include_tax: this.filters.include_tax ? 1 : 0
			},
			callback: function(r) {
				if (!r.message) {
					me.parent.find('.rvp-report-content').html('<div style="padding: 40px; text-align: center; color: #888;">No data</div>');
					return;
				}
				me.report_data = r.message;
				me.render_report();
			}
		});
	}

	render_report() {
		const data = this.report_data || {};
		const rows = data.rows || [];
		const totals = data.totals || {};
		const summary = data.summary || {};

		const tax_label = this.filters.include_tax ? 'Incl. Sales Tax' : 'Excl. Sales Tax';
		const date_range = `From ${this.format_date_display(this.filters.from_date)} To ${this.format_date_display(this.filters.to_date)}`;
		const report_datetime = this.format_datetime_display(new Date());
		const project_name = this.filters.project || 'Project';

		const body_rows = rows.map(row => {
			return `
				<tr>
					<td class="date">${this.format_date_short(row.date)}</td>
					<td>${this.format_currency_or_empty(row.sales_order)}</td>
					<td>${this.format_currency_or_empty(row.sales_invoice)}</td>
					<td>${this.format_currency_or_empty(row.payment_sales_invoice)}</td>
					<td>${this.format_currency_or_empty(row.purchase_invoice)}</td>
					<td>${this.format_currency_or_empty(row.payment_purchase_invoice)}</td>
					<td>${this.format_currency_or_empty(row.payable)}</td>
					<td>${this.format_currency_or_empty(row.pay_others)}</td>
					<td class="remarks">${frappe.utils.escape_html(row.remarks || '')}</td>
				</tr>
			`;
		}).join('');

		const total_row = `
			<tr class="total-row">
				<td>Total</td>
				<td>${this.format_currency_or_empty(totals.sales_order)}</td>
				<td>${this.format_currency_or_empty(totals.sales_invoice)}</td>
				<td>${this.format_currency_or_empty(totals.payment_sales_invoice)}</td>
				<td>${this.format_currency_or_empty(totals.purchase_invoice)}</td>
				<td>${this.format_currency_or_empty(totals.payment_purchase_invoice)}</td>
				<td>${this.format_currency_or_empty(totals.payable)}</td>
				<td>${this.format_currency_or_empty(totals.pay_others)}</td>
				<td></td>
			</tr>
		`;

		const net_balance = summary.net_balance || 0;
		const net_class = net_balance < 0 ? 'negative' : (net_balance > 0 ? 'positive' : '');

		const html = `
			<div class="report-header">
				<h1>OCL ERP REPORT</h1>
				<h2>${frappe.utils.escape_html(project_name)} – Receipts Vs Payments (${tax_label})</h2>
				<h3>${date_range}</h3>
			</div>

			<div class="report-meta">
				Report on : <strong>${report_datetime}</strong>
			</div>

			<table>
				<thead>
					<tr>
						<th>Date</th>
						<th>Sales Order</th>
						<th>Sales Invoice</th>
						<th>Payment Against<br>Sales Invoice</th>
						<th>Purchase Invoice</th>
						<th>Payment Against<br>Purchase</th>
						<th>Payable</th>
						<th>Pay / Others</th>
						<th>Remarks</th>
					</tr>
				</thead>
				<tbody>
					${body_rows || ''}
				</tbody>
				<tfoot>
					${total_row}
				</tfoot>
			</table>

			<table class="summary-table">
				<thead>
					<tr>
						<th>Total Receipts</th>
						<th>Total Payments</th>
						<th>Net Balance</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>${this.format_currency_or_empty(summary.total_receipts)}</td>
						<td>${this.format_currency_or_empty(summary.total_payments)}</td>
						<td class="${net_class}">${net_balance === 0 ? '' : this.format_currency(net_balance)}</td>
					</tr>
				</tbody>
			</table>
		`;

		this.parent.find('.rvp-report-content').html(html);
	}

	export_to_excel() {
		if (!this.report_data || !this.report_data.rows) {
			frappe.msgprint('Please generate the report first');
			return;
		}

		const { rows, totals, summary } = this.report_data;
		const tax_label = this.filters.include_tax ? 'Incl. Sales Tax' : 'Excl. Sales Tax';
		const project_name = this.filters.project || 'Project';

		let csv = `${project_name} - Receipts Vs Payments (${tax_label})\n`;
		csv += `From ${this.format_date_display(this.filters.from_date)} To ${this.format_date_display(this.filters.to_date)}\n\n`;

		csv += 'Date,Sales Order,Sales Invoice,Payment Against Sales Invoice,Purchase Invoice,Payment Against Purchase,Payable,Pay / Others,Remarks\n';

		rows.forEach(r => {
			csv += [
				this.format_date_short(r.date),
				r.sales_order || '',
				r.sales_invoice || '',
				r.payment_sales_invoice || '',
				r.purchase_invoice || '',
				r.payment_purchase_invoice || '',
				r.payable || '',
				r.pay_others || '',
				`"${(r.remarks || '').replace(/"/g, '""')}"`
			].join(',') + '\n';
		});

		csv += [
			'Total',
			totals.sales_order || 0,
			totals.sales_invoice || 0,
			totals.payment_sales_invoice || 0,
			totals.purchase_invoice || 0,
			totals.payment_purchase_invoice || 0,
			totals.payable || 0,
			totals.pay_others || 0,
			''
		].join(',') + '\n\n';

		csv += 'Total Receipts,Total Payments,Net Balance\n';
		csv += [
			summary.total_receipts || 0,
			summary.total_payments || 0,
			summary.net_balance || 0
		].join(',') + '\n';

		const blob = new Blob([csv], { type: 'text/csv' });
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'Receipts_Vs_Payments_' + frappe.datetime.now_date() + '.csv';
		a.click();
		window.URL.revokeObjectURL(url);
	}

	print_report() {
		const report_content = this.parent.find('.rvp-report-content')[0];
		if (!report_content || !report_content.querySelector('table')) {
			frappe.msgprint(__('Please generate report first'));
			return;
		}

		const content = report_content.innerHTML;
		const project_name = this.filters.project || 'Project';
		const printWindow = window.open('', '_blank');
		printWindow.document.write(`
			<!DOCTYPE html>
			<html>
			<head>
				<meta charset="utf-8">
				<title>${project_name} - Receipts Vs Payments</title>
				<style>
					@page { size: landscape; margin: 12mm; }
					html, body { margin: 0; padding: 0; width: 100%; }
					body { font-family: Arial, sans-serif; color: #000; }
					.report-header { text-align: center; margin-bottom: 18px; }
					.report-header h1 { font-size: 18px; margin: 0; font-weight: 700; letter-spacing: 0.4px; }
					.report-header h2 { font-size: 14px; margin: 6px 0; font-weight: 600; }
					.report-header h3 { font-size: 12px; margin: 4px 0; font-weight: 500; }
					.report-meta { text-align: right; font-size: 11px; margin-top: -30px; margin-bottom: 10px; }
					table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 9px; }
					th, td { border: 1px solid #333; padding: 4px 6px; }
					th { background: #fff; font-weight: 600; text-align: center; color: #000; }
					td { text-align: right; white-space: nowrap; }
					td.date, td.remarks { text-align: left; white-space: normal; }
					.total-row { background: #fff; font-weight: 700; color: #000; }
					.summary-table { width: 45%; float: right; margin-top: 18px; }
					.summary-table th, .summary-table td { font-weight: 600; }
					.positive, .negative { color: #000; font-weight: 600; }
					* { color: #000 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
				</style>
			</head>
			<body>
				${content}
			</body>
			</html>
		`);
		printWindow.document.close();
		printWindow.focus();
		setTimeout(() => printWindow.print(), 250);
	}

	format_currency_or_empty(value) {
		const v = Number(value || 0);
		if (!v) return '';
		return this.format_currency(v);
	}

	format_currency(value) {
		try {
			return frappe.format(value || 0, { fieldtype: 'Currency' }, { always_show_decimals: false });
		} catch (e) {
			return (value || 0).toLocaleString();
		}
	}

	format_date_display(date_str) {
		if (!date_str) return '';
		const d = frappe.datetime.str_to_obj(date_str);
		const day = String(d.getDate()).padStart(2, '0');
		const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
		const year = d.getFullYear();
		return `${day}-${month}-${year}`;
	}

	format_date_short(date_str) {
		if (!date_str) return '';
		const d = frappe.datetime.str_to_obj(date_str);
		const day = String(d.getDate()).padStart(2, '0');
		const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
		const year = String(d.getFullYear()).slice(-2);
		return `${day}-${month}-${year}`;
	}

	format_datetime_display(date_obj) {
		const d = date_obj || new Date();
		const day = String(d.getDate()).padStart(2, '0');
		const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
		const year = d.getFullYear();
		const hours = String(d.getHours()).padStart(2, '0');
		const minutes = String(d.getMinutes()).padStart(2, '0');
		const seconds = String(d.getSeconds()).padStart(2, '0');
		return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
	}
}