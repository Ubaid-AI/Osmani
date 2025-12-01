import frappe
from frappe import _


DOCTYPES = [
    ("Purchase Invoice", "purchase_invoice"),
    ("Sales Order", "sales_order"),
    ("Sales Invoice", "sales_invoice"),
    ("Payment Entry", "payment_entry"),
    ("Journal Entry", "journal_entry"),
    ("Employee Advance", "employee_advance"),
    ("Expense Claim", "expense_claim"),
]

DOCSTATUS_MAP = {"Draft": 0, "Submitted": 1, "Cancelled": 2}


def _normalize_doctype_list(value):
    if not value:
        return []
    if isinstance(value, (list, tuple)):
        return [v for v in value if v]
    # accept comma separated string
    return [v.strip() for v in str(value).split(",") if v.strip()]


def execute(filters=None):
    filters = filters or {}

    selected = set(_normalize_doctype_list(filters.get("doctype_list")))
    selected_doctypes = [pair for pair in DOCTYPES if not selected or pair[0] in selected]

    # Build columns dynamically based on selected doctypes
    columns = [
        {"label": _("User"), "fieldname": "user", "fieldtype": "Link", "options": "User", "width": 180}
    ]
    for dt, key in selected_doctypes:
        columns.append({"label": _(dt), "fieldname": key, "fieldtype": "Int", "width": 130})
    columns.append({"label": _("Total"), "fieldname": "total", "fieldtype": "Int", "width": 130})

    # Common conditions
    conditions = ["1=1"]
    params = {}

    if filters.get("from_date"):
        conditions.append("creation >= %(from_date)s")
        params["from_date"] = filters.get("from_date")

    if filters.get("to_date"):
        conditions.append("creation <= %(to_date)s")
        params["to_date"] = filters.get("to_date")

    if filters.get("user"):
        conditions.append("owner = %(user)s")
        params["user"] = filters.get("user")

    docstatus_label = filters.get("docstatus")
    if docstatus_label and docstatus_label != "All":
        conditions.append("docstatus = %(docstatus)s")
        params["docstatus"] = DOCSTATUS_MAP.get(docstatus_label, docstatus_label)

    where_clause = " AND ".join(conditions)

    # Aggregate per doctype with GROUP BY owner
    rows_by_user = {}
    for dt, key in selected_doctypes:
        table = f"`tab{dt}`"
        res = frappe.db.sql(
            f"""
            SELECT owner, COUNT(*) AS cnt
            FROM {table}
            WHERE {where_clause}
            GROUP BY owner
            """,
            params,
            as_dict=True,
        )
        for r in res:
            u = r["owner"]
            row = rows_by_user.setdefault(u, {"user": u})
            row[key] = r["cnt"]

    # Build final data, fill missing zeros, and totals
    data = []
    for u, row in rows_by_user.items():
        total = 0
        for dt, key in selected_doctypes:
            val = int(row.get(key, 0) or 0)
            row[key] = val
            total += val
        row["total"] = total
        data.append(row)

    # Sort by total desc then user asc
    data.sort(key=lambda x: (-x.get("total", 0), x.get("user", "")))

    return columns, data
