import { AppUtils } from "../utils";
import { DataTableModule } from "../tables/data-table";

const ReportsOverview = (() => {
  const TABLE_ID = "#reports-export-table";
  const TABLE_TITLE = "Reports Overview";

  function loadReportsOverview() {
    AppUtils.cachedGScriptCall(
      "reportsOverview",
      "getReportsOverview",
      [],
      (data) => {
        renderReportsOverview(data);
      },
      false,
      true,
    );
  }

  function renderReportsOverview(data) {
    if (!data || typeof data !== "object") {
      return;
    }

    renderReportLogs(Array.isArray(data.logs) ? data.logs : []);

    renderReportStatus(data);

    renderReportCounts(
      data.counts && typeof data.counts === "object" ? data.counts : {},
    );
  }

  /* ============================================================
   * REPORT LOGS
   * ========================================================== */

  function renderReportLogs(logs) {
    const $table = $(TABLE_ID);

    if (!$table.length) {
      return;
    }

    const $tbody = $table.find("#data-table-body");

    if (!$tbody.length) {
      return;
    }

    /*
     * DataTables owns the table once initialized.
     *
     * Destroy it before rebuilding the tbody.
     */
    DataTableModule.destroy(TABLE_ID);

    $tbody.empty();

    if (!logs.length) {
      renderEmptyReportLogs($table, $tbody);
      return;
    }

    logs.forEach((log, index) => {
      $tbody.append(createReportLogRow(log, index));
    });

    /*
     * Initialize only after rows exist.
     */
    DataTableModule.init(TABLE_TITLE, TABLE_ID);
  }

  function renderEmptyReportLogs($table, $tbody) {
    const colspan = getTableColumnCount($table);

    $tbody.html(`
      <tr>
        <td
          colspan="${colspan}"
          class="text-center text-muted py-4"
        >
          No reports generated yet.
        </td>
      </tr>
    `);
  }

  function createReportLogRow(log, index) {
    const type = String(log?.type || "").trim();

    const badgeClass =
      type.toLowerCase() === "monthly" ? "bg-primary" : "bg-success";

    return `
      <tr>

        <td class="text-center">
          <b>${index + 1}</b>
        </td>

        <td>
          ${AppUtils.escapeHtml(log?.date ?? "")}
        </td>

        <td class="text-center">
          <span class="badge bg-light text-info">
            <i class="fa fa-file-pdf"></i>
            ${AppUtils.escapeHtml(log?.name ?? "")}
          </span>
        </td>

        <td class="text-center">
          <span class="badge text-white ${badgeClass}">
            ${AppUtils.escapeHtml(type)}
          </span>
        </td>

        <td class="text-center">
          <div class="btn-group btn-group-sm">

            <button
              class="btn btn-report-action btn-view-report"
              data-url="${AppUtils.escapeHtml(log?.link ?? "")}"
              title="View Report"
            >
              <i class="fa fa-eye"></i>
            </button>

            <button
              class="btn btn-report-action btn-email-report"
              data-id="${AppUtils.escapeHtml(log?.id ?? "")}"
              title="Send Email"
            >
              <i class="fa fa-envelope"></i>
            </button>

            <button
              class="btn btn-report-action btn-discord-report"
              data-id="${AppUtils.escapeHtml(log?.id ?? "")}"
              title="Send to Discord"
            >
              <i class="fab fa-discord"></i>
            </button>

          </div>
        </td>

      </tr>
    `;
  }

  /* ============================================================
   * REPORT STATUS
   * ========================================================== */

  function renderReportStatus(data) {
    const logs = Array.isArray(data.logs) ? data.logs : [];

    $("#last-monthly-report").text(getLatestReportDate(logs, "Monthly"));

    $("#last-yearly-report").text(getLatestReportDate(logs, "Yearly"));

    $("#next-scheduled-report").text(data.nextScheduled || "-");

    updateConnectionStatus("#drive-storage-status", data.driveStorage);

    updateConnectionStatus("#discord-status", data.discord);

    updateConnectionStatus("#email-status", data.email);
  }

  /* ============================================================
   * REPORT COUNTS
   * ========================================================== */

  function renderReportCounts(counts) {
    $("#monthly-reports-count").text(counts.monthly ?? 0);

    $("#yearly-reports-count").text(counts.yearly ?? 0);

    $("#pdf-generated-count").text(counts.pdfGenerated ?? 0);

    updateConnectionStatus(
      "#automation-status",
      counts.automation,
      "Active",
      "Warning",
    );
  }

  /* ============================================================
   * HELPERS
   * ========================================================== */

  function getLatestReportDate(logs = [], type) {
    const report = logs.find((log) => log?.type === type);

    return report?.date || "-";
  }

  function updateConnectionStatus(
    selector,
    connected,
    successText = "Connected",
    failureText = "Not Connected",
  ) {
    $(selector)
      .text(connected ? successText : failureText)
      .toggleClass("text-success", Boolean(connected))
      .toggleClass("text-danger", !connected);
  }

  function getTableColumnCount($table) {
    return $table.find("thead tr:first th").length || 1;
  }

  return {
    loadReportsOverview,
  };
})();

export { ReportsOverview };
