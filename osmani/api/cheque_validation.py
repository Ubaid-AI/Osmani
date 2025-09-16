# import frappe

# @frappe.whitelist()
# def validate_cheque_number(bank_account, cheque_number):
#     if not bank_account or not cheque_number:
#         frappe.throw("Bank account and cheque number are required.")

#     doc = frappe.get_doc("Account", bank_account)

#     try:
#         cheque_number = int(cheque_number)
#     except ValueError:
#         frappe.throw("Cheque number must be numeric.")

#     if doc.custom_cheque_from and doc.custom_cheque_to:
#         from_no = int(doc.custom_cheque_from)
#         to_no = int(doc.custom_cheque_to)

#         if not (from_no <= cheque_number <= to_no):
#             frappe.throw(f"Cheque number {cheque_number} does not belong to the range {from_no}-{to_no} of this bank account.")
#     else:
#         frappe.throw("Selected bank account does not have cheque range defined.")


import frappe

@frappe.whitelist()
def validate_cheque_number(bank_account, cheque_number):
    if not bank_account or not cheque_number:
        frappe.throw("Bank account and cheque number are required.")

    # Ensure cheque number is numeric
    try:
        cheque_number = int(cheque_number)
    except ValueError:
        frappe.throw("Cheque number must be numeric.")

    # Load account with child table
    doc = frappe.get_doc("Account", bank_account)

    if not doc.get("custom_cheque_book"):
        frappe.throw(f"Bank account {doc.name} does not have any cheque books defined.")

    # Check through all enabled cheque books
    valid = False
    for book in doc.custom_cheque_book:
        if book.enable:
            try:
                from_no = int(book.cheque_from)
                to_no = int(book.cheque_to)
            except (ValueError, TypeError):
                continue  # skip invalid rows

            if from_no <= cheque_number <= to_no:
                valid = True
                break

    if not valid:
        frappe.throw(
            f"Cheque number {cheque_number} does not belong to any enabled cheque book "
            f"for account {doc.name}."
        )
