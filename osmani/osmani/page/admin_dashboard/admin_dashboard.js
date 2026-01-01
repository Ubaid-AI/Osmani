frappe.pages['admin-dashboard'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Admin Dashboard',
		single_column: true
	});

	let dashboard = new AdminDashboard(page);
	dashboard.refresh();
};

class AdminDashboard {
	constructor(page) {
		this.page = page;
		this.wrapper = page.main;
		this.charts = {};
		this.setup();
	}

	setup() {
		this.wrapper.html(`
			<div class="dashboard-container">
				<div class="dashboard-header">
					<div class="header-content">
						<h1 class="dashboard-title">
							<i class="fa fa-chart-pie"></i>
							Executive Dashboard
						</h1>
						<p class="dashboard-subtitle">Complete system analytics at your fingertips</p>
					</div>
					<div class="dashboard-controls">
						<div class="date-range-filter">
							<div class="date-input-group">
								<label>From Date</label>
								<input type="date" class="form-control date-input" id="from-date" />
							</div>
							<div class="date-input-group">
								<label>To Date</label>
								<input type="date" class="form-control date-input" id="to-date" />
							</div>
							<button class="btn btn-sm btn-primary apply-date-btn">
								<i class="fa fa-check"></i> Apply
							</button>
						</div>
						<div class="dashboard-filters">
							<button class="btn btn-sm filter-btn" data-period="today">Today</button>
							<button class="btn btn-sm filter-btn active" data-period="month">This Month</button>
							<button class="btn btn-sm filter-btn" data-period="year">This Year</button>
							<button class="btn btn-sm filter-btn" data-period="all">All Time</button>
						</div>
						<button class="btn btn-sm btn-primary refresh-btn">
							<i class="fa fa-sync-alt"></i> Refresh
						</button>
					</div>
				</div>
				<div class="dashboard-content" id="dashboard-content">
					<div class="loading-state">
						<div class="spinner-border text-primary" role="status"></div>
						<p>Loading dashboard data...</p>
					</div>
				</div>
			</div>
		`);

		this.current_period = 'month';
		this.custom_date_range = null;
		this.bind_events();
	}

	bind_events() {
		const me = this;
		$(this.wrapper).on('click', '.filter-btn', function() {
			$('.filter-btn').removeClass('active');
			$(this).addClass('active');
			me.current_period = $(this).data('period');
			me.custom_date_range = null;
			me.refresh();
		});

		$(this.wrapper).on('click', '.refresh-btn', function() {
			me.refresh();
		});

		$(this.wrapper).on('click', '.apply-date-btn', function() {
			const from_date = $('#from-date').val();
			const to_date = $('#to-date').val();
			if (from_date && to_date) {
				me.custom_date_range = { from_date, to_date };
				me.current_period = 'custom';
				$('.filter-btn').removeClass('active');
				me.refresh();
			} else {
				frappe.show_alert({
					message: __('Please select both from and to dates'),
					indicator: 'orange'
				}, 3);
			}
		});
	}

	refresh() {
		this.show_loading();
		this.load_all_data();
	}

	show_loading() {
		this.wrapper.find('#dashboard-content').html(`
			<div class="loading-state">
				<div class="spinner-border text-primary" role="status"></div>
				<p>Loading dashboard data...</p>
			</div>
		`);
	}

	async load_all_data() {
		try {
			const period = this.get_date_filters();
			
			const [
				sales_data,
				sales_trend,
				sales_by_status,
				employee_advance_data,
				expense_claim_data,
				payment_data,
				payment_trend,
				payment_by_type,
				project_data,
				customer_data,
				supplier_data,
				system_data,
				top_customers,
				top_suppliers,
				recent_invoices,
				expense_trend
			] = await Promise.all([
				this.get_sales_data(period),
				this.get_sales_trend_data(period),
				this.get_sales_by_status_data(period),
				this.get_employee_advance_data(period),
				this.get_expense_claim_data(period),
				this.get_payment_data(period),
				this.get_payment_trend_data(period),
				this.get_payment_by_type_data(period),
				this.get_project_data(period),
				this.get_customer_data(period),
				this.get_supplier_data(period),
				this.get_system_data(period),
				this.get_top_customers(period),
				this.get_top_suppliers(period),
				this.get_recent_invoices(period),
				this.get_expense_trend_data(period)
			]);

			this.render_dashboard({
				sales: sales_data,
				sales_trend: sales_trend,
				sales_by_status: sales_by_status,
				employee_advance: employee_advance_data,
				expense_claim: expense_claim_data,
				expense_trend: expense_trend,
				payment: payment_data,
				payment_trend: payment_trend,
				payment_by_type: payment_by_type,
				project: project_data,
				customer: customer_data,
				supplier: supplier_data,
				system: system_data,
				top_customers: top_customers,
				top_suppliers: top_suppliers,
				recent_invoices: recent_invoices
			});
		} catch (error) {
			console.error('Error loading dashboard:', error);
			frappe.show_alert({
				message: __('Error loading dashboard data'),
				indicator: 'red'
			}, 5);
		}
	}

	get_date_filters() {
		if (this.custom_date_range) {
			return this.custom_date_range;
		}

		const today = frappe.datetime.get_today();
		let from_date, to_date = today;

		switch(this.current_period) {
			case 'today':
				from_date = today;
				break;
			case 'month':
				from_date = frappe.datetime.month_start();
				break;
			case 'year':
				from_date = frappe.datetime.year_start();
				break;
			case 'all':
				from_date = null;
				to_date = null;
				break;
		}

		return { from_date, to_date };
	}

	async get_sales_data(period) {
		const filters = [['docstatus', '=', 1]];
		if (period.from_date) {
			filters.push(['posting_date', '>=', period.from_date]);
		}
		if (period.to_date) {
			filters.push(['posting_date', '<=', period.to_date]);
		}

		const invoices = await frappe.db.get_list('Sales Invoice', {
			filters: filters,
			fields: ['name', 'grand_total', 'outstanding_amount', 'status', 'posting_date'],
			limit: 1000
		});

		const total_sales = invoices.reduce((sum, inv) => sum + (inv.grand_total || 0), 0);
		const total_outstanding = invoices.reduce((sum, inv) => sum + (inv.outstanding_amount || 0), 0);
		const total_recovered = total_sales - total_outstanding;
		const recovery_rate = total_sales > 0 ? ((total_recovered / total_sales) * 100).toFixed(1) : 0;
		const count = invoices.length;

		return {
			total_sales,
			total_recovered,
			total_outstanding,
			recovery_rate,
			count
		};
	}

	async get_sales_trend_data(period) {
		const filters = [['docstatus', '=', 1]];
		if (period.from_date) {
			filters.push(['posting_date', '>=', period.from_date]);
		}
		if (period.to_date) {
			filters.push(['posting_date', '<=', period.to_date]);
		}

		const invoices = await frappe.db.get_list('Sales Invoice', {
			filters: filters,
			fields: ['posting_date', 'grand_total'],
			limit: 1000
		});

		const grouped = {};
		invoices.forEach(inv => {
			const date = inv.posting_date;
			if (!grouped[date]) {
				grouped[date] = 0;
			}
			grouped[date] += (inv.grand_total || 0);
		});

		const labels = Object.keys(grouped).sort();
		const values = labels.map(date => grouped[date]);

		return {
			labels: labels,
			datasets: [{
				name: 'Sales',
				values: values
			}]
		};
	}

	async get_sales_by_status_data(period) {
		const filters = [['docstatus', '=', 1]];
		if (period.from_date) {
			filters.push(['posting_date', '>=', period.from_date]);
		}
		if (period.to_date) {
			filters.push(['posting_date', '<=', period.to_date]);
		}

		const invoices = await frappe.db.get_list('Sales Invoice', {
			filters: filters,
			fields: ['status', 'grand_total'],
			limit: 1000
		});

		const status_totals = {};
		invoices.forEach(inv => {
			const status = inv.status || 'Draft';
			if (!status_totals[status]) {
				status_totals[status] = 0;
			}
			status_totals[status] += (inv.grand_total || 0);
		});

		return {
			labels: Object.keys(status_totals),
			datasets: [{
				name: 'Sales by Status',
				values: Object.values(status_totals)
			}]
		};
	}

	async get_employee_advance_data(period) {
		const filters = [['docstatus', '!=', 2]];
		if (period.from_date) {
			filters.push(['posting_date', '>=', period.from_date]);
		}
		if (period.to_date) {
			filters.push(['posting_date', '<=', period.to_date]);
		}

		const advances = await frappe.db.get_list('Employee Advance', {
			filters: filters,
			fields: ['name', 'advance_amount', 'paid_amount', 'claimed_amount', 'return_amount', 'pending_amount', 'status'],
			limit: 1000
		});

		const total_advance = advances.reduce((sum, adv) => sum + (adv.advance_amount || 0), 0);
		const total_paid = advances.reduce((sum, adv) => sum + (adv.paid_amount || 0), 0);
		const total_claimed = advances.reduce((sum, adv) => sum + (adv.claimed_amount || 0), 0);
		const total_pending = advances.reduce((sum, adv) => sum + (adv.pending_amount || 0), 0);
		const count = advances.length;

		return {
			total_advance,
			total_paid,
			total_claimed,
			total_pending,
			count
		};
	}

	async get_expense_claim_data(period) {
		const filters = [['docstatus', '!=', 2]];
		if (period.from_date) {
			filters.push(['posting_date', '>=', period.from_date]);
		}
		if (period.to_date) {
			filters.push(['posting_date', '<=', period.to_date]);
		}

		const claims = await frappe.db.get_list('Expense Claim', {
			filters: filters,
			fields: ['name', 'total_sanctioned_amount', 'total_amount_reimbursed', 'status'],
			limit: 1000
		});

		const total_claimed = claims.reduce((sum, cl) => sum + (cl.total_sanctioned_amount || 0), 0);
		const total_reimbursed = claims.reduce((sum, cl) => sum + (cl.total_amount_reimbursed || 0), 0);
		const total_pending = total_claimed - total_reimbursed;
		const count = claims.length;

		return {
			total_claimed,
			total_reimbursed,
			total_pending,
			count
		};
	}

	async get_expense_trend_data(period) {
		const filters = [['docstatus', '!=', 2]];
		if (period.from_date) {
			filters.push(['posting_date', '>=', period.from_date]);
		}
		if (period.to_date) {
			filters.push(['posting_date', '<=', period.to_date]);
		}

		const claims = await frappe.db.get_list('Expense Claim', {
			filters: filters,
			fields: ['posting_date', 'total_sanctioned_amount', 'total_amount_reimbursed'],
			limit: 1000
		});

		const claimed_grouped = {};
		const reimbursed_grouped = {};
		
		claims.forEach(cl => {
			const date = cl.posting_date;
			if (!claimed_grouped[date]) claimed_grouped[date] = 0;
			if (!reimbursed_grouped[date]) reimbursed_grouped[date] = 0;
			claimed_grouped[date] += (cl.total_sanctioned_amount || 0);
			reimbursed_grouped[date] += (cl.total_amount_reimbursed || 0);
		});

		const all_dates = [...new Set([...Object.keys(claimed_grouped), ...Object.keys(reimbursed_grouped)])].sort();
		
		return {
			labels: all_dates,
			datasets: [
				{
					name: 'Claimed',
					values: all_dates.map(date => claimed_grouped[date] || 0)
				},
				{
					name: 'Reimbursed',
					values: all_dates.map(date => reimbursed_grouped[date] || 0)
				}
			]
		};
	}

	async get_payment_data(period) {
		const filters = [['docstatus', '=', 1]];
		if (period.from_date) {
			filters.push(['posting_date', '>=', period.from_date]);
		}
		if (period.to_date) {
			filters.push(['posting_date', '<=', period.to_date]);
		}

		const payments = await frappe.db.get_list('Payment Entry', {
			filters: filters,
			fields: ['name', 'paid_amount', 'payment_type', 'party_type'],
			limit: 1000
		});

		const total_paid = payments.reduce((sum, p) => sum + (p.paid_amount || 0), 0);
		const received = payments.filter(p => p.payment_type === 'Receive').reduce((sum, p) => sum + (p.paid_amount || 0), 0);
		const paid = payments.filter(p => p.payment_type === 'Pay').reduce((sum, p) => sum + (p.paid_amount || 0), 0);
		const count = payments.length;

		return {
			total_paid,
			received,
			paid,
			count
		};
	}

	async get_payment_trend_data(period) {
		const filters = [['docstatus', '=', 1]];
		if (period.from_date) {
			filters.push(['posting_date', '>=', period.from_date]);
		}
		if (period.to_date) {
			filters.push(['posting_date', '<=', period.to_date]);
		}

		const payments = await frappe.db.get_list('Payment Entry', {
			filters: filters,
			fields: ['posting_date', 'paid_amount', 'payment_type'],
			limit: 1000
		});

		const received_grouped = {};
		const paid_grouped = {};
		
		payments.forEach(p => {
			const date = p.posting_date;
			const amount = p.paid_amount || 0;
			
			if (p.payment_type === 'Receive') {
				if (!received_grouped[date]) received_grouped[date] = 0;
				received_grouped[date] += amount;
			} else {
				if (!paid_grouped[date]) paid_grouped[date] = 0;
				paid_grouped[date] += amount;
			}
		});

		const all_dates = [...new Set([...Object.keys(received_grouped), ...Object.keys(paid_grouped)])].sort();
		
		return {
			labels: all_dates,
			datasets: [
				{
					name: 'Received',
					values: all_dates.map(date => received_grouped[date] || 0)
				},
				{
					name: 'Paid',
					values: all_dates.map(date => paid_grouped[date] || 0)
				}
			]
		};
	}

	async get_payment_by_type_data(period) {
		const filters = [['docstatus', '=', 1]];
		if (period.from_date) {
			filters.push(['posting_date', '>=', period.from_date]);
		}
		if (period.to_date) {
			filters.push(['posting_date', '<=', period.to_date]);
		}

		const payments = await frappe.db.get_list('Payment Entry', {
			filters: filters,
			fields: ['payment_type', 'paid_amount'],
			limit: 1000
		});

		const type_totals = {};
		payments.forEach(p => {
			const type = p.payment_type || 'Unknown';
			if (!type_totals[type]) {
				type_totals[type] = 0;
			}
			type_totals[type] += (p.paid_amount || 0);
		});

		return {
			labels: Object.keys(type_totals),
			datasets: [{
				name: 'Payments',
				values: Object.values(type_totals)
			}]
		};
	}

	async get_project_data(period) {
		const filters = [];
		if (period.from_date) {
			filters.push(['expected_start_date', '>=', period.from_date]);
		}

		const projects = await frappe.db.get_list('Project', {
			filters: filters,
			fields: ['name', 'status', 'project_name'],
			limit: 1000
		});

		const active = projects.filter(p => p.status === 'Open').length;
		const completed = projects.filter(p => p.status === 'Completed').length;
		const on_hold = projects.filter(p => p.status === 'On Hold').length;
		const cancelled = projects.filter(p => p.status === 'Cancelled').length;
		const count = projects.length;

		return {
			active,
			completed,
			on_hold,
			cancelled,
			count
		};
	}

	async get_customer_data(period) {
		const filters = [];
		if (period.from_date) {
			filters.push(['creation', '>=', period.from_date]);
		}

		const customers = await frappe.db.get_list('Customer', {
			filters: filters,
			fields: ['name', 'customer_name', 'disabled'],
			limit: 1000
		});

		const active = customers.filter(c => !c.disabled).length;
		const disabled = customers.filter(c => c.disabled).length;
		const count = customers.length;

		const outstanding_filters = [
			['docstatus', '=', 1],
			['outstanding_amount', '>', 0]
		];
		if (period.from_date) {
			outstanding_filters.push(['posting_date', '>=', period.from_date]);
		}
		if (period.to_date) {
			outstanding_filters.push(['posting_date', '<=', period.to_date]);
		}

		const outstanding_invoices = await frappe.db.get_list('Sales Invoice', {
			filters: outstanding_filters,
			fields: ['outstanding_amount'],
			limit: 1000
		});

		const total_outstanding = outstanding_invoices.reduce((sum, inv) => sum + (inv.outstanding_amount || 0), 0);

		return {
			active,
			disabled,
			count,
			total_outstanding
		};
	}

	async get_supplier_data(period) {
		const filters = [];
		if (period.from_date) {
			filters.push(['creation', '>=', period.from_date]);
		}

		const suppliers = await frappe.db.get_list('Supplier', {
			filters: filters,
			fields: ['name', 'supplier_name', 'disabled'],
			limit: 1000
		});

		const active = suppliers.filter(s => !s.disabled).length;
		const disabled = suppliers.filter(s => s.disabled).length;
		const count = suppliers.length;

		return {
			active,
			disabled,
			count
		};
	}

	async get_system_data(period) {
		const filters = [];
		if (period.from_date) {
			filters.push(['creation', '>=', period.from_date]);
		}

		const [users, companies, employees] = await Promise.all([
			frappe.db.get_list('User', { filters: filters, limit: 1000 }),
			frappe.db.get_list('Company', { limit: 100 }),
			frappe.db.get_list('Employee', { filters: filters, limit: 1000 })
		]);

		return {
			users: users.length,
			companies: companies.length,
			employees: employees.length
		};
	}

	async get_top_customers(period) {
		const filters = [['docstatus', '=', 1]];
		if (period.from_date) {
			filters.push(['posting_date', '>=', period.from_date]);
		}
		if (period.to_date) {
			filters.push(['posting_date', '<=', period.to_date]);
		}

		const invoices = await frappe.db.get_list('Sales Invoice', {
			filters: filters,
			fields: ['customer', 'customer_name', 'grand_total'],
			limit: 1000
		});

		const customer_totals = {};
		invoices.forEach(inv => {
			const customer = inv.customer;
			if (!customer_totals[customer]) {
				customer_totals[customer] = {
					name: inv.customer_name || customer,
					total: 0
				};
			}
			customer_totals[customer].total += (inv.grand_total || 0);
		});

		return Object.values(customer_totals)
			.sort((a, b) => b.total - a.total)
			.slice(0, 10);
	}

	async get_top_suppliers(period) {
		const filters = [['docstatus', '=', 1]];
		if (period.from_date) {
			filters.push(['posting_date', '>=', period.from_date]);
		}
		if (period.to_date) {
			filters.push(['posting_date', '<=', period.to_date]);
		}

		const invoices = await frappe.db.get_list('Purchase Invoice', {
			filters: filters,
			fields: ['supplier', 'supplier_name', 'grand_total'],
			limit: 1000
		});

		const supplier_totals = {};
		invoices.forEach(inv => {
			const supplier = inv.supplier;
			if (!supplier_totals[supplier]) {
				supplier_totals[supplier] = {
					name: inv.supplier_name || supplier,
					total: 0
				};
			}
			supplier_totals[supplier].total += (inv.grand_total || 0);
		});

		return Object.values(supplier_totals)
			.sort((a, b) => b.total - a.total)
			.slice(0, 10);
	}

	async get_recent_invoices(period) {
		const filters = [['docstatus', '=', 1]];
		if (period.from_date) {
			filters.push(['posting_date', '>=', period.from_date]);
		}
		if (period.to_date) {
			filters.push(['posting_date', '<=', period.to_date]);
		}

		return await frappe.db.get_list('Sales Invoice', {
			filters: filters,
			fields: ['name', 'customer', 'customer_name', 'grand_total', 'outstanding_amount', 'posting_date', 'status'],
			limit: 10,
			order_by: 'posting_date desc'
		});
	}

	render_dashboard(data) {
		const content = this.wrapper.find('#dashboard-content');
		content.html('');

		// Summary Cards Row
		content.append(this.create_summary_section(data));

		// Charts Row
		content.append(this.create_charts_section(data));

		// Analytics Sections
		content.append(this.create_analytics_sections(data));

		// Data Tables Section
		content.append(this.create_tables_section(data));

		// Render charts after DOM is ready
		setTimeout(() => {
			this.render_charts(data);
		}, 100);
	}

	create_summary_section(data) {
		return $(`
			<div class="summary-cards-row">
				<div class="summary-card primary">
					<div class="card-header">
						<i class="fa fa-chart-line"></i>
						<span>Total Sales</span>
					</div>
					<div class="card-value">${this.format_currency_short(data.sales.total_sales)}</div>
					<div class="card-footer">${data.sales.count} Invoices</div>
				</div>
				<div class="summary-card success">
					<div class="card-header">
						<i class="fa fa-check-circle"></i>
						<span>Recovered</span>
					</div>
					<div class="card-value">${this.format_currency_short(data.sales.total_recovered)}</div>
					<div class="card-footer">${data.sales.recovery_rate}% Recovery Rate</div>
				</div>
				<div class="summary-card warning">
					<div class="card-header">
						<i class="fa fa-exclamation-triangle"></i>
						<span>Outstanding</span>
					</div>
					<div class="card-value">${this.format_currency_short(data.sales.total_outstanding)}</div>
					<div class="card-footer">Pending Collection</div>
				</div>
				<div class="summary-card info">
					<div class="card-header">
						<i class="fa fa-users"></i>
						<span>Customers</span>
					</div>
					<div class="card-value">${data.customer.count}</div>
					<div class="card-footer">${data.customer.active} Active</div>
				</div>
			</div>
		`);
	}

	create_charts_section(data) {
		return $(`
			<div class="charts-section">
				<div class="chart-container">
					<div class="chart-header">
						<h3><i class="fa fa-line-chart"></i> Sales Trend</h3>
					</div>
					<div class="chart-wrapper" id="sales-trend-chart"></div>
				</div>
				<div class="chart-container">
					<div class="chart-header">
						<h3><i class="fa fa-exchange-alt"></i> Payment Flow</h3>
					</div>
					<div class="chart-wrapper" id="payment-trend-chart"></div>
				</div>
				<div class="chart-container">
					<div class="chart-header">
						<h3><i class="fa fa-chart-pie"></i> Project Status</h3>
					</div>
					<div class="chart-wrapper" id="project-status-chart"></div>
				</div>
				<div class="chart-container">
					<div class="chart-header">
						<h3><i class="fa fa-chart-bar"></i> Sales by Status</h3>
					</div>
					<div class="chart-wrapper" id="sales-status-chart"></div>
				</div>
				<div class="chart-container">
					<div class="chart-header">
						<h3><i class="fa fa-money-bill-wave"></i> Payment Types</h3>
					</div>
					<div class="chart-wrapper" id="payment-type-chart"></div>
				</div>
				<div class="chart-container">
					<div class="chart-header">
						<h3><i class="fa fa-receipt"></i> Expense Trend</h3>
					</div>
					<div class="chart-wrapper" id="expense-trend-chart"></div>
				</div>
			</div>
		`);
	}

	create_analytics_sections(data) {
		const sections = $(`<div class="analytics-sections"></div>`);

		// Financial Analytics
		sections.append(this.create_analytics_card({
			title: 'Financial Analytics',
			icon: 'fa fa-money-bill-wave',
			items: [
				{ label: 'Total Sales', value: this.format_currency_short(data.sales.total_sales), color: 'blue' },
				{ label: 'Recovered', value: this.format_currency_short(data.sales.total_recovered), color: 'green' },
				{ label: 'Outstanding', value: this.format_currency_short(data.sales.total_outstanding), color: 'orange' },
				{ label: 'Total Payments', value: this.format_currency_short(data.payment.total_paid), color: 'purple' }
			]
		}));

		// Employee & Expense Analytics
		sections.append(this.create_analytics_card({
			title: 'Employee & Expense Analytics',
			icon: 'fa fa-user-tie',
			items: [
				{ label: 'Total Advance', value: this.format_currency_short(data.employee_advance.total_advance), color: 'purple' },
				{ label: 'Paid Advance', value: this.format_currency_short(data.employee_advance.total_paid), color: 'green' },
				{ label: 'Total Claims', value: this.format_currency_short(data.expense_claim.total_claimed), color: 'cyan' },
				{ label: 'Reimbursed', value: this.format_currency_short(data.expense_claim.total_reimbursed), color: 'green' }
			]
		}));

		// Project Analytics
		sections.append(this.create_analytics_card({
			title: 'Project Analytics',
			icon: 'fa fa-project-diagram',
			items: [
				{ label: 'Total Projects', value: data.project.count, color: 'blue' },
				{ label: 'Active', value: data.project.active, color: 'green' },
				{ label: 'Completed', value: data.project.completed, color: 'blue' },
				{ label: 'On Hold', value: data.project.on_hold, color: 'orange' }
			]
		}));

		// System Overview
		sections.append(this.create_analytics_card({
			title: 'System Overview',
			icon: 'fa fa-cog',
			items: [
				{ label: 'Total Users', value: data.system.users, color: 'purple' },
				{ label: 'Companies', value: data.system.companies, color: 'cyan' },
				{ label: 'Employees', value: data.system.employees, color: 'green' },
				{ label: 'Suppliers', value: data.supplier.count, color: 'orange' }
			]
		}));

		return sections;
	}

	create_analytics_card({ title, icon, items }) {
		const card = $(`
			<div class="analytics-card">
				<div class="analytics-card-header">
					<i class="${icon}"></i>
					<h3>${title}</h3>
				</div>
				<div class="analytics-card-body">
					${items.map(item => `
						<div class="analytics-item item-${item.color}">
							<span class="item-label">${item.label}</span>
							<span class="item-value">${item.value}</span>
						</div>
					`).join('')}
				</div>
			</div>
		`);
		return card;
	}

	create_tables_section(data) {
		return $(`
			<div class="tables-section">
				<div class="table-container">
					<div class="table-header">
						<h3><i class="fa fa-star"></i> Top Customers</h3>
					</div>
					<div class="table-wrapper" id="top-customers-table"></div>
				</div>
				<div class="table-container">
					<div class="table-header">
						<h3><i class="fa fa-file-invoice"></i> Recent Invoices</h3>
					</div>
					<div class="table-wrapper" id="recent-invoices-table"></div>
				</div>
			</div>
		`);
	}

	render_charts(data) {
		// Sales Trend Chart
		if (data.sales_trend && data.sales_trend.labels && data.sales_trend.labels.length > 0) {
			const sales_chart_wrapper = this.wrapper.find('#sales-trend-chart')[0];
			if (sales_chart_wrapper) {
				this.charts.sales = new frappe.Chart(sales_chart_wrapper, {
					data: data.sales_trend,
					type: 'line',
					height: 200,
					colors: ['#3b82f6'],
					axisOptions: {
						xIsSeries: 0,
						shortenYAxisNumbers: 1
					}
				});
			}
		}

		// Payment Trend Chart
		if (data.payment_trend && data.payment_trend.labels && data.payment_trend.labels.length > 0) {
			const payment_chart_wrapper = this.wrapper.find('#payment-trend-chart')[0];
			if (payment_chart_wrapper) {
				this.charts.payment = new frappe.Chart(payment_chart_wrapper, {
					data: data.payment_trend,
					type: 'line',
					height: 200,
					colors: ['#10b981', '#ef4444'],
					axisOptions: {
						xIsSeries: 0,
						shortenYAxisNumbers: 1
					}
				});
			}
		}

		// Project Status Chart
		if (data.project) {
			const project_data = {
				labels: ['Active', 'Completed', 'On Hold', 'Cancelled'],
				datasets: [{
					name: 'Projects',
					values: [
						data.project.active,
						data.project.completed,
						data.project.on_hold,
						data.project.cancelled
					]
				}]
			};

			const project_chart_wrapper = this.wrapper.find('#project-status-chart')[0];
			if (project_chart_wrapper && project_data.datasets[0].values.some(v => v > 0)) {
				this.charts.project = new frappe.Chart(project_chart_wrapper, {
					data: project_data,
					type: 'donut',
					height: 200,
					colors: ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6']
				});
			}
		}

		// Sales by Status Chart
		if (data.sales_by_status && data.sales_by_status.labels && data.sales_by_status.labels.length > 0) {
			const sales_status_wrapper = this.wrapper.find('#sales-status-chart')[0];
			if (sales_status_wrapper) {
				this.charts.salesStatus = new frappe.Chart(sales_status_wrapper, {
					data: data.sales_by_status,
					type: 'bar',
					height: 200,
					colors: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444']
				});
			}
		}

		// Payment by Type Chart
		if (data.payment_by_type && data.payment_by_type.labels && data.payment_by_type.labels.length > 0) {
			const payment_type_wrapper = this.wrapper.find('#payment-type-chart')[0];
			if (payment_type_wrapper) {
				this.charts.paymentType = new frappe.Chart(payment_type_wrapper, {
					data: data.payment_by_type,
					type: 'pie',
					height: 200,
					colors: ['#10b981', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6']
				});
			}
		}

		// Expense Trend Chart
		if (data.expense_trend && data.expense_trend.labels && data.expense_trend.labels.length > 0) {
			const expense_trend_wrapper = this.wrapper.find('#expense-trend-chart')[0];
			if (expense_trend_wrapper) {
				this.charts.expenseTrend = new frappe.Chart(expense_trend_wrapper, {
					data: data.expense_trend,
					type: 'line',
					height: 200,
					colors: ['#8b5cf6', '#10b981'],
					axisOptions: {
						xIsSeries: 0,
						shortenYAxisNumbers: 1
					}
				});
			}
		}

		// Top Customers Table
		if (data.top_customers && data.top_customers.length > 0) {
			const table_html = `
				<table class="dashboard-table">
					<thead>
						<tr>
							<th>#</th>
							<th>Customer Name</th>
							<th>Total Sales</th>
						</tr>
					</thead>
					<tbody>
						${data.top_customers.map((c, idx) => `
							<tr>
								<td>${idx + 1}</td>
								<td>${c.name}</td>
								<td>${this.format_currency_short(c.total)}</td>
							</tr>
						`).join('')}
					</tbody>
				</table>
			`;
			this.wrapper.find('#top-customers-table').html(table_html);
		} else {
			this.wrapper.find('#top-customers-table').html('<p class="no-data">No customer data available</p>');
		}

		// Recent Invoices Table
		if (data.recent_invoices && data.recent_invoices.length > 0) {
			const table_html = `
				<table class="dashboard-table">
					<thead>
						<tr>
							<th>Invoice</th>
							<th>Customer</th>
							<th>Amount</th>
							<th>Outstanding</th>
							<th>Date</th>
							<th>Status</th>
						</tr>
					</thead>
					<tbody>
						${data.recent_invoices.map(inv => `
							<tr>
								<td><a href="/app/sales-invoice/${inv.name}">${inv.name}</a></td>
								<td>${inv.customer_name || inv.customer}</td>
								<td>${this.format_currency_short(inv.grand_total)}</td>
								<td>${this.format_currency_short(inv.outstanding_amount)}</td>
								<td>${inv.posting_date}</td>
								<td><span class="status-badge status-${inv.status.toLowerCase()}">${inv.status}</span></td>
							</tr>
						`).join('')}
					</tbody>
				</table>
			`;
			this.wrapper.find('#recent-invoices-table').html(table_html);
		} else {
			this.wrapper.find('#recent-invoices-table').html('<p class="no-data">No invoice data available</p>');
		}
	}

	format_currency_short(value) {
		if (value === null || value === undefined) return '0';
		const currency = frappe.defaults.get_default('currency') || 'USD';
		const currency_symbol = frappe.boot.sysdefaults.currency_symbols?.[currency] || currency;
		
		if (value >= 1000000000) {
			return currency_symbol + (value / 1000000000).toFixed(2) + 'B';
		} else if (value >= 1000000) {
			return currency_symbol + (value / 1000000).toFixed(2) + 'M';
		} else if (value >= 1000) {
			return currency_symbol + (value / 1000).toFixed(2) + 'K';
		}
		return frappe.format(value, {
			fieldtype: 'Currency',
			currency: currency
		});
	}

	format_currency(value) {
		if (value === null || value === undefined) return '0.00';
		const currency = frappe.defaults.get_default('currency') || 'USD';
		return frappe.format(value, {
			fieldtype: 'Currency',
			currency: currency
		});
	}
}
