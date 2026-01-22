# Copyright (c) 2026, Ubaid Ali and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import today, add_days, getdate


class TestAccountFreezeRule(FrappeTestCase):
	def setUp(self):
		"""Set up test data"""
		# Create a test company if it doesn't exist
		if not frappe.db.exists("Company", "Test Company"):
			company = frappe.get_doc({
				"doctype": "Company",
				"company_name": "Test Company",
				"abbr": "TC",
				"default_currency": "USD"
			})
			company.insert(ignore_permissions=True)
		
		# Get a test account (or create one)
		self.test_account = self.get_or_create_test_account()
		self.test_company = "Test Company"
	
	def tearDown(self):
		"""Clean up test data"""
		# Delete test freeze rules
		frappe.db.sql("""
			DELETE FROM `tabAccount Freeze Rule` 
			WHERE company = %s
		""", self.test_company)
		frappe.db.commit()
	
	def get_or_create_test_account(self):
		"""Get or create a test account"""
		account_name = "Test Expense Account - TC"
		
		if not frappe.db.exists("Account", account_name):
			account = frappe.get_doc({
				"doctype": "Account",
				"account_name": "Test Expense Account",
				"company": "Test Company",
				"root_type": "Expense",
				"report_type": "Profit and Loss",
				"account_type": "Expense Account",
				"is_group": 0
			})
			account.insert(ignore_permissions=True)
			return account.name
		
		return account_name
	
	def test_create_freeze_rule(self):
		"""Test creating a basic freeze rule"""
		freeze_rule = frappe.get_doc({
			"doctype": "Account Freeze Rule",
			"account": self.test_account,
			"company": self.test_company,
			"from_date": add_days(today(), -30),
			"to_date": add_days(today(), -1),
			"active": 1,
			"reason": "Test freeze"
		})
		freeze_rule.insert()
		
		self.assertTrue(freeze_rule.name)
		self.assertEqual(freeze_rule.active, 1)
	
	def test_date_validation(self):
		"""Test that from_date cannot be greater than to_date"""
		freeze_rule = frappe.get_doc({
			"doctype": "Account Freeze Rule",
			"account": self.test_account,
			"company": self.test_company,
			"from_date": today(),
			"to_date": add_days(today(), -10),
			"active": 1
		})
		
		with self.assertRaises(frappe.ValidationError):
			freeze_rule.insert()
	
	def test_overlapping_rules(self):
		"""Test that overlapping freeze rules are not allowed"""
		# Create first freeze rule
		freeze_rule1 = frappe.get_doc({
			"doctype": "Account Freeze Rule",
			"account": self.test_account,
			"company": self.test_company,
			"from_date": add_days(today(), -30),
			"to_date": add_days(today(), -10),
			"active": 1,
			"reason": "First freeze"
		})
		freeze_rule1.insert()
		
		# Try to create overlapping freeze rule
		freeze_rule2 = frappe.get_doc({
			"doctype": "Account Freeze Rule",
			"account": self.test_account,
			"company": self.test_company,
			"from_date": add_days(today(), -20),
			"to_date": add_days(today(), -5),
			"active": 1,
			"reason": "Overlapping freeze"
		})
		
		with self.assertRaises(frappe.ValidationError):
			freeze_rule2.insert()
	
	def test_non_overlapping_rules(self):
		"""Test that non-overlapping freeze rules are allowed"""
		# Create first freeze rule
		freeze_rule1 = frappe.get_doc({
			"doctype": "Account Freeze Rule",
			"account": self.test_account,
			"company": self.test_company,
			"from_date": add_days(today(), -60),
			"to_date": add_days(today(), -40),
			"active": 1,
			"reason": "First freeze"
		})
		freeze_rule1.insert()
		
		# Create non-overlapping freeze rule
		freeze_rule2 = frappe.get_doc({
			"doctype": "Account Freeze Rule",
			"account": self.test_account,
			"company": self.test_company,
			"from_date": add_days(today(), -30),
			"to_date": add_days(today(), -10),
			"active": 1,
			"reason": "Second freeze"
		})
		freeze_rule2.insert()
		
		self.assertTrue(freeze_rule1.name)
		self.assertTrue(freeze_rule2.name)
	
	def test_inactive_rules_allow_overlap(self):
		"""Test that inactive rules don't prevent overlapping rules"""
		# Create first freeze rule (inactive)
		freeze_rule1 = frappe.get_doc({
			"doctype": "Account Freeze Rule",
			"account": self.test_account,
			"company": self.test_company,
			"from_date": add_days(today(), -30),
			"to_date": add_days(today(), -10),
			"active": 0,
			"reason": "Inactive freeze"
		})
		freeze_rule1.insert()
		
		# Create overlapping but active freeze rule
		freeze_rule2 = frappe.get_doc({
			"doctype": "Account Freeze Rule",
			"account": self.test_account,
			"company": self.test_company,
			"from_date": add_days(today(), -20),
			"to_date": add_days(today(), -5),
			"active": 1,
			"reason": "Active freeze"
		})
		freeze_rule2.insert()
		
		self.assertTrue(freeze_rule1.name)
		self.assertTrue(freeze_rule2.name)
	
	def test_account_company_validation(self):
		"""Test that account must belong to the selected company"""
		# This test assumes there are accounts from different companies
		# You may need to adjust based on your test data
		pass  # Implement if you have multi-company setup
	
	def test_check_account_freeze_status(self):
		"""Test the API function to check freeze status"""
		from osmani.osmani.utils.account_freeze_validation import check_account_freeze_status
		
		# Create a freeze rule
		freeze_rule = frappe.get_doc({
			"doctype": "Account Freeze Rule",
			"account": self.test_account,
			"company": self.test_company,
			"from_date": add_days(today(), -10),
			"to_date": add_days(today(), 10),
			"active": 1,
			"reason": "Test freeze"
		})
		freeze_rule.insert()
		
		# Check status for date within freeze period
		result = check_account_freeze_status(
			self.test_account, 
			self.test_company, 
			today()
		)
		self.assertTrue(result["is_frozen"])
		
		# Check status for date outside freeze period
		result = check_account_freeze_status(
			self.test_account, 
			self.test_company, 
			add_days(today(), 20)
		)
		self.assertFalse(result["is_frozen"])
