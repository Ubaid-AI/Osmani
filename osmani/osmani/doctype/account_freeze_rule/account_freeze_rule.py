# Copyright (c) 2026, Ubaid Ali and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate


class AccountFreezeRule(Document):
	def validate(self):
		self.validate_dates()
		self.validate_account()
		self.check_overlapping_rules()
	
	def validate_dates(self):
		"""Validate that from_date is before to_date"""
		if self.from_date and self.to_date:
			if getdate(self.from_date) > getdate(self.to_date):
				frappe.throw(_("From Date cannot be greater than To Date"))
	
	def validate_account(self):
		"""Validate that the account exists and belongs to the company"""
		if self.account and self.company:
			account_company = frappe.db.get_value("Account", self.account, "company")
			if account_company != self.company:
				frappe.throw(_("Account {0} does not belong to Company {1}").format(
					frappe.bold(self.account), frappe.bold(self.company)
				))
	
	def check_overlapping_rules(self):
		"""Check if there's an overlapping freeze rule for the same account"""
		if not self.account or not self.from_date or not self.to_date:
			return
		
		filters = {
			"account": self.account,
			"company": self.company,
			"active": 1,
			"name": ["!=", self.name]
		}
		
		existing_rules = frappe.get_all(
			"Account Freeze Rule",
			filters=filters,
			fields=["name", "from_date", "to_date"]
		)
		
		from_date = getdate(self.from_date)
		to_date = getdate(self.to_date)
		
		for rule in existing_rules:
			rule_from = getdate(rule.from_date)
			rule_to = getdate(rule.to_date)
			
			# Check for overlap
			if (from_date <= rule_to and to_date >= rule_from):
				frappe.throw(
					_("Account {0} already has an overlapping freeze rule {1} from {2} to {3}").format(
						frappe.bold(self.account),
						frappe.bold(rule.name),
						frappe.bold(rule.from_date),
						frappe.bold(rule.to_date)
					)
				)
