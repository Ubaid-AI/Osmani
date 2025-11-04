# Copyright (c) 2024, Ubaid Ali and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class UserRecordFilter(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF
		from osmani.osmani.doctype.user_record_filter_detail.user_record_filter_detail import UserRecordFilterDetail

		active: DF.Check
		description: DF.SmallText | None
		filter_details: DF.Table[UserRecordFilterDetail]
		user: DF.Link
	# end: auto-generated types

	def validate(self):
		"""Validate the User Record Filter configuration"""
		self.validate_user_permissions()
		self.validate_filter_details()
		
	def validate_user_permissions(self):
		"""Ensure the current user has permission to create filters for the specified user"""
		if not frappe.has_permission("User", "read", user=self.user):
			frappe.throw(_("You don't have permission to create filters for user {0}").format(self.user))
	
	def validate_filter_details(self):
		"""Validate filter detail configurations"""
		if not self.filter_details:
			frappe.throw(_("At least one filter detail is required"))
			
		for detail in self.filter_details:
			if not detail.doctype_name:
				frappe.throw(_("DocType is required in filter details"))
			if not detail.field_name:
				frappe.throw(_("Field is required in filter details"))
			if not detail.restriction_type:
				frappe.throw(_("Restriction Type is required in filter details"))
				
	def on_update(self):
		"""Clear cache when filter is updated"""
		self.clear_user_filter_cache()
		
	def on_trash(self):
		"""Clear cache when filter is deleted"""
		self.clear_user_filter_cache()
		
	def clear_user_filter_cache(self):
		"""Clear cached user filters"""
		cache_key = f"user_record_filters_{self.user}"
		frappe.cache().delete_value(cache_key)


@frappe.whitelist()
def get_doctype_fields(doctype):
	"""Get fields for a specific DocType"""
	if not doctype:
		return []
		
	try:
		meta = frappe.get_meta(doctype)
		fields = []
		
		# Add standard fields
		fields.extend([
			{"label": "Name", "value": "name", "fieldtype": "Data"},
			{"label": "Owner", "value": "owner", "fieldtype": "Link"},
			{"label": "Creation", "value": "creation", "fieldtype": "Datetime"},
			{"label": "Modified", "value": "modified", "fieldtype": "Datetime"},
			{"label": "Document Status", "value": "docstatus", "fieldtype": "Int"},
		])
		
		# Add custom fields from DocType
		for field in meta.fields:
			if field.fieldtype not in ["Section Break", "Column Break", "HTML", "Button"]:
				fields.append({
					"label": field.label or field.fieldname,
					"value": field.fieldname,
					"fieldtype": field.fieldtype,
					"options": field.options
				})
				
		return fields
	except Exception as e:
		frappe.log_error(f"Error getting fields for DocType {doctype}: {str(e)}")
		return []


@frappe.whitelist()
def get_user_filters(user=None):
	"""Get active filters for a user"""
	if not user:
		user = frappe.session.user
		
	cache_key = f"user_record_filters_{user}"
	filters = frappe.cache().get_value(cache_key)
	
	if filters is None:
		filters = frappe.get_all(
			"User Record Filter",
			filters={"user": user, "active": 1},
			fields=["name", "user", "description"]
		)
		
		# Get filter details for each filter
		for filter_doc in filters:
			filter_details = frappe.get_all(
				"User Record Filter Detail",
				filters={"parent": filter_doc.name},
				fields=["doctype_name", "field_name", "restriction_type", "filter_value", "active"]
			)
			filter_doc["details"] = [d for d in filter_details if d.active]
			
		frappe.cache().set_value(cache_key, filters, expires_in_sec=300)  # Cache for 5 minutes
		
	return filters


def get_permission_query_conditions(doctype, user=None):
	"""
	Get permission query conditions for a DocType based on user record filters.
	This function should be called from the target DocType's permission query method.
	"""
	if not user:
		user = frappe.session.user
		
	# Skip for Administrator and System Manager
	if user == "Administrator" or "System Manager" in frappe.get_roles(user):
		return ""
		
	user_filters = get_user_filters(user)
	conditions = []
	
	for filter_doc in user_filters:
		for detail in filter_doc.get("details", []):
			if detail.doctype_name == doctype and detail.active:
				condition = build_condition(detail, user)
				if condition:
					conditions.append(condition)
					
	if conditions:
		result = "(" + " AND ".join(conditions) + ")"
		return result
	
	return ""

# Wrapper for hooks: called via frappe.call with signature (user, doctype=...)
def permission_query_all(user=None, doctype=None, **kwargs):
	"""Generic permission query hook applied for all DocTypes via hooks.
	Frappe calls this with user as positional arg and doctype as kwarg.
	"""
	if not doctype:
		return ""
	return get_permission_query_conditions(doctype, user)


def build_condition(detail, user=None):
	"""Build SQL condition from filter detail"""
	field = detail.field_name
	restriction_type = detail.restriction_type
	value = detail.filter_value
	
	# Handle special values
	if value == "session_user":
		value = user or frappe.session.user
	elif value == "session_user_roles":
		roles = frappe.get_roles(user) if user else frappe.get_roles()
		value = "', '".join(roles)
	
	# Helper: detect numeric
	def is_numeric(val):
		try:
			float(str(val))
			return True
		except Exception:
			return False
	
	# Build condition based on restriction type
	if restriction_type == "equals":
		return f"`{field}` = {frappe.db.escape(value)}"
	elif restriction_type == "not_equals":
		return f"`{field}` != {frappe.db.escape(value)}"
	elif restriction_type == "in":
		values = [v.strip() for v in (value or "").split(",") if v.strip()]
		if not values:
			return ""
		escaped_values = ", ".join([frappe.db.escape(v) for v in values])
		return f"`{field}` IN ({escaped_values})"
	elif restriction_type == "not_in":
		values = [v.strip() for v in (value or "").split(",") if v.strip()]
		if not values:
			return ""
		escaped_values = ", ".join([frappe.db.escape(v) for v in values])
		return f"`{field}` NOT IN ({escaped_values})"
	elif restriction_type == "like":
		return f"`{field}` LIKE {frappe.db.escape(f'%{value}%')}"
	elif restriction_type == "not_like":
		return f"`{field}` NOT LIKE {frappe.db.escape(f'%{value}%')}"
	elif restriction_type == "greater_than":
		return f"`{field}` > {value if is_numeric(value) else frappe.db.escape(value)}"
	elif restriction_type == "less_than":
		return f"`{field}` < {value if is_numeric(value) else frappe.db.escape(value)}"
	elif restriction_type == "greater_than_equal":
		return f"`{field}` >= {value if is_numeric(value) else frappe.db.escape(value)}"
	elif restriction_type == "less_than_equal":
		return f"`{field}` <= {value if is_numeric(value) else frappe.db.escape(value)}"
	elif restriction_type == "is_set":
		return f"`{field}` IS NOT NULL"
	elif restriction_type == "is_not_set":
		return f"`{field}` IS NULL"
	
	return ""