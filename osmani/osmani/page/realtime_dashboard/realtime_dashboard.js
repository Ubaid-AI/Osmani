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
					<div class="header-left">
						<h1 class="dashboard-title">
							<i class="fa fa-chart-line"></i>
							Realtime Dashboard
						</h1>
						<p class="dashboard-subtitle">Live business analytics and insights</p>
					</div>
					<div class="header-right">
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

		// Print project profitability
		$(this.wrapper).on('click', '#print-project-profitability', function() {
			me.print_project_profitability();
		});

		// Navigate to user entries summary
		$(this.wrapper).on('click', '.user-activity-item', function(e) {
			e.preventDefault();
			e.stopPropagation();
			const userName = $(this).find('.user-name').text();
			const userEmail = $(this).data('user-email');
			
			// Get current date filters
			const period = me.get_date_filters();
			
			// Navigate using frappe.set_route with proper format
			frappe.route_options = {
				user_email: userEmail,
				user_name: userName,
				from_date: period.from_date,
				to_date: period.to_date,
				period: me.current_period,
				custom_range: me.custom_date_range
			};
			frappe.set_route('user-entries-summary');
		});

		// Make summary cards clickable
		$(this.wrapper).on('click', '.glass-card.clickable-card', function() {
			const doctype = $(this).data('doctype');
			if (doctype) {
				// Get current date filters
				const period = me.get_date_filters();
				const filters = { docstatus: 1 };
				
				// Add date filters for transactional doctypes (not for Project, Customer, Supplier)
				if (doctype !== 'Project' && doctype !== 'Customer' && doctype !== 'Supplier') {
					if (period.from_date) {
						filters.creation = ['>=', period.from_date];
					}
					if (period.to_date) {
						filters.modified = ['<=', period.to_date + ' 23:59:59'];
					}
				}
				
				frappe.route_options = filters;
				frappe.set_route('List', doctype);
			}
		});

		// Make recent entries clickable
		$(this.wrapper).on('click', '.recent-entry-item', function() {
			const doctype = $(this).data('doctype');
			const docname = $(this).data('docname');
			if (doctype && docname) {
				frappe.set_route('Form', doctype, docname);
			}
		});
	}

	init() {
		// Clear existing charts on init to prevent size issues when coming back from other pages
		if (this.charts) {
			Object.keys(this.charts).forEach(key => {
				if (this.charts[key] && this.charts[key].destroy) {
					try {
						this.charts[key].destroy();
					} catch(e) {
						// Ignore errors
					}
				}
			});
		}
		this.charts = {};
		
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
			'Journal Entry', 'Employee Advance', 'Expense Claim',
			'Customer', 'Supplier'
		];

		const counts = {};
		for (const doctype of doctypes) {
			let filters = [];
			
			// Customer and Supplier don't have docstatus, Project, Customer, and Supplier should show total count
			if (doctype === 'Customer' || doctype === 'Supplier') {
				// No filters for Customer and Supplier - just total count
				filters = [];
			} else if (doctype === 'Project') {
				// Project has no date filter, shows total active projects
				filters = [['status', '!=', 'Cancelled']];
			} else {
				// Other doctypes: only submitted documents with date filter
				filters = [['docstatus', '=', 1]];
				if (period.from_date && period.to_date) {
					filters.push(['creation', '>=', period.from_date + ' 00:00:00']);
					filters.push(['creation', '<=', period.to_date + ' 23:59:59']);
				}
			}

			const count = await frappe.db.count(doctype, { filters });
			counts[doctype] = count || 0;
		}

		return counts;
	}

	async get_user_activity(period) {
		const filters = [['docstatus', '=', 1]];
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
				// Map Administrator to ubaid.khanzada@oclits.com
				let owner = entry.owner;
				if (owner === 'Administrator') {
					owner = 'ubaid.khanzada@oclits.com';
				}
				
				if (!user_data[owner]) {
					user_data[owner] = 0;
				}
				user_data[owner]++;
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
				email: email,
				name: user_activity.names[email],
				count: count
			}))
			.sort((a, b) => b.count - a.count)
			.slice(0, 10);

		return sorted;
	}

	async get_recent_entries(period) {
		const filters = [['docstatus', '=', 1]];
		if (period.from_date) {
			filters.push(['creation', '>=', period.from_date + ' 00:00:00']);
		}
		if (period.to_date) {
			filters.push(['creation', '<=', period.to_date + ' 23:59:59']);
		}

		// Fetch recent entries from multiple doctypes
		const doctypes = [
			{ doctype: 'Sales Invoice', fields: ['name', 'customer as party', 'grand_total', 'creation'], party_field: 'customer' },
			{ doctype: 'Purchase Invoice', fields: ['name', 'supplier as party', 'grand_total', 'creation'], party_field: 'supplier' },
			{ doctype: 'Sales Order', fields: ['name', 'customer as party', 'grand_total', 'creation'], party_field: 'customer' },
			{ doctype: 'Purchase Order', fields: ['name', 'supplier as party', 'grand_total', 'creation'], party_field: 'supplier' },
			{ doctype: 'Payment Entry', fields: ['name', 'party as party', 'paid_amount as grand_total', 'creation'], party_field: 'party' },
			{ doctype: 'Journal Entry', fields: ['name', 'title as party', 'total_debit as grand_total', 'creation'], party_field: 'title' },
			{ doctype: 'Employee Advance', fields: ['name', 'employee_name as party', 'advance_amount as grand_total', 'creation'], party_field: 'employee_name' },
			{ doctype: 'Expense Claim', fields: ['name', 'employee_name as party', 'total_sanctioned_amount as grand_total', 'creation'], party_field: 'employee_name' }
		];

		let all_entries = [];

		for (const dt of doctypes) {
			try {
				const entries = await frappe.db.get_list(dt.doctype, {
					filters: filters,
					fields: dt.fields,
					limit: 3,
					order_by: 'creation desc'
				});

				// Add doctype to each entry
				entries.forEach(entry => {
					entry.doctype = dt.doctype;
				});

				all_entries = all_entries.concat(entries);
			} catch (error) {
				// Silently handle errors for individual doctypes
			}
		}

		// Sort all entries by creation date and take top 10
		all_entries.sort((a, b) => new Date(b.creation) - new Date(a.creation));
		return all_entries.slice(0, 10);
	}

	async get_doctype_distribution(period) {
		const counts = await this.get_doctype_counts(period);
		// Filter out Project, Customer, Supplier from distribution chart
		const filtered_counts = {};
		Object.keys(counts).forEach(key => {
			if (key !== 'Project' && key !== 'Customer' && key !== 'Supplier') {
				filtered_counts[key] = counts[key];
			}
		});
		
		const labels = Object.keys(filtered_counts);
		const values = Object.values(filtered_counts);

		return {
			labels: labels.map(l => l.replace(' ', '\n')),
			datasets: [{
				name: 'Entries',
				values: values
			}]
		};
	}

	async get_user_doctype_breakdown(period) {
		const filters = [['docstatus', '=', 1]];
		if (period.from_date) {
			filters.push(['creation', '>=', period.from_date + ' 00:00:00']);
		}
		if (period.to_date) {
			filters.push(['creation', '<=', period.to_date + ' 23:59:59']);
		}

		const doctypes = [
			'Sales Invoice', 'Purchase Invoice', 'Sales Order', 
			'Purchase Order', 'Payment Entry', 'Journal Entry',
			'Employee Advance', 'Expense Claim'
		];

		const user_breakdown = {};

		for (const doctype of doctypes) {
			const entries = await frappe.db.get_list(doctype, {
				filters: filters,
				fields: ['owner'],
				limit: 1000
			});

			entries.forEach(entry => {
				// Map Administrator to ubaid.khanzada@oclits.com
				let owner = entry.owner;
				if (owner === 'Administrator') {
					owner = 'ubaid.khanzada@oclits.com';
				}
				
				if (!user_breakdown[owner]) {
					user_breakdown[owner] = {};
				}
				if (!user_breakdown[owner][doctype]) {
					user_breakdown[owner][doctype] = 0;
				}
				user_breakdown[owner][doctype]++;
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
		
		// Clear any existing charts BEFORE clearing content to prevent size issues
		if (this.charts) {
			Object.keys(this.charts).forEach(key => {
				if (this.charts[key] && this.charts[key].destroy) {
					try {
						this.charts[key].destroy();
					} catch(e) {
						// Ignore errors
					}
				}
			});
		}
		this.charts = {};
		
		// Now clear content
		content.html('');

		// Summary cards section with spacing
		const cardsSection = $('<div class="dashboard-section cards-section"></div>');
		cardsSection.append(this.create_summary_cards(data));
		content.append(cardsSection);

		// Charts section with spacing
		const chartsSection = $('<div class="dashboard-section charts-section"></div>');
		chartsSection.append(this.create_charts_section(data));
		content.append(chartsSection);

		// Reports section (Project Profitability and Top Active Users side by side)
		const reportsSection = $('<div class="dashboard-section reports-section"></div>');
		const reportsGrid = $('<div class="glass-activity-grid"></div>');
		reportsGrid.append(this.create_project_analytics(data));
		reportsGrid.append(this.create_top_users_section(data));
		reportsSection.append(reportsGrid);
		content.append(reportsSection);

		// Recent Entries section
		const recentEntriesSection = $('<div class="dashboard-section recent-entries-section"></div>');
		recentEntriesSection.append(this.create_recent_entries_section(data));
		content.append(recentEntriesSection);

		// Render charts with longer delay and force redraw
		setTimeout(() => {
			this.render_charts(data);
			// Force browser repaint
			this.wrapper.find('#dashboard-content')[0].offsetHeight;
		}, 200);
	}

	create_summary_cards(data) {
		const cards_html = `
			<div class="glass-cards-grid">
				<div class="glass-card primary-gradient clickable-card" data-doctype="Sales Invoice" style="cursor: pointer;" title="Click to view Sales Invoice list">
					<div class="card-header-row">
						<div class="card-icon">
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>
						</div>
						<div class="card-label">Sales Invoice</div>
					</div>
					<div class="card-value">${data.doctype_counts['Sales Invoice'] || 0}</div>
				</div>
				<div class="glass-card success-gradient clickable-card" data-doctype="Sales Order" style="cursor: pointer;" title="Click to view Sales Order list">
					<div class="card-header-row">
						<div class="card-icon">
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-9.8-3.2l.9-1.6C9 12.6 10.4 12 12 12c1.6 0 3 .6 3.9 1.6l.9 1.6H7.2zm9.1-5.5l-1.7-1.7c-.4-.4-1-.4-1.4 0l-1.4 1.4-1.4-1.4c-.4-.4-1-.4-1.4 0l-1.7 1.7c-.4.4-.4 1 0 1.4l1.4 1.4-1.4 1.4c-.4.4-.4 1 0 1.4l1.7 1.7c.4.4 1 .4 1.4 0l1.4-1.4 1.4 1.4c.4.4 1 .4 1.4 0l1.7-1.7c.4-.4.4-1 0-1.4l-1.4-1.4 1.4-1.4c.4-.4.4-1 0-1.4z"/></svg>
						</div>
						<div class="card-label">Sales Order</div>
					</div>
					<div class="card-value">${data.doctype_counts['Sales Order'] || 0}</div>
				</div>
				<div class="glass-card warning-gradient clickable-card" data-doctype="Purchase Invoice" style="cursor: pointer;" title="Click to view Purchase Invoice list">
					<div class="card-header-row">
						<div class="card-icon">
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/></svg>
						</div>
						<div class="card-label">Purchase Invoice</div>
					</div>
					<div class="card-value">${data.doctype_counts['Purchase Invoice'] || 0}</div>
				</div>
				<div class="glass-card info-gradient clickable-card" data-doctype="Payment Entry" style="cursor: pointer;" title="Click to view Payment Entry list">
					<div class="card-header-row">
						<div class="card-icon">
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/><circle cx="12" cy="15" r="2"/></svg>
						</div>
						<div class="card-label">Payment Entry</div>
					</div>
					<div class="card-value">${data.doctype_counts['Payment Entry'] || 0}</div>
				</div>
				<div class="glass-card purple-gradient clickable-card" data-doctype="Project" style="cursor: pointer;" title="Click to view Project list">
					<div class="card-header-row">
						<div class="card-icon">
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/><path d="M7 12h2v5H7zm4-3h2v8h-2zm4-3h2v11h-2z"/></svg>
						</div>
						<div class="card-label">Project</div>
					</div>
					<div class="card-value">${data.doctype_counts['Project'] || 0}</div>
				</div>
				<div class="glass-card cyan-gradient clickable-card" data-doctype="Journal Entry" style="cursor: pointer;" title="Click to view Journal Entry list">
					<div class="card-header-row">
						<div class="card-icon">
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 18H6V4h12v16z"/><path d="M8 6h8v2H8zm0 4h8v2H8zm0 4h5v2H8z"/></svg>
						</div>
						<div class="card-label">Journal Entry</div>
					</div>
					<div class="card-value">${data.doctype_counts['Journal Entry'] || 0}</div>
				</div>
				<div class="glass-card pink-gradient clickable-card" data-doctype="Employee Advance" style="cursor: pointer;" title="Click to view Employee Advance list">
					<div class="card-header-row">
						<div class="card-icon">
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/><path d="M12.5 7H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
						</div>
						<div class="card-label">Employee Advance</div>
					</div>
					<div class="card-value">${data.doctype_counts['Employee Advance'] || 0}</div>
				</div>
				<div class="glass-card orange-gradient clickable-card" data-doctype="Expense Claim" style="cursor: pointer;" title="Click to view Expense Claim list">
					<div class="card-header-row">
						<div class="card-icon">
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/><path d="M8 16h8v2H8zm0-4h8v2H8z"/></svg>
						</div>
						<div class="card-label">Expense Claim</div>
					</div>
					<div class="card-value">${data.doctype_counts['Expense Claim'] || 0}</div>
				</div>
				<div class="glass-card teal-gradient clickable-card" data-doctype="Purchase Order" style="cursor: pointer;" title="Click to view Purchase Order list">
					<div class="card-header-row">
						<div class="card-icon">
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2zm-7 14c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"/></svg>
						</div>
						<div class="card-label">Purchase Order</div>
					</div>
					<div class="card-value">${data.doctype_counts['Purchase Order'] || 0}</div>
				</div>
				<div class="glass-card blue-gradient clickable-card" data-doctype="Customer" style="cursor: pointer;" title="Click to view Customer list">
					<div class="card-header-row">
						<div class="card-icon">
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
						</div>
						<div class="card-label">Customer</div>
					</div>
					<div class="card-value">${data.doctype_counts['Customer'] || 0}</div>
				</div>
				<div class="glass-card indigo-gradient clickable-card" data-doctype="Supplier" style="cursor: pointer;" title="Click to view Supplier list">
					<div class="card-header-row">
						<div class="card-icon">
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M20 6h-3V4c0-1.11-.89-2-2-2H9c-1.11 0-2 .89-2 2v2H4c-1.11 0-2 .89-2 2v11c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zM9 4h6v2H9V4zm11 15H4V8h3v2h2V8h6v2h2V8h3v11z"/></svg>
						</div>
						<div class="card-label">Supplier</div>
					</div>
					<div class="card-value">${data.doctype_counts['Supplier'] || 0}</div>
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
						<h3>
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16" style="margin-right: 8px; vertical-align: middle;"><path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 6-6" stroke="currentColor" stroke-width="2" fill="none"/></svg>
							Sales Entry Trend
						</h3>
					</div>
					<div class="chart-wrapper" id="sales-trend-chart"></div>
				</div>
				<div class="glass-chart-container">
					<div class="chart-header">
						<h3>
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16" style="margin-right: 8px; vertical-align: middle;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
							Payment Entry Overview
						</h3>
					</div>
					<div class="chart-wrapper" id="payment-overview-chart"></div>
				</div>
				<div class="glass-chart-container">
					<div class="chart-header">
						<h3>
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16" style="margin-right: 8px; vertical-align: middle;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/><path d="M12 6v6l4 2"/></svg>
							Entry Distribution
						</h3>
					</div>
					<div class="chart-wrapper" id="doctype-distribution-chart"></div>
				</div>
				<div class="glass-chart-container">
					<div class="chart-header">
						<h3>
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16" style="margin-right: 8px; vertical-align: middle;"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
							User Entry Breakdown
						</h3>
					</div>
					<div class="chart-wrapper" id="user-doctype-chart"></div>
				</div>
				<div class="glass-chart-container">
					<div class="chart-header">
						<h3>
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16" style="margin-right: 8px; vertical-align: middle;"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/><path d="M7 10h10v2H7zm0 4h7v2H7z"/></svg>
							Project Recovery
						</h3>
					</div>
					<div class="chart-wrapper" id="project-recovery-chart"></div>
				</div>
				<div class="glass-chart-container">
					<div class="chart-header">
						<h3>
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16" style="margin-right: 8px; vertical-align: middle;"><path d="M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2zm0 16H5V5h14v14z"/><path d="M7 12h2v5H7zm4-3h2v8h-2zm4-3h2v11h-2z"/></svg>
							Project Profitability
						</h3>
					</div>
					<div class="chart-wrapper" id="project-profit-chart"></div>
				</div>
			</div>
		`);
	}

	create_project_analytics(data) {
		const projects = Object.keys(data.project_profitability);
		
		// Calculate totals
		let total_revenue = 0;
		let total_cost = 0;
		let total_profit = 0;
		
		const project_rows = projects.map(project => {
			const profit_data = data.project_profitability[project];
			const profit_class = profit_data.profit >= 0 ? 'positive' : 'negative';
			
			// Add to totals
			total_revenue += profit_data.revenue;
			total_cost += profit_data.cost;
			total_profit += profit_data.profit;
			
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
		
		// Calculate total margin
		const total_margin = total_revenue > 0 ? ((total_profit / total_revenue) * 100).toFixed(2) : 0;
		const total_class = total_profit >= 0 ? 'positive' : 'negative';
		
		const total_row = `
			<tr class="total-row">
				<td><strong>Total</strong></td>
				<td><strong>Rs ${this.format_number(total_revenue)}</strong></td>
				<td><strong>Rs ${this.format_number(total_cost)}</strong></td>
				<td class="${total_class}"><strong>Rs ${this.format_number(total_profit)}</strong></td>
				<td class="${total_class}"><strong>${total_margin}%</strong></td>
			</tr>
		`;
		
		// Determine if table should be scrollable
		const scroll_class = projects.length > 8 ? 'scrollable' : '';

		return $(`
			<div class="glass-table-container" id="project-profitability-section">
				<div class="table-header">
					<h3>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18" style="margin-right: 8px; vertical-align: middle;"><path d="M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2zm0 16H5V5h14v14z"/><path d="M7 12h2v5H7zm4-3h2v8h-2zm4-3h2v11h-2z"/></svg>
						Project Profitability
					</h3>
					<div class="table-actions">
						<button class="action-btn-small" id="print-project-profitability" title="Print Report">
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
								<path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/>
							</svg>
						</button>
					</div>
				</div>
				<div class="table-wrapper ${scroll_class}">
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
						<tfoot>
							${total_row}
						</tfoot>
					</table>
				</div>
			</div>
		`);
	}

	create_top_users_section(data) {
		const top_users = data.top_users.slice(0, 5).map((user, idx) => `
			<div class="user-activity-item" data-user-email="${user.email}" style="cursor: pointer;" title="Click to view detailed entries">
				<div class="user-rank">${idx + 1}</div>
				<div class="user-info">
					<div class="user-name">${user.name}</div>
					<div class="user-count">${user.count} Entries</div>
				</div>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16" style="opacity: 0.5;">
					<path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
				</svg>
			</div>
		`).join('');

		return $(`
			<div class="glass-activity-container">
				<div class="activity-header">
					<h3>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18" style="margin-right: 8px; vertical-align: middle;"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
						Top Active Users
					</h3>
				</div>
				<div class="activity-wrapper">
					${top_users || '<p class="no-data">No activity data</p>'}
				</div>
			</div>
		`);
	}

	create_recent_entries_section(data) {
		const recent_entries = data.recent_entries.map(entry => {
			// Get icon and doctype - ensure doctype is properly set
			let icon_svg = '';
			let details = '';
			let doctype = entry.doctype;
			const docname = entry.name || '';
			const party = entry.party || 'N/A';
			const amount = entry.grand_total || 0;
			
			if (doctype === 'Sales Invoice') {
				icon_svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>';
				details = `${party} • Rs ${this.format_number(amount)}`;
			} else if (doctype === 'Purchase Invoice') {
				icon_svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/></svg>';
				details = `${party} • Rs ${this.format_number(amount)}`;
			} else if (doctype === 'Sales Order') {
				icon_svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>';
				details = `${party} • Rs ${this.format_number(amount)}`;
			} else if (doctype === 'Purchase Order') {
				icon_svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2z"/></svg>';
				details = `${party} • Rs ${this.format_number(amount)}`;
			} else if (doctype === 'Payment Entry') {
				icon_svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/><circle cx="12" cy="12" r="3"/></svg>';
				details = `${party} • Rs ${this.format_number(amount)}`;
			} else if (doctype === 'Journal Entry') {
				icon_svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 18H6V4h12v16z"/><path d="M8 6h8v2H8zm0 4h8v2H8zm0 4h5v2H8z"/></svg>';
				details = `${party} • Rs ${this.format_number(amount)}`;
			} else if (doctype === 'Employee Advance') {
				icon_svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/><path d="M12.5 7H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>';
				details = `${party} • Rs ${this.format_number(amount)}`;
			} else if (doctype === 'Expense Claim') {
				icon_svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/><path d="M8 16h8v2H8zm0-4h8v2H8z"/></svg>';
				details = `${party} • Rs ${this.format_number(amount)}`;
			} else {
				// Default icon
				doctype = doctype || 'Document';
				icon_svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>';
				details = `${party}`;
			}
			
			return `
				<div class="recent-entry-item" data-doctype="${doctype}" data-docname="${docname}" style="cursor: pointer;" title="Click to open ${doctype}">
					<div class="entry-icon">${icon_svg}</div>
					<div class="entry-info">
						<div class="entry-doctype">${doctype}</div>
						<div class="entry-name">${docname}</div>
						<div class="entry-details">${details}</div>
					</div>
					<div class="entry-time">${this.time_ago(entry.creation)}</div>
				</div>
			`;
		}).join('');

		return $(`
			<div class="glass-activity-container">
				<div class="activity-header">
					<h3>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18" style="margin-right: 8px; vertical-align: middle;"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/><path d="M12.5 7H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
						Recent Entries
					</h3>
				</div>
				<div class="activity-wrapper">
					${recent_entries || '<p class="no-data">No recent entries</p>'}
				</div>
			</div>
		`);
	}

	render_charts(data) {
		// Common chart options for light text colors
		const chart_options = {
			axisOptions: {
				xAxisMode: 'tick',
				xIsSeries: false
			},
			tooltipOptions: {
				formatTooltipX: d => (d + '').toUpperCase(),
				formatTooltipY: d => d + ' pts'
			}
		};

		// Sales Trend Chart (Line)
		if (data.sales_trend && data.sales_trend.labels && data.sales_trend.labels.length > 0) {
			const chart_wrapper = this.wrapper.find('#sales-trend-chart')[0];
			if (chart_wrapper) {
				this.charts.sales = new frappe.Chart(chart_wrapper, {
					data: data.sales_trend,
					type: 'line',
					height: 220,
					colors: ['#03a4ed'],
					axisOptions: {
						xAxisMode: 'tick',
						xIsSeries: false
					}
				});
				// Apply light colors to chart elements
				setTimeout(() => this.apply_light_chart_colors(chart_wrapper), 100);
			}
		}

		// Payment Overview Chart (Bar)
		const payment_chart_wrapper = this.wrapper.find('#payment-overview-chart')[0];
		if (payment_chart_wrapper && data.payment_overview) {
			const received = data.payment_overview.received || 0;
			const paid = data.payment_overview.paid || 0;
			
			this.charts.payment = new frappe.Chart(payment_chart_wrapper, {
				data: {
					labels: ['Received', 'Paid'],
					datasets: [{
						name: 'Amount',
						values: [received, paid]
					}]
				},
				type: 'bar',
				height: 220,
				colors: ['#10b981', '#ff695f'],
				axisOptions: {
					xAxisMode: 'tick',
					xIsSeries: false
				}
			});
			setTimeout(() => this.apply_light_chart_colors(payment_chart_wrapper), 100);
		}

		// Doctype Distribution Chart (Donut)
		if (data.doctype_distribution && data.doctype_distribution.labels && data.doctype_distribution.labels.length > 0) {
			// Filter out entries with zero or invalid values
			const filtered_data = {
				labels: [],
				datasets: [{
					name: 'Entries',
					values: []
				}]
			};
			
			data.doctype_distribution.labels.forEach((label, idx) => {
				const value = data.doctype_distribution.datasets[0].values[idx];
				if (value > 0 && !isNaN(value)) {
					filtered_data.labels.push(label);
					filtered_data.datasets[0].values.push(value);
				}
			});
			
			// Only render if we have valid data
			if (filtered_data.labels.length > 0) {
				const donut_wrapper = this.wrapper.find('#doctype-distribution-chart')[0];
				if (donut_wrapper) {
					this.charts.donut = new frappe.Chart(donut_wrapper, {
						data: filtered_data,
						type: 'donut',
						height: 220,
						colors: ['#03a4ed', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ff695f', '#a855f7', '#fb923c', '#ec4899']
					});
					setTimeout(() => this.apply_light_chart_colors(donut_wrapper), 100);
				}
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
						colors: ['#03a4ed', '#10b981', '#f59e0b', '#8b5cf6', '#ff695f', '#06b6d4', '#a855f7', '#fb923c'],
						barOptions: {
							stacked: 1
						},
						axisOptions: {
							xAxisMode: 'tick',
							xIsSeries: false
						}
					});
					setTimeout(() => this.apply_light_chart_colors(user_chart_wrapper), 100);
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
				setTimeout(() => this.apply_light_chart_colors(recovery_wrapper), 100);
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
					colors: ['#10b981'],
					axisOptions: {
						xAxisMode: 'tick',
						xIsSeries: false
					}
				});
				setTimeout(() => this.apply_light_chart_colors(profit_wrapper), 100);
			}
		}
	}

	apply_light_chart_colors(chart_wrapper) {
		// Apply light colors to all text elements in the chart
		setTimeout(() => {
			const svg = chart_wrapper.querySelector('svg');
			if (svg) {
				// Apply light color to all text elements
				const texts = svg.querySelectorAll('text');
				texts.forEach(text => {
					text.style.fill = '#cbd5e1';
					text.style.fontWeight = '500';
				});
				
				// Apply light color to axis lines
				const lines = svg.querySelectorAll('line');
				lines.forEach(line => {
					if (line.classList.contains('x-line') || line.classList.contains('y-line')) {
						line.style.stroke = 'rgba(255, 255, 255, 0.1)';
					}
				});
				
				// Apply light color to axis paths
				const paths = svg.querySelectorAll('path.path-line');
				paths.forEach(path => {
					if (!path.classList.contains('dataset-path')) {
						path.style.stroke = 'rgba(255, 255, 255, 0.1)';
					}
				});
			}
		}, 200);
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

	print_project_profitability() {
		const section = document.querySelector('#project-profitability-section');
		if (!section) return;

		// Format date as 21-JAN-2026
		const now = new Date();
		const day = String(now.getDate()).padStart(2, '0');
		const month = now.toLocaleString('en-US', { month: 'short' }).toUpperCase();
		const year = now.getFullYear();
		const formattedDate = `${day}-${month}-${year}`;

		// Get table content without the total row
		const tableWrapper = section.querySelector('.table-wrapper');
		const table = tableWrapper.querySelector('table').cloneNode(true);
		
		// Remove total row from tbody (it will be added in tfoot)
		const tbody = table.querySelector('tbody');
		const tfoot = table.querySelector('tfoot');
		
		const printWindow = window.open('', '_blank');
		printWindow.document.write(`
			<html>
				<head>
					<title>Project Profitability Report</title>
					<style>
						* { margin: 0; padding: 0; box-sizing: border-box; }
						body { 
							font-family: Arial, sans-serif; 
							padding: 20px; 
							color: #000;
						}
						.report-header {
							margin-bottom: 30px;
							position: relative;
						}
						h1 { 
							text-align: center;
							color: #000;
							font-size: 24px;
							font-weight: bold;
							margin-bottom: 10px;
						}
						.print-date {
							text-align: right;
							font-size: 11px;
							color: #000;
							margin-top: 5px;
						}
						table { 
							width: 100%; 
							border-collapse: collapse; 
							margin-top: 20px;
						}
						th, td { 
							border: 1px solid #000; 
							padding: 10px;
							color: #000;
						}
						th { 
							background-color: #f0f0f0;
							color: #000;
							font-weight: bold;
							text-align: center;
						}
						td {
							text-align: left;
						}
						td:nth-child(2), td:nth-child(3), td:nth-child(4), td:nth-child(5) {
							text-align: right;
						}
						.positive { 
							color: #000;
							font-weight: normal;
						}
						.negative { 
							color: #000;
							font-weight: normal;
						}
						tfoot {
							page-break-inside: avoid;
						}
						tfoot td { 
							background-color: #e0e0e0;
							font-weight: bold;
							border-top: 2px solid #000;
						}
						@media print {
							body { 
								padding: 15mm;
							}
							@page { 
								margin: 15mm;
								size: A4 portrait;
							}
							thead {
								display: table-header-group;
							}
							tfoot {
								display: table-footer-group;
								page-break-inside: avoid;
							}
							tbody {
								page-break-inside: auto;
							}
							tr {
								page-break-inside: avoid;
								page-break-after: auto;
							}
						}
					</style>
				</head>
				<body>
					<div class="report-header">
						<h1>Project Profitability Report</h1>
						<div class="print-date">Printed on: ${formattedDate}</div>
					</div>
					${table.outerHTML}
				</body>
			</html>
		`);
		printWindow.document.close();
		printWindow.focus();
		setTimeout(() => {
			printWindow.print();
			printWindow.close();
		}, 250);
	}
}
