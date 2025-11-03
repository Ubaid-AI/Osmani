
frappe.after_ajax(() => {
    // Report Builder (List-style reports)
    if (frappe.views && frappe.views.ReportView) {
        // Backup the original once
        if (!frappe.views.ReportView.prototype.__original_get_filters_html_for_print) {
            frappe.views.ReportView.prototype.__original_get_filters_html_for_print =
                frappe.views.ReportView.prototype.get_filters_html_for_print;
        }

        frappe.views.ReportView.prototype.get_filters_html_for_print = function () {
            if (this.report_name === "Purchase Invoice") { // 👈 test report
                console.log("⚡ Hiding filters for Purchase Invoice only");
                return "";
            }
            // Otherwise call the original method
            return frappe.views.ReportView.prototype.__original_get_filters_html_for_print.call(this);
        };
    }

    // Query Reports (like General Ledger, P&L, etc.)
    if (frappe.views && frappe.views.QueryReport) {
        // Backup the original once
        if (!frappe.views.QueryReport.prototype.__original_get_filters_html_for_print) {
            frappe.views.QueryReport.prototype.__original_get_filters_html_for_print =
                frappe.views.QueryReport.prototype.get_filters_html_for_print;
        }

        frappe.views.QueryReport.prototype.get_filters_html_for_print = function () {
            if (this.report_name === "General Ledger") { // 👈 test report
                console.log("⚡ Hiding filters for General Ledger only");
                return "";
            }
            // Otherwise call the original method
            return frappe.views.QueryReport.prototype.__original_get_filters_html_for_print.call(this);
        };
    }
});


// === ZERO HIDING FOR PRINT & PDF (DOM-based, safe, per-report) ===

// Which reports should hide zeros?
const ZERO_HIDE_ONLY_FOR = ["General Ledger"];  
// 👉 Add more names: ["General Ledger", "Accounts Receivable"]

function shouldHideZerosFor(reportName) {
  if (!ZERO_HIDE_ONLY_FOR || ZERO_HIDE_ONLY_FOR.length === 0) return true;
  return ZERO_HIDE_ONLY_FOR.includes(reportName);
}

// Clean zeros inside printed HTML tables only
function cleanPrintHTMLZeros(html) {
  try {
    const root = document.createElement("div");
    root.innerHTML = html;

    let cleaned = 0;
    root.querySelectorAll("td").forEach((td) => {
      const raw = (td.textContent || "").replace(/\u00A0/g, " ").trim();
      if (!raw) return;

      const normalized = raw
        .replace(/^(Rs|₨|PKR)\s*/i, "")
        .replace(/,/g, "")
        .trim();

      if (/^-?0*(?:\.0+)?$/.test(normalized)) {
        td.textContent = ""; // hide zero
        cleaned++;
      }
    });

    if (cleaned) {
      console.log(`🧹 Zero cleaner: removed ${cleaned} zero cells`);
    }
    return root.innerHTML;
  } catch (e) {
    console.warn("Zero cleaner failed:", e);
    return html;
  }
}

// Patch render_grid (Print dialog)
if (!frappe.__orig_render_grid) {
  frappe.__orig_render_grid = frappe.render_grid;
  frappe.render_grid = function (opts) {
    let out = frappe.__orig_render_grid(opts);
    const reportName = opts && opts.report ? opts.report.report_name : null;
    if (typeof out === "string" && reportName && shouldHideZerosFor(reportName)) {
      out = cleanPrintHTMLZeros(out);
    }
    return out;
  };
}

// Patch render_template (PDF flow)
if (!frappe.__orig_render_template) {
  frappe.__orig_render_template = frappe.render_template;
  frappe.render_template = function (name, args) {
    let out = frappe.__orig_render_template(name, args);
    const reportName = args && args.report ? args.report.report_name : null;
    if (
      typeof out === "string" &&
      reportName &&
      shouldHideZerosFor(reportName) &&
      (name === "print_grid" || name === "print_template")
    ) {
      out = cleanPrintHTMLZeros(out);
    }
    return out;
  };
}
