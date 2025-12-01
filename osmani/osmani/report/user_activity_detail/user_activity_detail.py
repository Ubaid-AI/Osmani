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

# Supported doctypes for union queries
DOCTYPES = [
    "Purchase Invoice",
    "Sales Order",
    "Sales Invoice",
    "Payment Entry",
    "Journal Entry",
    "Employee Advance",
    "Expense Claim",
]


def _normalize_doctype_list(value):
    if not value:
        return []
    if isinstance(value, (list, tuple)):
        return [v for v in value if v]
    return [v.strip() for v in str(value).split(",") if v.strip()]


def execute(filters=None):
    filters = filters or {}

    # Validate date range
    if filters.get("from_date") and filters.get("to_date") and filters["from_date"] > filters["to_date"]:
        frappe.throw(_("From Date cannot be after To Date"))

    doctype = filters.get("doctype")
    user = filters.get("user")

    # Base columns independent of doctype
    name_col = {
        "label": _("Name"),
        "fieldname": "name",
        "fieldtype": "Dynamic Link" if doctype else "Data",
        "width": 220,
    }
    if doctype:
        name_col["options"] = doctype
    columns = [
        name_col,
        {"label": _("Doctype"), "fieldname": "doctype", "fieldtype": "Data", "width": 150},
        {"label": _("User"), "fieldname": "user", "fieldtype": "Link", "options": "User", "width": 160},
        {"label": _("User Name"), "fieldname": "user_name", "fieldtype": "Data", "width": 180},
        {"label": _("Status"), "fieldname": "status", "fieldtype": "Data", "width": 100},
    ]

    # Append doctype-specific fields if doctype provided
    for fieldname, fieldtype in DT_FIELDS.get(doctype, []):
        columns.append({
            "label": _(fieldname.replace("_", " ").title()),
            "fieldname": fieldname,
            "fieldtype": fieldtype,
            "width": 160,
        })

    # Enforce: Only show data when a specific user is selected
    if not user:
        frappe.msgprint(_("Please select a User to view activity."))
        return columns, []

    # If document name provided without doctype, throw helpful error
    if filters.get("docname") and not doctype:
        frappe.throw(_("Please select a DocType when specifying a Document Name."))

    # Build conditions
    conditions = ["1=1"]
    params = {}
    if filters.get("from_date"):
        conditions.append("t.creation >= %(from_date)s")
        params["from_date"] = filters.get("from_date")
    if filters.get("to_date"):
        conditions.append("t.creation <= %(to_date)s")
        params["to_date"] = filters.get("to_date")
    if user:
        conditions.append("t.owner = %(user)s")
        params["user"] = user
    if filters.get("docname"):
        conditions.append("t.name = %(docname)s")
        params["docname"] = filters.get("docname")
    docstatus_label = filters.get("docstatus")
    if docstatus_label and docstatus_label != "All":
        conditions.append("t.docstatus = %(docstatus)s")
        params["docstatus"] = DOCSTATUS_MAP.get(docstatus_label, docstatus_label)

    where_clause = " AND ".join(conditions)

    # If doctype not provided, perform a union across selected/all doctypes
    selected_list = _normalize_doctype_list(filters.get("doctype_list"))
    target_doctypes = [dt for dt in DOCTYPES if not selected_list or dt in selected_list]
    if not doctype:
        # Build union SELECTs
        selects = []
        for dt in target_doctypes:
            table = f"`tab{dt}`"
            # choose primary date field from DT_FIELDS if present; else fall back to creation
            dt_date_field = DT_FIELDS.get(dt, [("creation", "Date")])[0][0]
            select_clause = (
                f"SELECT '{dt}' AS doctype, "
                "t.name AS name, "
                "t.owner AS user, "
                "CONCAT_WS(' ', u.first_name, u.middle_name, u.last_name) AS user_name, "
                "CASE t.docstatus WHEN 0 THEN 'Draft' WHEN 1 THEN 'Submitted' WHEN 2 THEN 'Cancelled' END AS status, "
                f"t.{dt_date_field} AS date "
                f"FROM {table} t "
                "LEFT JOIN `tabUser` u ON u.name = t.owner "
                f"WHERE {where_clause}"
            )
            selects.append(select_clause)
        # Combine with UNION ALL
        union_sql = " UNION ALL ".join(selects)
        # Execute union once with shared params
        data = frappe.db.sql(union_sql, params, as_dict=True)
        # Sort and cap
        data.sort(key=lambda r: (r.get("date") or frappe.utils.get_datetime(r.get("creation")) if r.get("date") else None), reverse=True)
        if len(data) > 2000:
            data = data[:2000]
        return columns, data

    table = f"`tab{doctype}`"
    # Compose select fields with table alias
    dt_field_names = [f for f, _ in DT_FIELDS.get(doctype, [])]
    select_dt_fields = ", ".join([f"t.{f}" for f in dt_field_names]) if dt_field_names else ""
    join_user_name = "CONCAT_WS(' ', u.first_name, u.middle_name, u.last_name) AS user_name"
    status_case = "CASE t.docstatus WHEN 0 THEN 'Draft' WHEN 1 THEN 'Submitted' WHEN 2 THEN 'Cancelled' END AS status"

    select_parts = [
        "t.name AS name",
        "t.owner AS user",
        join_user_name,
        status_case,
    ]
    if select_dt_fields:
        select_parts.append(select_dt_fields)
    select_clause = ", ".join(select_parts)

    data = frappe.db.sql(
        f"""
        SELECT {select_clause}
        FROM {table} t
        LEFT JOIN `tabUser` u ON u.name = t.owner
        WHERE {where_clause}
        ORDER BY t.creation DESC
        LIMIT 2000
        """,
        params,
        as_dict=True,
    )

    return columns, data
