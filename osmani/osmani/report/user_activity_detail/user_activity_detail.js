frappe.query_reports["User Activity Detail"] = {
    filters: [
        { fieldname: "from_date", label: "From Date", fieldtype: "Date" },
        { fieldname: "to_date", label: "To Date", fieldtype: "Date" },
        { fieldname: "user", label: "User", fieldtype: "Link", options: "User" },
        { fieldname: "doctype", label: "DocType", fieldtype: "Link", options: "DocType" },
        { fieldname: "docstatus", label: "Status", fieldtype: "Select", options: ["All", "Draft", "Submitted", "Cancelled"].join("\n"), default: "All" },
        { fieldname: "docname", label: "Document Name", fieldtype: "Data" },
    ],
    onload: function(report) {
        report.page.set_title("User Activity Detail");

        report.page.add_button("Back to Summary", () => {
            const f = report.get_values();
            frappe.set_route("query-report", "User Activity Report", {
                from_date: f.from_date,
                to_date: f.to_date,
                user: f.user,
                docstatus: f.docstatus,
                doctype_list: f.doctype ? f.doctype : undefined,
            });
        });

        report.page.add_button("Export", () => {
            frappe.query_report.download();
        });
    }
};
