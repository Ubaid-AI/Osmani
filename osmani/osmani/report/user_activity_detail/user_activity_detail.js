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
            const route_opts = frappe.get_route_options ? frappe.get_route_options() : (frappe.route_options || {});

            let dtList = route_opts.doctype_list;
            if (typeof dtList === "string" && dtList) {
                dtList = dtList.split(",").map(s => s.trim()).filter(Boolean);
            }
            if (!Array.isArray(dtList)) {
                dtList = dtList ? [dtList] : [];
            }
            // If a specific doctype is selected in Detail, ensure it is included
            if (f.doctype && !dtList.includes(f.doctype)) {
                dtList.push(f.doctype);
            }

            frappe.set_route("query-report", "User Activity Report", {
                from_date: f.from_date,
                to_date: f.to_date,
                user: f.user,
                docstatus: f.docstatus,
                doctype_list: dtList,
            });
        });

        report.page.add_button("Export", () => {
            frappe.query_report.download();
        });
    }
};
