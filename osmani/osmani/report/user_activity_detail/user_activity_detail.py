import frappe
from frappe import _


DT_FIELDS = {
    "Purchase Invoice": [
        ("posting_date", "Date"), ("supplier", "Link:Supplier"), ("grand_total", "Currency")
    ],
    "Sales Order": [
        ("transaction_date", "Date"), ("customer", "Link:Customer"), ("grand_total", "Currency")
    ],
    "Sales Invoice": [
        ("posting_date", "Date"), ("customer", "Link:Customer"), ("grand_total", "Currency")
    ],
    "Payment Entry": [
        ("posting_date", "Date"), ("party", "Dynamic Link:party_type"), ("paid_amount", "Currency")
    ],
    "Journal Entry": [
        ("posting_date", "Date"), ("voucher_type", "Select"), ("total_debit", "Currency")
    ],
    "Employee Advance": [
        ("posting_date", "Date"), ("employee", "Link:Employee"), ("advance_amount", "Currency")
    ],
    "Expense Claim": [
        ("posting_date", "Date"), ("employee", "Link:Employee"), ("total_sanctioned_amount", "Currency")
    ],
}

DOCSTATUS_MAP = {"Draft": 0, "Submitted": 1, "Cancelled": 2}


def execute(filters=None):
    filters = filters or {}

    doctype = filters.get("doctype")
    user = filters.get("user")
    if not doctype:
        return [
            {"label": _("Name"), "fieldname": "name", "fieldtype": "Data", "width": 220},
        ], []

    # Build columns for list view
    columns = [
        {"label": _("Name"), "fieldname": "name", "fieldtype": "Dynamic Link", "options": doctype, "width": 220},
        {"label": _("Owner"), "fieldname": "owner", "fieldtype": "Link", "options": "User", "width": 160},
        {"label": _("DocStatus"), "fieldname": "docstatus", "fieldtype": "Int", "width": 80},
    ]
    for fieldname, fieldtype in DT_FIELDS.get(doctype, []):
        columns.append({"label": _(fieldname.replace("_", " ").title()), "fieldname": fieldname, "fieldtype": fieldtype, "width": 160})

    # Conditions
    conditions = ["1=1"]
    params = {}
    if filters.get("from_date"):
        conditions.append("creation >= %(from_date)s")
        params["from_date"] = filters.get("from_date")
    if filters.get("to_date"):
        conditions.append("creation <= %(to_date)s")
        params["to_date"] = filters.get("to_date")
    if user:
        conditions.append("owner = %(user)s")
        params["user"] = user
    docstatus_label = filters.get("docstatus")
    if docstatus_label and docstatus_label != "All":
        conditions.append("docstatus = %(docstatus)s")
        params["docstatus"] = DOCSTATUS_MAP.get(docstatus_label, docstatus_label)

    where_clause = " AND ".join(conditions)

    table = f"`tab{doctype}`"
    fields = ["name", "owner", "docstatus"] + [f for f, _ in DT_FIELDS.get(doctype, [])]
    select_fields = ", ".join(fields)
    data = frappe.db.sql(
        f"""
        SELECT {select_fields}
        FROM {table}
        WHERE {where_clause}
        ORDER BY creation DESC
        LIMIT 2000
        """,
        params,
        as_dict=True,
    )

    return columns, data
