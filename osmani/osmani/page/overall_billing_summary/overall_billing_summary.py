# Copyright (c) 2024, Osmani and contributors
# For license information, please see license.txt

import frappe
from frappe import _

@frappe.whitelist()
def get_billing_data(from_date, to_date, projects=None):
	"""
	Get billing data (Income from GL Entries) for Overall Billing Summary
	Uses same logic as Profitability Analysis report
	"""
	company = frappe.defaults.get_user_default("company") or frappe.db.get_single_value("Global Defaults", "default_company")
	
	# Build project condition
	project_condition = ""
	if projects:
		if isinstance(projects, str):
			import json
			projects = json.loads(projects)
		
		if projects and len(projects) > 0:
			project_list = ", ".join([frappe.db.escape(p) for p in projects])
			project_condition = f"AND project IN ({project_list})"
	
	# SQL query - get Income entries only
	query = f"""
		SELECT 
			posting_date,
			project,
			debit,
			credit,
			is_opening,
			(SELECT root_type FROM `tabAccount` WHERE name = account) as type
		FROM `tabGL Entry`
		WHERE company = %(company)s
			AND posting_date >= %(from_date)s
			AND posting_date <= %(to_date)s
			AND project IS NOT NULL
			AND project != ''
			AND is_cancelled = 0
			AND voucher_type != 'Period Closing Voucher'
			{project_condition}
		ORDER BY project, posting_date
	"""
	
	gl_entries = frappe.db.sql(
		query,
		{
			"company": company,
			"from_date": from_date,
			"to_date": to_date
		},
		as_dict=False
	)
	
	return gl_entries
