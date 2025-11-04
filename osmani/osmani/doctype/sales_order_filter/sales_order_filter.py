# Copyright (c) 2024, Ubaid Ali and contributors
# For license information, please see license.txt

"""
Example implementation for integrating User Record Filter with Sales Order.

To use this with ERPNext Sales Order, you would need to:
1. Create a custom app or modify ERPNext directly
2. Add this method to the SalesOrder class in ERPNext
3. Or create a custom hook to override the permission query

This file demonstrates the integration pattern.
"""

import frappe
from osmani.osmani.doctype.user_record_filter.user_record_filter import get_permission_query_conditions


def get_permission_query_conditions_sales_order(user=None):
	"""
	Permission query conditions for Sales Order based on User Record Filters.
	
	This function should be added to the SalesOrder class in ERPNext
	or called via hooks.
	"""
	return get_permission_query_conditions("Sales Order", user)


# Example of how to integrate with ERPNext via hooks
# Add this to your app's hooks.py:

"""
# In hooks.py
permission_query_conditions = {
    "Sales Order": "osmani.osmani.doctype.sales_order_filter.sales_order_filter.get_permission_query_conditions_sales_order"
}
"""

# Alternative: Monkey patch approach (not recommended for production)
def apply_sales_order_filter():
	"""
	Apply user record filter to Sales Order via monkey patching.
	This is for demonstration purposes only.
	"""
	try:
		from erpnext.selling.doctype.sales_order.sales_order import SalesOrder
		
		# Store original method if it exists
		original_method = getattr(SalesOrder, 'get_permission_query_conditions', None)
		
		def get_permission_query_conditions(user=None):
			# Get conditions from User Record Filter
			filter_conditions = get_permission_query_conditions("Sales Order", user)
			
			# Combine with original conditions if they exist
			if original_method:
				original_conditions = original_method(user)
				if original_conditions and filter_conditions:
					return original_conditions + filter_conditions
				elif original_conditions:
					return original_conditions
			
			return filter_conditions
		
		# Apply the new method
		SalesOrder.get_permission_query_conditions = staticmethod(get_permission_query_conditions)
		
	except ImportError:
		frappe.log_error("ERPNext Sales Order not found for filter integration")


# Call this function in your app's ready() method or via a hook
# apply_sales_order_filter()