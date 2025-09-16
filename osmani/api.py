import frappe

@frappe.whitelist()
def get_purchase_invoice_items_from_payment(payment_name=None):
    items = set()
    if not payment_name:
        return ""
    payment_doc = frappe.get_doc("Payment Entry", payment_name)
    for ref in payment_doc.references:
        if ref.reference_doctype == "Purchase Invoice":
            pi = frappe.get_doc("Purchase Invoice", ref.reference_name)
            for item in pi.items:
                items.add(item.item_name)
    return ", ".join(sorted(items))


import frappe

@frappe.whitelist()
def get_party_full_name(party_name=None, party=None):
    if not party_name or not party:
        return ""

    doctype_map = {
        "Customer": "customer_name",
        "Supplier": "supplier_name",
        "Employee": "employee_name"
    }

    if party_name not in doctype_map:
        return ""

    try:
        doc = frappe.get_doc(party_name, party)
        return getattr(doc, doctype_map[party_name], "")
    except frappe.DoesNotExistError:
        return ""

