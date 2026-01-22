# Copyright (c) 2026, Ubaid Ali and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import getdate


def validate_frozen_account(doc, method=None):
	"""
	Validate if the account in GL Entry is frozen for the posting date.
	This function is called via hooks for GL Entry validation.
	"""
	if not doc.account or not doc.posting_date:
		return
	
	# Skip validation if doc is being cancelled (allow cancellation of frozen entries)
	if doc.docstatus == 2:
		return
	
	# Get company from GL Entry
	company = doc.company
	posting_date = getdate(doc.posting_date)
	
	# Check if there's an active freeze rule for this account and date
	freeze_rules = frappe.get_all(
		"Account Freeze Rule",
		filters={
			"account": doc.account,
			"company": company,
			"active": 1,
			"from_date": ["<=", posting_date],
			"to_date": [">=", posting_date]
		},
		fields=["name", "from_date", "to_date", "reason"],
		limit=1
	)
	
	if freeze_rules:
		rule = freeze_rules[0]
		error_message = _(
			"Cannot post to Account {0}. This account is frozen from {1} to {2}."
		).format(
			frappe.bold(doc.account),
			frappe.bold(rule.from_date),
			frappe.bold(rule.to_date)
		)
		
		if rule.reason:
			error_message += "<br>" + _("Reason: {0}").format(rule.reason)
		
		error_message += "<br><br>" + _("Freeze Rule: {0}").format(
			frappe.get_desk_link("Account Freeze Rule", rule.name)
		)
		
		frappe.throw(error_message, title=_("Account Frozen"))


def get_frozen_accounts_for_date(company, posting_date):
	"""
	Get list of frozen accounts for a specific company and date.
	Utility function for reports or queries.
	"""
	posting_date = getdate(posting_date)
	
	frozen_accounts = frappe.get_all(
		"Account Freeze Rule",
		filters={
			"company": company,
			"active": 1,
			"from_date": ["<=", posting_date],
			"to_date": [">=", posting_date]
		},
		fields=["account", "from_date", "to_date", "reason"],
		order_by="account"
	)
	
	return frozen_accounts


@frappe.whitelist()
def check_account_freeze_status(account, company, posting_date):
	"""
	Whitelisted method to check if an account is frozen for a specific date.
	Can be called from client-side for validation.
	"""
	posting_date = getdate(posting_date)
	
	freeze_rules = frappe.get_all(
		"Account Freeze Rule",
		filters={
			"account": account,
			"company": company,
			"active": 1,
			"from_date": ["<=", posting_date],
			"to_date": [">=", posting_date]
		},
		fields=["name", "from_date", "to_date", "reason"],
		limit=1
	)
	
	if freeze_rules:
		return {
			"is_frozen": True,
			"freeze_rule": freeze_rules[0]
		}
	
	return {
		"is_frozen": False,
		"freeze_rule": None
	}
