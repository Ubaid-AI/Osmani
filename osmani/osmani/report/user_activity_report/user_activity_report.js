frappe.query_reports["User Activity Report"] = {
    filters: [
        {
            fieldname: "from_date",
            label: "From Date",
            fieldtype: "Date"
        },
        {
            fieldname: "to_date",
            label: "To Date",
            fieldtype: "Date"
        },
        {
            fieldname: "user",
            label: "User",
            fieldtype: "Link",
            options: "User"
        },
        {
            fieldname: "doctype_list",
            label: "Document Types",
            fieldtype: "MultiSelectList",
            get_data: function() {
                const doctypes = [
                    "Purchase Invoice",
                    "Sales Order",
                    "Sales Invoice",
                    "Payment Entry",
                    "Journal Entry",
                    "Employee Advance",
                    "Expense Claim",
                ];
                return doctypes.map(d => ({
                    label: d,
                    value: d
                }));
            }
        },
        {
            fieldname: "docstatus",
            label: "Status",
            fieldtype: "Select",
            options: ["All", "Draft", "Submitted", "Cancelled"].join("\n"),
            default: "All"
        }
    ],
    onload: function(report) {
        report.page.set_title("User Activity Summary");
        // Add export button
        report.page.add_button("Export", () => {
            frappe.query_report.download();
        });
    },
    formatter: function(value, row, column, data, default_formatter) {
        const formatted_value = default_formatter(value, row, column, data);
        const clickables = [
            "purchase_invoice",
            "sales_order",
            "sales_invoice",
            "payment_entry",
            "journal_entry",
            "employee_advance",
            "expense_claim",
        ];
        if (column && clickables.includes(column.fieldname) && value) {
            const dtLabelMap = {
                purchase_invoice: "Purchase Invoice",
                sales_order: "Sales Order",
                sales_invoice: "Sales Invoice",
                payment_entry: "Payment Entry",
                journal_entry: "Journal Entry",
                employee_advance: "Employee Advance",
                expense_claim: "Expense Claim",
            };

            const user = data.user;
            const doctype = dtLabelMap[column.fieldname];

            return `<a href="#" data-doctype="${doctype}" data-user="${user}" class="count-link">${formatted_value}</a>`;
        }
        return formatted_value;
    },
    after_datatable_render: function(report) {
        const el = report.$wrapper[0];
        el.querySelectorAll("a.count-link").forEach(a => {
            a.addEventListener("click", (ev) => {
                ev.preventDefault();
                const doctype = a.getAttribute("data-doctype");
                const user = a.getAttribute("data-user");
                const f = report.get_values();

                const route_opts = {
                    from_date: f.from_date,
                    to_date: f.to_date,
                    user: user,
                    doctype: doctype,
                    docstatus: f.docstatus,
                };
                frappe.set_route("query-report", "User Activity Detail", route_opts);
            });
        });
    }
};
