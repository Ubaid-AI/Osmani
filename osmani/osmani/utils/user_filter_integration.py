# Copyright (c) 2024, Ubaid Ali and contributors
# For license information, please see license.txt

"""
Utility functions for integrating User Record Filter with any DocType.

This module provides helper functions to easily add user record filtering
to existing DocTypes without modifying their core files.
"""

import frappe
from osmani.osmani.doctype.user_record_filter.user_record_filter import get_permission_query_conditions


def create_permission_query_function(doctype_name):
	"""
	Create a permission query function for a specific DocType.
	
	Args:
		doctype_name (str): Name of the DocType to create permission query for
		
	Returns:
		function: Permission query function that can be used in hooks
	"""
	def permission_query_conditions(user=None):
		return get_permission_query_conditions(doctype_name, user)
	
	return permission_query_conditions


def register_doctype_filter(doctype_name, app_name="osmani"):
	"""
	Register a DocType for user record filtering.
	
	This function can be called during app installation or setup
	to automatically register DocTypes for filtering.
	
	Args:
		doctype_name (str): Name of the DocType to register
		app_name (str): Name of the app (default: osmani)
	"""
	try:
		# Check if DocType exists
		if not frappe.db.exists("DocType", doctype_name):
			frappe.log_error(f"DocType {doctype_name} does not exist")
			return False
			
		# Create permission query function
		permission_func = create_permission_query_function(doctype_name)
		
		# Store in registry (you could extend this to use a database table)
		registry_key = f"user_filter_registry_{app_name}"
		registry = frappe.cache().get_value(registry_key) or {}
		registry[doctype_name] = {
			"app": app_name,
			"function": permission_func,
			"registered_on": frappe.utils.now()
		}
		frappe.cache().set_value(registry_key, registry)
		
		return True
		
	except Exception as e:
		frappe.log_error(f"Error registering DocType {doctype_name} for filtering: {str(e)}")
		return False


def get_registered_doctypes(app_name="osmani"):
	"""
	Get list of DocTypes registered for user record filtering.
	
	Args:
		app_name (str): Name of the app (default: osmani)
		
	Returns:
		dict: Dictionary of registered DocTypes
	"""
	registry_key = f"user_filter_registry_{app_name}"
	return frappe.cache().get_value(registry_key) or {}


def apply_monkey_patch(doctype_name, module_path=None):
	"""
	Apply monkey patch to add user record filtering to an existing DocType.
	
	WARNING: This is not recommended for production use. Use hooks instead.
	
	Args:
		doctype_name (str): Name of the DocType to patch
		module_path (str): Optional module path for the DocType class
	"""
	try:
		if not module_path:
			# Try to guess the module path
			module_path = f"erpnext.{doctype_name.lower().replace(' ', '_')}.doctype.{doctype_name.lower().replace(' ', '_')}.{doctype_name.lower().replace(' ', '_')}"
		
		# Import the DocType class
		module = frappe.get_module(module_path)
		doctype_class = getattr(module, doctype_name.replace(" ", ""))
		
		# Store original method if it exists
		original_method = getattr(doctype_class, 'get_permission_query_conditions', None)
		
		def get_permission_query_conditions(user=None):
			# Get conditions from User Record Filter
			filter_conditions = get_permission_query_conditions(doctype_name, user)
			
			# Combine with original conditions if they exist
			if original_method:
				original_conditions = original_method(user)
				if original_conditions and filter_conditions:
					return original_conditions + filter_conditions
				elif original_conditions:
					return original_conditions
			
			return filter_conditions
		
		# Apply the new method
		doctype_class.get_permission_query_conditions = staticmethod(get_permission_query_conditions)
		
		frappe.logger().info(f"Successfully applied user record filter to {doctype_name}")
		return True
		
	except Exception as e:
		frappe.log_error(f"Error applying monkey patch to {doctype_name}: {str(e)}")
		return False


@frappe.whitelist()
def get_filterable_doctypes():
	"""
	Get list of DocTypes that can be filtered.
	
	Returns:
		list: List of DocType names that support filtering
	"""
	try:
		# Get all DocTypes that are not child tables and are not system DocTypes
		doctypes = frappe.get_all(
			"DocType",
			filters={
				"istable": 0,
				"issingle": 0,
				"module": ["not in", ["Core", "Desk", "Email", "Printing", "Website"]]
			},
			fields=["name", "module"],
			order_by="name"
		)
		
		return doctypes
		
	except Exception as e:
		frappe.log_error(f"Error getting filterable DocTypes: {str(e)}")
		return []


@frappe.whitelist()
def test_doctype_filter(doctype_name, user=None):
	"""
	Test user record filter for a specific DocType.
	
	Args:
		doctype_name (str): Name of the DocType to test
		user (str): User to test filters for (default: current user)
		
	Returns:
		dict: Test results including conditions and sample query
	"""
	if not user:
		user = frappe.session.user
		
	try:
		# Get permission query conditions
		conditions = get_permission_query_conditions(doctype_name, user)
		
		# Build sample query
		sample_query = f"SELECT name FROM `tab{doctype_name}`"
		if conditions:
			sample_query += f" WHERE 1=1 {conditions}"
		sample_query += " LIMIT 10"
		
		# Get user filters
		from osmani.osmani.doctype.user_record_filter.user_record_filter import get_user_filters
		user_filters = get_user_filters(user)
		
		# Filter relevant filters for this DocType
		relevant_filters = []
		for filter_doc in user_filters:
			for detail in filter_doc.get("details", []):
				if detail.doctype_name == doctype_name:
					relevant_filters.append({
						"filter_name": filter_doc.name,
						"field": detail.field_name,
						"restriction": detail.restriction_type,
						"value": detail.filter_value
					})
		
		return {
			"success": True,
			"doctype": doctype_name,
			"user": user,
			"conditions": conditions or "No conditions applied",
			"sample_query": sample_query,
			"relevant_filters": relevant_filters,
			"total_user_filters": len(user_filters)
		}
		
	except Exception as e:
		return {
			"success": False,
			"error": str(e),
			"doctype": doctype_name,
			"user": user
		}


# Auto-registration functions for common ERPNext DocTypes
def register_common_erpnext_doctypes():
	"""
	Register common ERPNext DocTypes for user record filtering.
	Call this function during app installation.
	"""
	common_doctypes = [
		"Sales Order",
		"Sales Invoice", 
		"Purchase Order",
		"Purchase Invoice",
		"Delivery Note",
		"Purchase Receipt",
		"Customer",
		"Supplier",
		"Item",
		"Lead",
		"Opportunity",
		"Quotation",
		"Material Request",
		"Stock Entry",
		"Payment Entry",
		"Journal Entry"
	]
	
	registered = []
	failed = []
	
	for doctype in common_doctypes:
		if register_doctype_filter(doctype):
			registered.append(doctype)
		else:
			failed.append(doctype)
	
	frappe.logger().info(f"User Record Filter: Registered {len(registered)} DocTypes, Failed: {len(failed)}")
	
	return {
		"registered": registered,
		"failed": failed
	}