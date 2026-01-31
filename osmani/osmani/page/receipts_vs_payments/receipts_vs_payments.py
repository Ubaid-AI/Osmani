import json

import frappe


@frappe.whitelist()
def get_receipts_vs_payments_data(from_date, to_date, project=None, include_tax=0):
	"""
	Receipts vs Payments (daily aggregation) for selected project(s).

	Columns per day:
	- Sales Order (amount)
	- Sales Invoice (amount)
	- Payment Against Sales Invoice (allocated payments, by Payment Entry posting date)
	- Purchase Invoice (amount)
	- Payment Against Purchase (allocated payments, by Payment Entry posting date)
	- Payable (sum of outstanding_amount of Purchase Invoices posted that day)
	- Pay / Others (Payment Entries of type Pay that are not linked to Purchase Invoice)
	- Remarks (best-effort: Supplier/Customer/Payment remarks; 'Multiple' if many)
	"""
	company = (
		frappe.defaults.get_user_default("company")
		or frappe.db.get_single_value("Global Defaults", "default_company")
	)

	if isinstance(project, str) and project:
		try:
			# In case a JSON string slips in
			project = json.loads(project)
		except Exception:
			pass
	if isinstance(project, list):
		project = project[0] if project else None

	if not project:
		frappe.throw("Project is required")

	include_tax = 1 if int(include_tax or 0) else 0

	# Helpers
	def _project_condition(alias="t"):
		return f" AND {alias}.project = %(project)s", {"project": project}

	def _sum_by_date(rows):
		out = {}
		for d, amt in rows:
			out[d] = (out.get(d) or 0) + (amt or 0)
		return out

	def _remarks_merge(existing, new_value):
		if not new_value:
			return existing
		if not existing:
			return new_value
		if existing == new_value:
			return existing
		return "Multiple"

	# Sales Order totals by transaction_date
	so_amount_col = "grand_total" if include_tax else "net_total"
	so_cond, so_args = _project_condition("so")
	so_item_has_project = frappe.db.has_column("Sales Order Item", "project")

	# Some implementations add Project on Sales Order Item (custom field).
	# Only use that condition if the column exists in this site.
	so_item_project_clause = ""
	if so_item_has_project:
		so_item_project_clause = """
			OR so.name IN (
				SELECT DISTINCT soi.parent
				FROM `tabSales Order Item` soi
				WHERE soi.project = %(project)s
			)
		"""
	so_rows = frappe.db.sql(
		f"""
		SELECT
			so.transaction_date as date,
			SUM(so.{so_amount_col}) as amount
		FROM `tabSales Order` so
		WHERE
			so.docstatus = 1
			AND so.company = %(company)s
			AND so.transaction_date BETWEEN %(from_date)s AND %(to_date)s
			AND (1=1 {so_cond} {so_item_project_clause})
		GROUP BY so.transaction_date
		ORDER BY so.transaction_date
		""",
		{
			"company": company,
			"from_date": from_date,
			"to_date": to_date,
			**so_args,
		},
		as_list=True,
	)
	so_by_date = _sum_by_date(so_rows)

	# Sales Invoice totals by posting_date
	si_amount_col = "grand_total" if include_tax else "net_total"
	si_cond, si_args = _project_condition("si")
	si_rows = frappe.db.sql(
		f"""
		SELECT
			si.posting_date as date,
			SUM(si.{si_amount_col}) as amount
		FROM `tabSales Invoice` si
		WHERE
			si.docstatus = 1
			AND si.company = %(company)s
			AND si.posting_date BETWEEN %(from_date)s AND %(to_date)s
			{si_cond}
		GROUP BY si.posting_date
		ORDER BY si.posting_date
		""",
		{
			"company": company,
			"from_date": from_date,
			"to_date": to_date,
			**si_args,
		},
		as_list=True,
	)
	si_by_date = _sum_by_date(si_rows)

	# Payment received against Sales Invoice (Payment Entry posting_date)
	# Filter by project through referenced Sales Invoice.
	si_pay_cond, si_pay_args = _project_condition("si")
	si_pay_rows = frappe.db.sql(
		f"""
		SELECT
			pe.posting_date as date,
			SUM(per.allocated_amount) as amount
		FROM `tabPayment Entry Reference` per
		INNER JOIN `tabPayment Entry` pe ON pe.name = per.parent
		INNER JOIN `tabSales Invoice` si ON si.name = per.reference_name
		WHERE
			pe.docstatus = 1
			AND pe.company = %(company)s
			AND per.reference_doctype = 'Sales Invoice'
			AND pe.posting_date BETWEEN %(from_date)s AND %(to_date)s
			AND si.docstatus = 1
			{si_pay_cond}
		GROUP BY pe.posting_date
		ORDER BY pe.posting_date
		""",
		{
			"company": company,
			"from_date": from_date,
			"to_date": to_date,
			**si_pay_args,
		},
		as_list=True,
	)
	si_pay_by_date = _sum_by_date(si_pay_rows)

	# Purchase Invoice totals by posting_date + payable (outstanding_amount)
	pi_amount_col = "grand_total" if include_tax else "net_total"
	pi_cond, pi_args = _project_condition("pi")
	pi_rows = frappe.db.sql(
		f"""
		SELECT
			pi.posting_date as date,
			SUM(pi.{pi_amount_col}) as amount,
			SUM(pi.outstanding_amount) as payable,
			COUNT(DISTINCT pi.supplier) as suppliers_count,
			MAX(pi.supplier_name) as supplier_name
		FROM `tabPurchase Invoice` pi
		WHERE
			pi.docstatus = 1
			AND pi.company = %(company)s
			AND pi.posting_date BETWEEN %(from_date)s AND %(to_date)s
			{pi_cond}
		GROUP BY pi.posting_date
		ORDER BY pi.posting_date
		""",
		{
			"company": company,
			"from_date": from_date,
			"to_date": to_date,
			**pi_args,
		},
		as_dict=True,
	)
	pi_by_date = {}
	payable_by_date = {}
	pi_remarks_by_date = {}
	for r in pi_rows:
		pi_by_date[r["date"]] = (pi_by_date.get(r["date"]) or 0) + (r["amount"] or 0)
		payable_by_date[r["date"]] = (payable_by_date.get(r["date"]) or 0) + (r["payable"] or 0)
		if (r.get("suppliers_count") or 0) == 1 and r.get("supplier_name"):
			pi_remarks_by_date[r["date"]] = _remarks_merge(pi_remarks_by_date.get(r["date"]), r.get("supplier_name"))
		elif (r.get("suppliers_count") or 0) > 1:
			pi_remarks_by_date[r["date"]] = _remarks_merge(pi_remarks_by_date.get(r["date"]), "Multiple")

	# Payment made against Purchase Invoice (Payment Entry posting_date)
	pi_pay_cond, pi_pay_args = _project_condition("pi")
	pi_pay_rows = frappe.db.sql(
		f"""
		SELECT
			pe.posting_date as date,
			SUM(per.allocated_amount) as amount
		FROM `tabPayment Entry Reference` per
		INNER JOIN `tabPayment Entry` pe ON pe.name = per.parent
		INNER JOIN `tabPurchase Invoice` pi ON pi.name = per.reference_name
		WHERE
			pe.docstatus = 1
			AND pe.company = %(company)s
			AND per.reference_doctype = 'Purchase Invoice'
			AND pe.posting_date BETWEEN %(from_date)s AND %(to_date)s
			AND pi.docstatus = 1
			{pi_pay_cond}
		GROUP BY pe.posting_date
		ORDER BY pe.posting_date
		""",
		{
			"company": company,
			"from_date": from_date,
			"to_date": to_date,
			**pi_pay_args,
		},
		as_list=True,
	)
	pi_pay_by_date = _sum_by_date(pi_pay_rows)

	# Pay / Others: Payment Entry (Pay) not linked to Purchase Invoice
	# Filter by pe.project when projects are selected (best-effort).
	pe_project_cond = " AND (pe.project = %(project)s OR IFNULL(pe.project, '') = '')"
	pe_project_args = {"project": project}

	other_pay_rows = frappe.db.sql(
		f"""
		SELECT
			pe.posting_date as date,
			SUM(pe.paid_amount) as amount,
			COUNT(DISTINCT pe.remarks) as remarks_count,
			MAX(pe.remarks) as remarks
		FROM `tabPayment Entry` pe
		WHERE
			pe.docstatus = 1
			AND pe.company = %(company)s
			AND pe.payment_type = 'Pay'
			AND pe.posting_date BETWEEN %(from_date)s AND %(to_date)s
			AND NOT EXISTS (
				SELECT 1
				FROM `tabPayment Entry Reference` per
				WHERE per.parent = pe.name
					AND per.reference_doctype = 'Purchase Invoice'
			)
			{pe_project_cond}
		GROUP BY pe.posting_date
		ORDER BY pe.posting_date
		""",
		{
			"company": company,
			"from_date": from_date,
			"to_date": to_date,
			**pe_project_args,
		},
		as_dict=True,
	)
	other_pay_by_date = {}
	other_pay_remarks_by_date = {}
	for r in other_pay_rows:
		other_pay_by_date[r["date"]] = (other_pay_by_date.get(r["date"]) or 0) + (r["amount"] or 0)
		if (r.get("remarks_count") or 0) == 1 and r.get("remarks"):
			other_pay_remarks_by_date[r["date"]] = _remarks_merge(other_pay_remarks_by_date.get(r["date"]), r.get("remarks"))
		elif (r.get("remarks_count") or 0) > 1:
			other_pay_remarks_by_date[r["date"]] = _remarks_merge(other_pay_remarks_by_date.get(r["date"]), "Multiple")

	# Build union of all dates with activity
	all_dates = set()
	for dmap in (so_by_date, si_by_date, si_pay_by_date, pi_by_date, pi_pay_by_date, payable_by_date, other_pay_by_date):
		all_dates.update(dmap.keys())

	all_dates = sorted(all_dates)

	rows = []
	totals = {
		"sales_order": 0,
		"sales_invoice": 0,
		"payment_sales_invoice": 0,
		"purchase_invoice": 0,
		"payment_purchase_invoice": 0,
		"payable": 0,
		"pay_others": 0,
	}

	for d in all_dates:
		row = {
			"date": d,
			"sales_order": so_by_date.get(d) or 0,
			"sales_invoice": si_by_date.get(d) or 0,
			"payment_sales_invoice": si_pay_by_date.get(d) or 0,
			"purchase_invoice": pi_by_date.get(d) or 0,
			"payment_purchase_invoice": pi_pay_by_date.get(d) or 0,
			"payable": payable_by_date.get(d) or 0,
			"pay_others": other_pay_by_date.get(d) or 0,
			"remarks": "",
		}

		# Best-effort remarks: supplier name on purchase dates, else payment remarks
		row["remarks"] = _remarks_merge(row["remarks"], pi_remarks_by_date.get(d))
		row["remarks"] = _remarks_merge(row["remarks"], other_pay_remarks_by_date.get(d))

		rows.append(row)

		totals["sales_order"] += row["sales_order"]
		totals["sales_invoice"] += row["sales_invoice"]
		totals["payment_sales_invoice"] += row["payment_sales_invoice"]
		totals["purchase_invoice"] += row["purchase_invoice"]
		totals["payment_purchase_invoice"] += row["payment_purchase_invoice"]
		totals["payable"] += row["payable"]
		totals["pay_others"] += row["pay_others"]

	# Summary (cashflow-style)
	total_receipts = totals["payment_sales_invoice"]
	total_payments = totals["payment_purchase_invoice"] + totals["pay_others"]
	net_balance = total_receipts - total_payments

	return {
		"rows": rows,
		"totals": totals,
		"summary": {
			"total_receipts": total_receipts,
			"total_payments": total_payments,
			"net_balance": net_balance,
		},
	}

