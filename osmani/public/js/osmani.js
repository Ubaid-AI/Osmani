frappe.ready(() => {
    // Override for Report Builder reports
    if (frappe.views && frappe.views.ReportView) {
        frappe.views.ReportView.prototype.get_filters_html_for_print = function () {
            return ""; // 🚫 Hide filters
        };
    }

    // Override for Query Reports
    if (frappe.views && frappe.views.QueryReport) {
        frappe.views.QueryReport.prototype.get_filters_html_for_print = function () {
            return ""; // 🚫 Hide filters
        };
    }
});
