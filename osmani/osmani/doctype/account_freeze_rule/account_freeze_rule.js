// Copyright (c) 2026, Ubaid Ali and contributors
// For license information, please see license.txt

frappe.ui.form.on("Account Freeze Rule", {
	refresh(frm) {
		// Add custom buttons or indicators
		if (!frm.is_new() && frm.doc.active) {
			frm.set_indicator(__("Active"), "green");
		} else if (!frm.is_new() && !frm.doc.active) {
			frm.set_indicator(__("Inactive"), "gray");
		}
		
		// Show warning message
		if (frm.doc.active) {
			frm.dashboard.add_comment(
				__("Warning: This freeze rule will block all transactions posting to account {0} from {1} to {2}", 
				[frm.doc.account || "...", frm.doc.from_date || "...", frm.doc.to_date || "..."]),
				"yellow",
				true
			);
		}
	},
	
	account(frm) {
		// Auto-fill company from account
		if (frm.doc.account && !frm.doc.company) {
			frappe.db.get_value("Account", frm.doc.account, "company", (r) => {
				if (r && r.company) {
					frm.set_value("company", r.company);
				}
			});
		}
	},
	
	from_date(frm) {
		validate_date_range(frm);
	},
	
	to_date(frm) {
		validate_date_range(frm);
	}
});

function validate_date_range(frm) {
	if (frm.doc.from_date && frm.doc.to_date) {
		let from_date = frappe.datetime.str_to_obj(frm.doc.from_date);
		let to_date = frappe.datetime.str_to_obj(frm.doc.to_date);
		
		if (from_date > to_date) {
			frappe.msgprint({
				title: __("Invalid Date Range"),
				indicator: "red",
				message: __("From Date cannot be greater than To Date")
			});
		}
	}
}
