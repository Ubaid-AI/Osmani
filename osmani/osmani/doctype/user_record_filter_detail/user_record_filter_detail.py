# Copyright (c) 2024, Ubaid Ali and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class UserRecordFilterDetail(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		active: DF.Check
		doctype_name: DF.Link
		field_name: DF.Select
		filter_value: DF.Data | None
		restriction_type: DF.Literal["equals", "not_equals", "in", "not_in", "like", "not_like", "greater_than", "less_than", "greater_than_equal", "less_than_equal", "is_set", "is_not_set"]
	# end: auto-generated types

	pass