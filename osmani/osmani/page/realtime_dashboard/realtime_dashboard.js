frappe.pages['realtime-dashboard'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Realtime Dashboard',
		single_column: true
	});

	let dashboard = new RealtimeDashboard(page);
	dashboard.init();
};

class RealtimeDashboard {
	constructor(page) {
		this.page = page;
		this.wrapper = page.main;
		this.charts = {};
		this.refresh_interval = null;
		this.setup();
	}

	setup() {
		this.wrapper.html(`
			<div class="realtime-dashboard">
				<div class="dashboard-header-glass">
					<div class="header-content">
						<h1 class="dashboard-title">
							<i class="fa fa-chart-line"></i>
							Realtime Dashboard
						</h1>
						<p class="dashboard-subtitle">Live business analytics and insights</p>
					</div>
					<div class="dashboard-filters">
						<div class="filter-group">
							<button class="filter-btn active" data-period="realtime">
								<i class="fa fa-bolt"></i> Realtime
							</button>
							<button class="filter-btn" data-period="today">
								<i class="fa fa-calendar-day"></i> Today
							</button>
							<button class="filter-btn" data-period="week">
								<i class="fa fa-calendar-week"></i> This Week
							</button>
							<button class="filter-btn" data-period="month">
								<i class="fa fa-calendar-alt"></i> This Month
							</button>
							<button class="filter-btn" data-period="custom">
								<i class="fa fa-calendar"></i> Custom
							</button>
						</div>
						<div class="custom-date-range" style="display: none;">
							<input type="date" class="date-input" id="from-date" />
							<span>to</span>
							<input type="date" class="date-input" id="to-date" />
							<button class="btn-apply" id="apply-dates">Apply</button>
						</div>
					</div>
				</div>
				<div class="dashboard-content" id="dashboard-content">
					<div class="loading-state-glass">
						<div class="spinner"></div>
						<p>Loading realtime data...</p>
					</div>
				</div>
			</div>
		`);

		this.current_period = 'realtime';
		this.custom_date_range = null;
		this.bind_events();
	}

	bind_events() {
		const me = this;
		
		// Period filter buttons
		$(this.wrapper).on('click', '.filter-btn', function() {
			$('.filter-btn').removeClass('active');
			$(this).addClass('active');
			me.current_period = $(this).data('period');
			
			if (me.current_period === 'custom') {
				$('.custom-date-range').slideDown();
			} else {
				$('.custom-date-range').slideUp();
				me.custom_date_range = null;
				me.refresh();
			}
		});

		// Apply custom date range
		$(this.wrapper).on('click', '#apply-dates', function() {
			const from_date = $('#from-date').val();
			const to_date = $('#to-date').val();
			if (from_date && to_date) {
				me.custom_date_range = { from_date, to_date };
				me.refresh();
			} else {
				frappe.show_alert({
					message: __('Please select both dates'),
					indicator: 'orange'
				}, 3);
			}
		});
	}

	init() {
		this.refresh();
		// Auto-refresh every 30 seconds for realtime mode
		this.start_auto_refresh();
	}

	start_auto_refresh() {
		const me = this;
		if (this.refresh_interval) {
			clearInterval(this.refresh_interval);
		}
		
		this.refresh_interval = setInterval(() => {
			if (me.current_period === 'realtime') {
				me.refresh(true);
			}
		}, 30000); // 30 seconds
	}

	refresh(silent = false) {
		if (!silent) {
			this.show_loading();
		}
		this.load_all_data();
	}

	show_loading() {
		this.wrapper.find('#dashboard-content').html(`
			<div class="loading-state-glass">
				<div class="spinner"></div>
				<p>Loading realtime data...</p>
			</div>
		`);
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
			case 'week':
				from_date = frappe.datetime.add_days(today, -7);
				break;
			case 'month':
				from_date = frappe.datetime.month_start();
				break;
			case 'realtime':
				from_date = today;
				break;
			default:
				from_date = today;
		}

		return { from_date, to_date };
	}

	async load_all_data() {
		try {
			const period = this.get_date_filters();
			
			const [
				doctype_counts,
				user_activity,
				project_billing,
				project_recovery,
				project_profitability,
				sales_trend,
				payment_overview,
				top_users,
				recent_entries,
				doctype_distribution,
				user_doctype_breakdown
			] = await Promise.all([
				this.get_doctype_counts(period),
				this.get_user_activity(period),
				this.get_project_billing(period),
				this.get_project_recovery(period),
				this.get_project_profitability(period),
				this.get_sales_trend(period),
				this.get_payment_overview(period),
				this.get_top_users(period),
				this.get_recent_entries(period),
				this.get_doctype_distribution(period),
				this.get_user_doctype_breakdown(period)
			]);

			this.render_dashboard({
				doctype_counts,
				user_activity,
				project_billing,
				project_recovery,
				project_profitability,
				sales_trend,
				payment_overview,
				top_users,
				recent_entries,
				doctype_distribution,
				user_doctype_breakdown
			});
		} catch (error) {
			console.error('Error loading dashboard:', error);
			frappe.show_alert({
				message: __('Error loading dashboard data'),
				indicator: 'red'
			}, 5);
		}
	}

	async get_doctype_counts(period) {
		const doctypes = [
			'Project', 'Sales Order', 'Purchase Order', 
			'Sales Invoice', 'Purchase Invoice', 'Payment Entry',
			'Journal Entry', 'Employee Advance', 'Expense Claim'
		];

		const counts = {};
		for (const doctype of doctypes) {
			const filters = [];
			if (period.from_date) {
				filters.push(['creation', '>=', period.from_date + ' 00:00:00']);
			}
			if (period.to_date) {
				filters.push(['creation', '<=', period.to_date + ' 23:59:59']);
			}

			const count = await frappe.db.count(doctype, { filters });
			counts[doctype] = count || 0;
		}

		return counts;
	}

	async get_user_activity(period) {
		const filters = [];
		if (period.from_date) {
			filters.push(['creation', '>=', period.from_date + ' 00:00:00']);
		}
		if (period.to_date) {
			filters.push(['creation', '<=', period.to_date + ' 23:59:59']);
		}

		// Get all entries with owner
		const doctypes = ['Sales Invoice', 'Purchase Invoice', 'Payment Entry', 'Sales Order', 'Purchase Order'];
		const user_data = {};

		for (const doctype of doctypes) {
			const entries = await frappe.db.get_list(doctype, {
				filters: filters,
				fields: ['owner'],
				limit: 1000
			});

			entries.forEach(entry => {
				if (!user_data[entry.owner]) {
					user_data[entry.owner] = 0;
				}
				user_data[entry.owner]++;
			});
		}

		// Get user full names
		const users = Object.keys(user_data);
		const user_names = {};
		
		for (const email of users) {
			const user = await frappe.db.get_value('User', email, ['full_name']);
			user_names[email] = user.message?.full_name || email;
		}

		return { counts: user_data, names: user_names };
	}

	async get_project_billing(period) {
		const filters = [['docstatus', '=', 1]];
		if (period.from_date) {
			filters.push(['posting_date', '>=', period.from_date]);
		}
		if (period.to_date) {
			filters.push(['posting_date', '<=', period.to_date]);
		}

		const invoices = await frappe.db.get_list('Sales Invoice', {
			filters: filters,
			fields: ['project', 'grand_total'],
			limit: 1000
		});

		const project_billing = {};
		invoices.forEach(inv => {
			if (inv.project) {
				if (!project_billing[inv.project]) {
					project_billing[inv.project] = 0;
				}
				project_billing[inv.project] += (inv.grand_total || 0);
			}
		});

		return project_billing;
	}

	async get_project_recovery(period) {
		const filters = [['docstatus', '=', 1]];
		if (period.from_date) {
			filters.push(['posting_date', '>=', period.from_date]);
		}
		if (period.to_date) {
			filters.push(['posting_date', '<=', period.to_date]);
		}

		const invoices = await frappe.db.get_list('Sales Invoice', {
			filters: filters,
			fields: ['project', 'grand_total', 'outstanding_amount'],
			limit: 1000
		});

		const project_recovery = {};
		invoices.forEach(inv => {
			if (inv.project) {
				if (!project_recovery[inv.project]) {
					project_recovery[inv.project] = { total: 0, recovered: 0 };
				}
				project_recovery[inv.project].total += (inv.grand_total || 0);
				project_recovery[inv.project].recovered += ((inv.grand_total || 0) - (inv.outstanding_amount || 0));
			}
		});

		return project_recovery;
	}

	async get_project_profitability(period) {
		// Get project billing
		const filters_sales = [['docstatus', '=', 1]];
		if (period.from_date) {
			filters_sales.push(['posting_date', '>=', period.from_date]);
		}
		if (period.to_date) {
			filters_sales.push(['posting_date', '<=', period.to_date]);
		}

		const sales_invoices = await frappe.db.get_list('Sales Invoice', {
			filters: filters_sales,
			fields: ['project', 'grand_total'],
			limit: 1000
		});

		// Get project costs
		const filters_purchase = [['docstatus', '=', 1]];
		if (period.from_date) {
			filters_purchase.push(['posting_date', '>=', period.from_date]);
		}
		if (period.to_date) {
			filters_purchase.push(['posting_date', '<=', period.to_date]);
		}

		const purchase_invoices = await frappe.db.get_list('Purchase Invoice', {
			filters: filters_purchase,
			fields: ['project', 'grand_total'],
			limit: 1000
		});

		const project_profit = {};

		// Calculate revenue
		sales_invoices.forEach(inv => {
			if (inv.project) {
				if (!project_profit[inv.project]) {
					project_profit[inv.project] = { revenue: 0, cost: 0, profit: 0, margin: 0 };
				}
				project_profit[inv.project].revenue += (inv.grand_total || 0);
			}
		});

		// Calculate cost
		purchase_invoices.forEach(inv => {
			if (inv.project) {
				if (!project_profit[inv.project]) {
					project_profit[inv.project] = { revenue: 0, cost: 0, profit: 0, margin: 0 };
				}
				project_profit[inv.project].cost += (inv.grand_total || 0);
			}
		});

		// Calculate profit and margin
		Object.keys(project_profit).forEach(project => {
			const data = project_profit[project];
			data.profit = data.revenue - data.cost;
			data.margin = data.revenue > 0 ? ((data.profit / data.revenue) * 100).toFixed(2) : 0;
		});

		return project_profit;
	}

	async get_sales_trend(period) {
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

		return { labels, datasets: [{ name: 'Sales', values }] };
	}

	async get_payment_overview(period) {
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

		const received = payments.filter(p => p.payment_type === 'Receive').reduce((sum, p) => sum + (p.paid_amount || 0), 0);
		const paid = payments.filter(p => p.payment_type === 'Pay').reduce((sum, p) => sum + (p.paid_amount || 0), 0);

		return { received, paid, total: payments.length };
	}

	async get_top_users(period) {
		const user_activity = await this.get_user_activity(period);
		const sorted = Object.entries(user_activity.counts)
			.map(([email, count]) => ({
				name: user_activity.names[email],
				count: count
			}))
			.sort((a, b) => b.count - a.count)
			.slice(0, 10);

		return sorted;
	}

	async get_recent_entries(period) {
		const filters = [];
		if (period.from_date) {
			filters.push(['creation', '>=', period.from_date + ' 00:00:00']);
		}
		if (period.to_date) {
			filters.push(['creation', '<=', period.to_date + ' 23:59:59']);
		}

		const invoices = await frappe.db.get_list('Sales Invoice', {
			filters: filters,
			fields: ['name', 'customer', 'grand_total', 'creation'],
			limit: 5,
			order_by: 'creation desc'
		});

		return invoices;
	}

	async get_doctype_distribution(period) {
		const counts = await this.get_doctype_counts(period);
		const labels = Object.keys(counts);
		const values = Object.values(counts);

		return {
			labels: labels.map(l => l.replace(' ', '\n')),
			datasets: [{
				name: 'Entries',
				values: values
			}]
		};
	}

	async get_user_doctype_breakdown(period) {
		const filters = [];
		if (period.from_date) {
			filters.push(['creation', '>=', period.from_date + ' 00:00:00']);
		}
		if (period.to_date) {
			filters.push(['creation', '<=', period.to_date + ' 23:59:59']);
		}

		const doctypes = [
			'Sales Invoice', 'Purchase Invoice', 'Sales Order', 
			'Purchase Order', 'Payment Entry'
		];

		const user_breakdown = {};

		for (const doctype of doctypes) {
			const entries = await frappe.db.get_list(doctype, {
				filters: filters,
				fields: ['owner'],
				limit: 1000
			});

			entries.forEach(entry => {
				if (!user_breakdown[entry.owner]) {
					user_breakdown[entry.owner] = {};
				}
				if (!user_breakdown[entry.owner][doctype]) {
					user_breakdown[entry.owner][doctype] = 0;
				}
				user_breakdown[entry.owner][doctype]++;
			});
		}

		// Get user names
		const users = Object.keys(user_breakdown);
		const user_names = {};
		
		for (const email of users) {
			const user = await frappe.db.get_value('User', email, ['full_name']);
			user_names[email] = user.message?.full_name || email;
		}

		return { breakdown: user_breakdown, names: user_names, doctypes };
	}

	render_dashboard(data) {
		const content = this.wrapper.find('#dashboard-content');
		content.html('');

		// Summary cards
		content.append(this.create_summary_cards(data));

		// Charts section
		content.append(this.create_charts_section(data));

		// Project analytics
		content.append(this.create_project_analytics(data));

		// User activity and recent entries
		content.append(this.create_activity_section(data));

		// Render charts
		setTimeout(() => {
			this.render_charts(data);
		}, 100);
	}

	create_summary_cards(data) {
		const cards_html = `
			<div class="glass-cards-grid">
				<div class="glass-card primary-gradient">
					<div class="card-icon"><i class="fa fa-file-invoice"></i></div>
					<div class="card-content">
						<div class="card-label">Sales Invoices</div>
						<div class="card-value">${data.doctype_counts['Sales Invoice'] || 0}</div>
					</div>
				</div>
				<div class="glass-card success-gradient">
					<div class="card-icon"><i class="fa fa-shopping-cart"></i></div>
					<div class="card-content">
						<div class="card-label">Sales Orders</div>
						<div class="card-value">${data.doctype_counts['Sales Order'] || 0}</div>
					</div>
				</div>
				<div class="glass-card warning-gradient">
					<div class="card-icon"><i class="fa fa-receipt"></i></div>
					<div class="card-content">
						<div class="card-label">Purchase Invoices</div>
						<div class="card-value">${data.doctype_counts['Purchase Invoice'] || 0}</div>
					</div>
				</div>
				<div class="glass-card info-gradient">
					<div class="card-icon"><i class="fa fa-credit-card"></i></div>
					<div class="card-content">
						<div class="card-label">Payments</div>
						<div class="card-value">${data.doctype_counts['Payment Entry'] || 0}</div>
					</div>
				</div>
				<div class="glass-card purple-gradient">
					<div class="card-icon"><i class="fa fa-project-diagram"></i></div>
					<div class="card-content">
						<div class="card-label">Projects</div>
						<div class="card-value">${data.doctype_counts['Project'] || 0}</div>
					</div>
				</div>
				<div class="glass-card cyan-gradient">
					<div class="card-icon"><i class="fa fa-book"></i></div>
					<div class="card-content">
						<div class="card-label">Journal Entries</div>
						<div class="card-value">${data.doctype_counts['Journal Entry'] || 0}</div>
					</div>
				</div>
				<div class="glass-card pink-gradient">
					<div class="card-icon"><i class="fa fa-money-bill-wave"></i></div>
					<div class="card-content">
						<div class="card-label">Employee Advances</div>
						<div class="card-value">${data.doctype_counts['Employee Advance'] || 0}</div>
					</div>
				</div>
				<div class="glass-card orange-gradient">
					<div class="card-icon"><i class="fa fa-file-alt"></i></div>
					<div class="card-content">
						<div class="card-label">Expense Claims</div>
						<div class="card-value">${data.doctype_counts['Expense Claim'] || 0}</div>
					</div>
				</div>
			</div>
		`;

		return $(cards_html);
	}

	create_charts_section(data) {
		return $(`
			<div class="charts-grid">
				<div class="glass-chart-container">
					<div class="chart-header">
						<h3><i class="fa fa-chart-line"></i> Sales Trend</h3>
					</div>
					<div class="chart-wrapper" id="sales-trend-chart"></div>
				</div>
				<div class="glass-chart-container">
					<div class="chart-header">
						<h3><i class="fa fa-money-bill-wave"></i> Payment Overview</h3>
					</div>
					<div class="chart-wrapper" id="payment-overview-chart"></div>
				</div>
				<div class="glass-chart-container">
					<div class="chart-header">
						<h3><i class="fa fa-chart-pie"></i> Doctype Distribution</h3>
					</div>
					<div class="chart-wrapper" id="doctype-distribution-chart"></div>
				</div>
				<div class="glass-chart-container">
					<div class="chart-header">
						<h3><i class="fa fa-users-cog"></i> User Doctype Breakdown</h3>
					</div>
					<div class="chart-wrapper" id="user-doctype-chart"></div>
				</div>
				<div class="glass-chart-container">
					<div class="chart-header">
						<h3><i class="fa fa-chart-area"></i> Project Recovery</h3>
					</div>
					<div class="chart-wrapper" id="project-recovery-chart"></div>
				</div>
				<div class="glass-chart-container">
					<div class="chart-header">
						<h3><i class="fa fa-chart-bar"></i> Project Profitability</h3>
					</div>
					<div class="chart-wrapper" id="project-profit-chart"></div>
				</div>
			</div>
		`);
	}

	create_project_analytics(data) {
		const projects = Object.keys(data.project_profitability);
		const project_rows = projects.slice(0, 10).map(project => {
			const profit_data = data.project_profitability[project];
			const profit_class = profit_data.profit >= 0 ? 'positive' : 'negative';
			
			return `
				<tr>
					<td>${project}</td>
					<td>Rs ${this.format_number(profit_data.revenue)}</td>
					<td>Rs ${this.format_number(profit_data.cost)}</td>
					<td class="${profit_class}">Rs ${this.format_number(profit_data.profit)}</td>
					<td class="${profit_class}">${profit_data.margin}%</td>
				</tr>
			`;
		}).join('');

		return $(`
			<div class="glass-table-container">
				<div class="table-header">
					<h3><i class="fa fa-chart-pie"></i> Project Profitability</h3>
				</div>
				<div class="table-wrapper">
					<table class="glass-table">
						<thead>
							<tr>
								<th>Project</th>
								<th>Revenue</th>
								<th>Cost</th>
								<th>Profit</th>
								<th>Margin %</th>
							</tr>
						</thead>
						<tbody>
							${project_rows || '<tr><td colspan="5">No data available</td></tr>'}
						</tbody>
					</table>
				</div>
			</div>
		`);
	}

	create_activity_section(data) {
		const top_users = data.top_users.slice(0, 5).map((user, idx) => `
			<div class="user-activity-item">
				<div class="user-rank">${idx + 1}</div>
				<div class="user-info">
					<div class="user-name">${user.name}</div>
					<div class="user-count">${user.count} entries</div>
				</div>
			</div>
		`).join('');

		const recent_entries = data.recent_entries.map(entry => `
			<div class="recent-entry-item">
				<div class="entry-icon"><i class="fa fa-file-invoice"></i></div>
				<div class="entry-info">
					<div class="entry-name">${entry.name}</div>
					<div class="entry-details">${entry.customer} • Rs ${this.format_number(entry.grand_total)}</div>
				</div>
				<div class="entry-time">${this.time_ago(entry.creation)}</div>
			</div>
		`).join('');

		return $(`
			<div class="activity-grid">
				<div class="glass-activity-container">
					<div class="activity-header">
						<h3><i class="fa fa-users"></i> Top Active Users</h3>
					</div>
					<div class="activity-wrapper">
						${top_users || '<p class="no-data">No activity data</p>'}
					</div>
				</div>
				<div class="glass-activity-container">
					<div class="activity-header">
						<h3><i class="fa fa-clock"></i> Recent Entries</h3>
					</div>
					<div class="activity-wrapper">
						${recent_entries || '<p class="no-data">No recent entries</p>'}
					</div>
				</div>
			</div>
		`);
	}

	render_charts(data) {
		// Sales Trend Chart (Line)
		if (data.sales_trend && data.sales_trend.labels && data.sales_trend.labels.length > 0) {
			const chart_wrapper = this.wrapper.find('#sales-trend-chart')[0];
			if (chart_wrapper) {
				this.charts.sales = new frappe.Chart(chart_wrapper, {
					data: data.sales_trend,
					type: 'line',
					height: 220,
					colors: ['#03a4ed']
				});
			}
		}

		// Payment Overview Chart (Bar)
		const payment_chart_wrapper = this.wrapper.find('#payment-overview-chart')[0];
		if (payment_chart_wrapper) {
			this.charts.payment = new frappe.Chart(payment_chart_wrapper, {
				data: {
					labels: ['Received', 'Paid'],
					datasets: [{
						name: 'Amount',
						values: [data.payment_overview.received, data.payment_overview.paid]
					}]
				},
				type: 'bar',
				height: 220,
				colors: ['#10b981', '#ff695f']
			});
		}

		// Doctype Distribution Chart (Donut)
		if (data.doctype_distribution && data.doctype_distribution.labels) {
			const donut_wrapper = this.wrapper.find('#doctype-distribution-chart')[0];
			if (donut_wrapper) {
				this.charts.donut = new frappe.Chart(donut_wrapper, {
					data: data.doctype_distribution,
					type: 'donut',
					height: 220,
					colors: ['#03a4ed', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ff695f', '#a855f7', '#fb923c', '#ec4899']
				});
			}
		}

		// User Doctype Breakdown Chart (Stacked Bar)
		if (data.user_doctype_breakdown && data.user_doctype_breakdown.breakdown) {
			const top_users = Object.entries(data.user_doctype_breakdown.breakdown)
				.map(([email, counts]) => ({
					email,
					name: data.user_doctype_breakdown.names[email],
					total: Object.values(counts).reduce((a, b) => a + b, 0),
					counts
				}))
				.sort((a, b) => b.total - a.total)
				.slice(0, 5);

			if (top_users.length > 0) {
				const user_labels = top_users.map(u => u.name);
				const datasets = data.user_doctype_breakdown.doctypes.map((doctype, idx) => ({
					name: doctype,
					values: top_users.map(u => u.counts[doctype] || 0)
				}));

				const user_chart_wrapper = this.wrapper.find('#user-doctype-chart')[0];
				if (user_chart_wrapper) {
					this.charts.userDoctype = new frappe.Chart(user_chart_wrapper, {
						data: {
							labels: user_labels,
							datasets: datasets
						},
						type: 'bar',
						height: 220,
						colors: ['#03a4ed', '#10b981', '#f59e0b', '#8b5cf6', '#ff695f'],
						barOptions: {
							stacked: 1
						}
					});
				}
			}
		}

		// Project Recovery Chart (Pie)
		if (data.project_recovery && Object.keys(data.project_recovery).length > 0) {
			const projects = Object.keys(data.project_recovery).slice(0, 5);
			const recovery_percentages = projects.map(p => {
				const rec = data.project_recovery[p];
				return rec.total > 0 ? ((rec.recovered / rec.total) * 100).toFixed(1) : 0;
			});

			const recovery_wrapper = this.wrapper.find('#project-recovery-chart')[0];
			if (recovery_wrapper && projects.length > 0) {
				this.charts.recovery = new frappe.Chart(recovery_wrapper, {
					data: {
						labels: projects,
						datasets: [{
							name: 'Recovery %',
							values: recovery_percentages
						}]
					},
					type: 'pie',
					height: 220,
					colors: ['#10b981', '#03a4ed', '#f59e0b', '#8b5cf6', '#06b6d4']
				});
			}
		}

		// Project Profitability Chart (Bar)
		if (data.project_profitability && Object.keys(data.project_profitability).length > 0) {
			const projects = Object.keys(data.project_profitability).slice(0, 8);
			const profits = projects.map(p => data.project_profitability[p].profit);

			const profit_wrapper = this.wrapper.find('#project-profit-chart')[0];
			if (profit_wrapper && projects.length > 0) {
				this.charts.profit = new frappe.Chart(profit_wrapper, {
					data: {
						labels: projects,
						datasets: [{
							name: 'Profit',
							values: profits
						}]
					},
					type: 'bar',
					height: 220,
					colors: ['#10b981']
				});
			}
		}
	}

	format_number(value) {
		if (value >= 1000000000) {
			return (value / 1000000000).toFixed(2) + ' B';
		} else if (value >= 1000000) {
			return (value / 1000000).toFixed(2) + ' M';
		} else if (value >= 1000) {
			return (value / 1000).toFixed(2) + ' K';
		}
		return value.toFixed(2);
	}

	time_ago(datetime) {
		const now = new Date();
		const past = new Date(datetime);
		const diff = Math.floor((now - past) / 1000); // seconds

		if (diff < 60) return 'Just now';
		if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
		if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
		return Math.floor(diff / 86400) + 'd ago';
	}
}
