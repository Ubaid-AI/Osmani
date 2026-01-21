frappe.pages['user-entries-summary'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'User Entries Summary',
		single_column: true
	});

	let dashboard = new UserEntriesSummary(page);
	dashboard.init();
};

class UserEntriesSummary {
	constructor(page) {
		this.page = page;
		this.wrapper = page.main;
		this.user_email = null;
		this.user_name = null;
		this.current_period = 'realtime';
		this.custom_date_range = null;
		this.from_date = null;
		this.to_date = null;
		this.setup();
	}

	setup() {
		this.wrapper.html(`
			<div class="user-entries-dashboard">
				<div class="dashboard-header-glass">
					<div class="header-content">
						<h1 class="dashboard-title">
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="28" height="28" style="margin-right: 12px;">
								<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
							</svg>
							<span id="user-name-title">User Entries Summary</span>
						</h1>
						<p class="dashboard-subtitle">Detailed breakdown of user activities</p>
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
					<div class="dashboard-actions">
						<div class="user-filter-container">
							<label for="user-filter" style="color: #cbd5e1; font-size: 13px; margin-right: 8px;">Select User:</label>
							<select class="user-filter-select" id="user-filter">
								<option value="">Loading users...</option>
							</select>
						</div>
						<button class="action-btn" id="back-to-dashboard">
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
								<path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
							</svg>
							Back to Dashboard
						</button>
						<button class="action-btn" id="print-user-summary">
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
								<path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/>
							</svg>
							Print
						</button>
					</div>
				</div>
				<div class="dashboard-content" id="dashboard-content">
					<div class="loading-state-glass">
						<div class="spinner"></div>
						<p>Loading user entries...</p>
					</div>
				</div>
			</div>
		`);

		this.bind_events();
		this.load_users();
	}

	bind_events() {
		const me = this;

		$(this.wrapper).on('click', '#back-to-dashboard', function() {
			frappe.set_route('realtime-dashboard');
		});

		$(this.wrapper).on('click', '#print-user-summary', function() {
			window.print();
		});

		$(this.wrapper).on('change', '#user-filter', function() {
			const selectedEmail = $(this).val();
			const selectedName = $(this).find('option:selected').text();
			
			if (selectedEmail) {
				me.user_email = selectedEmail;
				me.user_name = selectedName;
				me.refresh();
			}
		});

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
				me.from_date = null;
				me.to_date = null;
				if (me.user_email) {
					me.refresh();
				}
			}
		});

		// Apply custom date range
		$(this.wrapper).on('click', '#apply-dates', function() {
			const from_date = $('#from-date').val();
			const to_date = $('#to-date').val();
			if (from_date && to_date) {
				me.custom_date_range = { from_date, to_date };
				me.from_date = from_date;
				me.to_date = to_date;
				if (me.user_email) {
					me.refresh();
				}
			} else {
				frappe.show_alert({
					message: __('Please select both dates'),
					indicator: 'orange'
				}, 3);
			}
		});
	}

	init() {
		// Check for route options from navigation
		if (frappe.route_options) {
			if (frappe.route_options.user_email) {
				this.user_email = frappe.route_options.user_email;
				this.user_name = frappe.route_options.user_name || this.user_email;
			}
			
			// Get date filters if passed
			if (frappe.route_options.from_date) {
				this.from_date = frappe.route_options.from_date;
				this.to_date = frappe.route_options.to_date;
				this.current_period = frappe.route_options.period || 'custom';
				this.custom_date_range = frappe.route_options.custom_range;
				
				// Set the active filter button
				setTimeout(() => {
					$('.filter-btn').removeClass('active');
					$(`.filter-btn[data-period="${this.current_period}"]`).addClass('active');
					
					// If custom, show and populate date inputs
					if (this.current_period === 'custom' && this.custom_date_range) {
						$('#from-date').val(this.custom_date_range.from_date);
						$('#to-date').val(this.custom_date_range.to_date);
						$('.custom-date-range').show();
					}
				}, 100);
			}
			
			// Clear route options after reading
			frappe.route_options = null;
		}

		// If user is set, refresh data
		if (this.user_email) {
			this.refresh();
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

	async load_users() {
		try {
			// Get all users who have created entries
			const users = await frappe.db.get_list('User', {
				filters: [
					['enabled', '=', 1],
					['user_type', '=', 'System User']
				],
				fields: ['email', 'full_name'],
				order_by: 'full_name',
				limit: 500
			});

			const select = $('#user-filter');
			select.empty();
			select.append('<option value="">Select a user...</option>');
			
			users.forEach(user => {
				const selected = user.email === this.user_email ? 'selected' : '';
				select.append(`<option value="${user.email}" ${selected}>${user.full_name || user.email}</option>`);
			});
		} catch (error) {
			console.error('Error loading users:', error);
		}
	}

	refresh() {
		this.show_loading();
		this.load_user_data();
	}

	show_loading() {
		this.wrapper.find('#dashboard-content').html(`
			<div class="loading-state-glass">
				<div class="spinner"></div>
				<p>Loading user entries...</p>
			</div>
		`);
	}

	async load_user_data() {
		try {
			if (!this.user_email) {
				this.render_no_user();
				return;
			}

			// Update title
			$('#user-name-title').text(this.user_name + ' - Entries Summary');

			const [
				entry_counts,
				detailed_entries,
				date_wise_entries,
				monthly_trend
			] = await Promise.all([
				this.get_user_entry_counts(),
				this.get_detailed_entries(),
				this.get_date_wise_entries(),
				this.get_monthly_trend()
			]);

			this.render_dashboard({
				entry_counts,
				detailed_entries,
				date_wise_entries,
				monthly_trend
			});
		} catch (error) {
			console.error('Error loading user data:', error);
			frappe.show_alert({
				message: __('Error loading user data'),
				indicator: 'red'
			}, 5);
		}
	}

	async get_user_entry_counts() {
		const period = this.get_date_filters();
		const doctypes = [
			'Sales Invoice', 'Purchase Invoice', 'Sales Order', 
			'Purchase Order', 'Payment Entry', 'Journal Entry',
			'Employee Advance', 'Expense Claim', 'Project',
			'Customer', 'Supplier'
		];

		const counts = {};
		let total = 0;

		for (const doctype of doctypes) {
			const filters = [
				['docstatus', '=', 1],
				['owner', '=', this.user_email]
			];
			
			// Add date filters
			if (period.from_date) {
				filters.push(['creation', '>=', period.from_date + ' 00:00:00']);
			}
			if (period.to_date) {
				filters.push(['creation', '<=', period.to_date + ' 23:59:59']);
			}

			const count = await frappe.db.count(doctype, { filters });
			counts[doctype] = count || 0;
			total += counts[doctype];
		}

		counts['Total'] = total;
		return counts;
	}

	async get_detailed_entries() {
		const period = this.get_date_filters();
		const doctypes = [
			'Sales Invoice', 'Purchase Invoice', 'Sales Order', 
			'Purchase Order', 'Payment Entry', 'Journal Entry',
			'Employee Advance', 'Expense Claim'
		];

		const detailed = {};

		for (const doctype of doctypes) {
			const filters = [
				['docstatus', '=', 1],
				['owner', '=', this.user_email]
			];
			
			// Add date filters
			if (period.from_date) {
				filters.push(['creation', '>=', period.from_date + ' 00:00:00']);
			}
			if (period.to_date) {
				filters.push(['creation', '<=', period.to_date + ' 23:59:59']);
			}

			const entries = await frappe.db.get_list(doctype, {
				filters: filters,
				fields: ['name', 'creation', 'modified'],
				limit: 10,
				order_by: 'creation desc'
			});

			detailed[doctype] = entries;
		}

		return detailed;
	}

	async get_date_wise_entries() {
		const period = this.get_date_filters();
		const filters = [
			['docstatus', '=', 1],
			['owner', '=', this.user_email]
		];
		
		// Add date filters
		if (period.from_date) {
			filters.push(['creation', '>=', period.from_date + ' 00:00:00']);
		}
		if (period.to_date) {
			filters.push(['creation', '<=', period.to_date + ' 23:59:59']);
		}

		// Get data based on date range
		const doctypes = ['Sales Invoice', 'Purchase Invoice', 'Payment Entry', 'Sales Order', 'Purchase Order'];
		const date_counts = {};

		for (const doctype of doctypes) {
			const entries = await frappe.db.get_list(doctype, {
				filters: filters,
				fields: ['creation'],
				limit: 1000
			});

			entries.forEach(entry => {
				const date = entry.creation.split(' ')[0];
				if (!date_counts[date]) {
					date_counts[date] = 0;
				}
				date_counts[date]++;
			});
		}

		return date_counts;
	}

	async get_monthly_trend() {
		const period = this.get_date_filters();
		const filters = [
			['docstatus', '=', 1],
			['owner', '=', this.user_email]
		];
		
		// Add date filters
		if (period.from_date) {
			filters.push(['creation', '>=', period.from_date + ' 00:00:00']);
		}
		if (period.to_date) {
			filters.push(['creation', '<=', period.to_date + ' 23:59:59']);
		}

		const doctypes = ['Sales Invoice', 'Purchase Invoice', 'Payment Entry', 'Sales Order', 'Purchase Order'];
		const monthly_data = {};

		for (const doctype of doctypes) {
			const entries = await frappe.db.get_list(doctype, {
				filters: filters,
				fields: ['creation'],
				limit: 1000
			});

			entries.forEach(entry => {
				const date = new Date(entry.creation);
				const month = date.toLocaleString('default', { month: 'short', year: 'numeric' });
				
				if (!monthly_data[month]) {
					monthly_data[month] = {};
				}
				if (!monthly_data[month][doctype]) {
					monthly_data[month][doctype] = 0;
				}
				monthly_data[month][doctype]++;
			});
		}

		return monthly_data;
	}

	render_no_user() {
		const content = this.wrapper.find('#dashboard-content');
		content.html(`
			<div class="glass-container" style="padding: 60px; text-align: center;">
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="64" height="64" style="color: #cbd5e1; margin-bottom: 20px;">
					<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
				</svg>
				<h3 style="color: #fff; margin-bottom: 10px;">No User Selected</h3>
				<p style="color: #cbd5e1; margin-bottom: 20px;">Please select a user from the Realtime Dashboard</p>
				<button class="action-btn" onclick="frappe.set_route('realtime-dashboard')">
					Go to Dashboard
				</button>
			</div>
		`);
	}

	render_dashboard(data) {
		const content = this.wrapper.find('#dashboard-content');
		content.html('');

		// Summary cards
		content.append(this.create_summary_cards(data.entry_counts));

		// Charts
		content.append(this.create_charts_section(data));

		// Detailed entries table
		content.append(this.create_detailed_entries(data.detailed_entries));

		// Render charts
		setTimeout(() => {
			this.render_charts(data);
		}, 100);
	}

	create_summary_cards(counts) {
		const me = this;
		const card_configs = [
			{ key: 'Sales Invoice', label: 'Sales Invoice Entry', color: 'primary', doctype: 'Sales Invoice', icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>' },
			{ key: 'Sales Order', label: 'Sales Order Entry', color: 'success', doctype: 'Sales Order', icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>' },
			{ key: 'Purchase Invoice', label: 'Purchase Invoice Entry', color: 'warning', doctype: 'Purchase Invoice', icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/></svg>' },
			{ key: 'Purchase Order', label: 'Purchase Order Entry', color: 'teal', doctype: 'Purchase Order', icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2zm-7 14c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"/></svg>' },
			{ key: 'Payment Entry', label: 'Payment Entry', color: 'info', doctype: 'Payment Entry', icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/><circle cx="12" cy="15" r="2"/></svg>' },
			{ key: 'Journal Entry', label: 'Journal Entry', color: 'cyan', doctype: 'Journal Entry', icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 18H6V4h12v16z"/><path d="M8 6h8v2H8zm0 4h8v2H8zm0 4h5v2H8z"/></svg>' },
			{ key: 'Employee Advance', label: 'Employee Advance Entry', color: 'pink', doctype: 'Employee Advance', icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/><path d="M12.5 7H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>' },
			{ key: 'Expense Claim', label: 'Expense Claim Entry', color: 'orange', doctype: 'Expense Claim', icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/><path d="M8 16h8v2H8zm0-4h8v2H8z"/></svg>' },
			{ key: 'Project', label: 'Project Entry', color: 'purple', doctype: 'Project', icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/><path d="M7 12h2v5H7zm4-3h2v8h-2zm4-3h2v11h-2z"/></svg>' },
			{ key: 'Customer', label: 'Customer Entry', color: 'blue', doctype: 'Customer', icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>' },
			{ key: 'Supplier', label: 'Supplier Entry', color: 'indigo', doctype: 'Supplier', icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M20 6h-3V4c0-1.11-.89-2-2-2H9c-1.11 0-2 .89-2 2v2H4c-1.11 0-2 .89-2 2v11c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zM9 4h6v2H9V4zm11 15H4V8h3v2h2V8h6v2h2V8h3v11z"/></svg>' }
		];

		const cards_html = card_configs.map(config => `
			<div class="glass-card ${config.color}-gradient clickable-card" data-doctype="${config.doctype}" style="cursor: pointer;" title="Click to view ${config.doctype} list">
				<div class="card-header-row">
					<div class="card-icon">${config.icon}</div>
					<div class="card-label">${config.label}</div>
				</div>
				<div class="card-value">${counts[config.key] || 0}</div>
			</div>
		`).join('');

		const $section = $(`
			<div class="summary-section">
				<div class="section-header">
					<h2>Entry Summary</h2>
					<div class="total-badge">Total Entries: ${counts['Total'] || 0}</div>
				</div>
				<div class="glass-cards-grid">
					${cards_html}
				</div>
			</div>
		`);

		// Add click handlers to cards
		$section.find('.clickable-card').on('click', function() {
			const doctype = $(this).data('doctype');
			me.navigate_to_doctype_list(doctype);
		});

		return $section;
	}

	navigate_to_doctype_list(doctype) {
		// Set filters for the list view
		frappe.route_options = {
			owner: this.user_email,
			docstatus: 1
		};
		
		// Navigate to the doctype list
		frappe.set_route('List', doctype);
	}

	create_charts_section(data) {
		return $(`
			<div class="charts-section">
				<div class="charts-grid">
					<div class="glass-chart-container">
						<div class="chart-header">
							<h3>
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16" style="margin-right: 8px; vertical-align: middle;">
									<path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 6-6" stroke="currentColor" stroke-width="2" fill="none"/>
								</svg>
								Daily Activity
							</h3>
						</div>
						<div class="chart-wrapper" id="daily-activity-chart"></div>
					</div>
					<div class="glass-chart-container">
						<div class="chart-header">
							<h3>
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16" style="margin-right: 8px; vertical-align: middle;">
									<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
								</svg>
								Entry Distribution
							</h3>
						</div>
						<div class="chart-wrapper" id="entry-distribution-chart"></div>
					</div>
				</div>
			</div>
		`);
	}

	create_detailed_entries(detailed) {
		const all_entries = [];
		
		Object.keys(detailed).forEach(doctype => {
			detailed[doctype].forEach(entry => {
				all_entries.push({
					doctype: doctype,
					name: entry.name,
					creation: entry.creation,
					modified: entry.modified
				});
			});
		});

		all_entries.sort((a, b) => new Date(b.creation) - new Date(a.creation));
		const recent_entries = all_entries.slice(0, 20);

		const rows = recent_entries.map(entry => `
			<tr>
				<td>${entry.doctype}</td>
				<td><a href="/app/${entry.doctype.toLowerCase().replace(/ /g, '-')}/${entry.name}" target="_blank">${entry.name}</a></td>
				<td>${frappe.datetime.str_to_user(entry.creation)}</td>
				<td>${frappe.datetime.str_to_user(entry.modified)}</td>
			</tr>
		`).join('');

		return $(`
			<div class="glass-table-container">
				<div class="table-header">
					<h3>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18" style="margin-right: 8px; vertical-align: middle;">
							<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/>
						</svg>
						Recent Entries (Last 20)
					</h3>
				</div>
				<div class="table-wrapper scrollable">
					<table class="glass-table">
						<thead>
							<tr>
								<th>Entry Type</th>
								<th>Document ID</th>
								<th>Created On</th>
								<th>Last Modified</th>
							</tr>
						</thead>
						<tbody>
							${rows || '<tr><td colspan="4">No entries found</td></tr>'}
						</tbody>
					</table>
				</div>
			</div>
		`);
	}

	render_charts(data) {
		// Daily Activity Chart
		const dates = Object.keys(data.date_wise_entries).sort();
		const counts = dates.map(date => data.date_wise_entries[date]);

		if (dates.length > 0) {
			const daily_chart = this.wrapper.find('#daily-activity-chart')[0];
			if (daily_chart) {
				new frappe.Chart(daily_chart, {
					data: {
						labels: dates.slice(-30).map(d => frappe.datetime.str_to_user(d)),
						datasets: [{
							name: 'Entries',
							values: counts.slice(-30)
						}]
					},
					type: 'line',
					height: 250,
					colors: ['#03a4ed']
				});
			}
		}

		// Entry Distribution Chart
		const entry_labels = [];
		const entry_values = [];
		
		Object.keys(data.entry_counts).forEach(key => {
			if (key !== 'Total' && data.entry_counts[key] > 0) {
				entry_labels.push(key);
				entry_values.push(data.entry_counts[key]);
			}
		});

		if (entry_labels.length > 0) {
			const dist_chart = this.wrapper.find('#entry-distribution-chart')[0];
			if (dist_chart) {
				new frappe.Chart(dist_chart, {
					data: {
						labels: entry_labels,
						datasets: [{
							name: 'Count',
							values: entry_values
						}]
					},
					type: 'pie',
					height: 250,
					colors: ['#03a4ed', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ff695f', '#a855f7', '#fb923c', '#ec4899']
				});
			}
		}
	}
}
