# Copyright (c) 2024, Ubaid Ali and contributors
# For license information, please see license.txt

"""
Example implementation for integrating User Record Filter with Purchase Invoice.

To use this with ERPNext Purchase Invoice, you would need to:
1. Create a custom app or modify ERPNext directly
2. Add this method to the PurchaseInvoice class in ERPNext
3. Or create a custom hook to override the permission query

This file demonstrates the integration pattern.
"""

import frappe
from osmani.osmani.doctype.user_record_filter.user_record_filter import get_permission_query_conditions


def get_permission_query_conditions_purchase_invoice(user=None):
	"""
	Permission query conditions for Purchase Invoice based on User Record Filters.
	
	This function should be added to the PurchaseInvoice class in ERPNext
	or called via hooks.
	"""
	return get_permission_query_conditions("Purchase Invoice", user)


# Example of how to integrate with ERPNext via hooks
# Add this to your app's hooks.py:

"""
# In hooks.py
permission_query_conditions = {
    "Purchase Invoice": "osmani.osmani.doctype.purchase_invoice_filter.purchase_invoice_filter.get_permission_query_conditions_purchase_invoice"
}
"""

# Alternative: Monkey patch approach (not recommended for production)
def apply_purchase_invoice_filter():
	"""
	Apply user record filter to Purchase Invoice via monkey patching.
	This is for demonstration purposes only.
	"""
	try:
		from erpnext.accounts.doctype.purchase_invoice.purchase_invoice import PurchaseInvoice
		
		# Store original method if it exists
		original_method = getattr(PurchaseInvoice, 'get_permission_query_conditions', None)
		
		def get_permission_query_conditions(user=None):
			# Get conditions from User Record Filter
			filter_conditions = get_permission_query_conditions("Purchase Invoice", user)
			
			# Combine with original conditions if they exist
			if original_method:
				original_conditions = original_method(user)
				if original_conditions and filter_conditions:
					return original_conditions + filter_conditions
				elif original_conditions:
					return original_conditions
			
			return filter_conditions
		
		# Apply the new method
		PurchaseInvoice.get_permission_query_conditions = staticmethod(get_permission_query_conditions)
		
	except ImportError:
		frappe.log_error("ERPNext Purchase Invoice not found for filter integration")


# Call this function in your app's ready() method or via a hook
# apply_purchase_invoice_filter()