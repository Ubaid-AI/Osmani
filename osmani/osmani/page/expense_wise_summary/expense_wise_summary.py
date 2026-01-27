# Copyright (c) 2024, Osmani and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt, getdate
from erpnext.accounts.report.financial_statements import filter_accounts, filter_out_zero_value_rows

@frappe.whitelist()
def get_expense_data(from_date, to_date, projects=None, show_zero_values=False):
	"""
	Get expense data - follows Trial Balance pattern
	"""
	company = frappe.defaults.get_user_default("company") or frappe.db.get_single_value("Global Defaults", "default_company")
	
	# Parse projects
	if projects:
		if isinstance(projects, str):
			import json
			projects = json.loads(projects)
	
	# Get all expense accounts - EXACTLY like Trial Balance (line 83-89)
	accounts = frappe.db.sql("""
		SELECT name, account_number, parent_account, account_name, root_type, lft, rgt, is_group
		FROM `tabAccount` 
		WHERE company = %s 
			AND root_type = 'Expense'
		ORDER BY lft
	""", company, as_dict=True)
	
	if not accounts:
		return {"accounts": [], "months": []}
	
	# Filter accounts - EXACTLY like Trial Balance (line 95)
	accounts, accounts_by_name, parent_children_map = filter_accounts(accounts)
	
	# Get GL Entries
	gl_entries_by_account = {}
	get_gl_entries(company, from_date, to_date, projects, gl_entries_by_account)
	
	# Get months
	months = get_month_list(from_date, to_date)
	
	# Calculate values - EXACTLY like Trial Balance pattern
	calculate_values(accounts, gl_entries_by_account, months)
	
	# Accumulate into parents - EXACTLY like Trial Balance (line 118)
	accumulate_values_into_parents(accounts, accounts_by_name, months)
	
	# Prepare data
	data = prepare_data(accounts, months, parent_children_map)
	
	# Convert show_zero_values to boolean
	show_zero = bool(int(show_zero_values)) if show_zero_values else False
	
	# Debug logging
	frappe.log_error(f"Before filter: {len(data)} accounts, show_zero_values={show_zero}", "Expense Report Debug")
	
	# Filter zero values - EXACTLY like Trial Balance (line 121-123)
	data = filter_out_zero_value_rows(data, parent_children_map, show_zero_values=show_zero)
	
	frappe.log_error(f"After filter: {len(data)} accounts", "Expense Report Debug")
	
	return {
		"accounts": data,
		"months": months
	}

def get_gl_entries(company, from_date, to_date, projects, gl_entries_by_account):
	"""Get GL Entries for expense accounts"""
	project_condition = ""
	if projects and len(projects) > 0:
		project_list = ", ".join([frappe.db.escape(p) for p in projects])
		project_condition = f"AND project IN ({project_list})"
	
	query = f"""
		SELECT account, posting_date, debit, credit
		FROM `tabGL Entry`
		WHERE company = %(company)s
			AND posting_date >= %(from_date)s
			AND posting_date <= %(to_date)s
			AND is_cancelled = 0
			AND voucher_type != 'Period Closing Voucher'
			AND account IN (
				SELECT name FROM `tabAccount` 
				WHERE company = %(company)s 
				AND root_type = 'Expense'
			)
			{project_condition}
		ORDER BY account, posting_date
	"""
	
	gl_entries = frappe.db.sql(query, {
		"company": company,
		"from_date": from_date,
		"to_date": to_date
	}, as_dict=True)
	
	# Group by account
	for entry in gl_entries:
		gl_entries_by_account.setdefault(entry.account, []).append(entry)

def get_month_list(from_date, to_date):
	"""Get list of months between dates"""
	from_date = getdate(from_date)
	to_date = getdate(to_date)
	
	months = []
	current = from_date.replace(day=1)
	end = to_date.replace(day=1)
	
	while current <= end:
		month_key = current.strftime('%Y-%m')
		months.append({
			'key': month_key,
			'label': current.strftime('%b %Y')
		})
		
		# Move to next month
		if current.month == 12:
			current = current.replace(year=current.year + 1, month=1)
		else:
			current = current.replace(month=current.month + 1)
	
	return months

def calculate_values(accounts, gl_entries_by_account, months):
	"""Calculate month-wise values - EXACTLY like Trial Balance (line 301-328)"""
	# Initialize
	for d in accounts:
		for month in months:
			d[month['key']] = 0.0
	
	# Calculate from GL entries
	for d in accounts:
		for entry in gl_entries_by_account.get(d.name, []):
			# For Expense: debit - credit
			month_key = entry.posting_date.strftime('%Y-%m') if hasattr(entry.posting_date, 'strftime') else str(entry.posting_date)[:7]
			
			if month_key in [m['key'] for m in months]:
				d[month_key] = d.get(month_key, 0.0) + flt(entry.debit) - flt(entry.credit)

def accumulate_values_into_parents(accounts, accounts_by_name, months):
	"""Accumulate children values into parents - EXACTLY like Trial Balance (line 355-360)"""
	for d in reversed(accounts):
		if d.parent_account:
			for month in months:
				accounts_by_name[d.parent_account][month['key']] = accounts_by_name[d.parent_account].get(month['key'], 0.0) + d.get(month['key'], 0.0)

def prepare_data(accounts, months, parent_children_map):
	"""Prepare data for frontend - EXACTLY like Trial Balance (line 362-396)"""
	data = []
	
	for d in accounts:
		has_value = False
		row = {
			'account': d.name,  # This is required for filter_out_zero_value_rows
			'account_name': f"{d.account_number} - {d.account_name}" if d.account_number else d.account_name,
			'parent_account': d.parent_account,
			'indent': d.indent,
			'is_group': d.is_group
		}
		
		# Add month values
		for month in months:
			row[month['key']] = flt(d.get(month['key'], 0.0), 3)
			if abs(row[month['key']]) >= 0.005:
				has_value = True
		
		row['has_value'] = has_value
		data.append(row)
	
	return data
