import { DataTableModule } from "../tables/data-table";
import { AppUtils } from "../utils";

const ReportHistory = (() => {
  const TABLE_TITLE = "Report History";
  const TABLE_BODY_ID = "data-table-body";

  function loadReportHistory(
    cacheKey,
    serverFunction,
    callback = null,
    refresh = false,
  ) {
    /*
     * Show loader only when we don't already have
     * usable cached data.
     */
    if (refresh || !AppUtils.cacheGet(cacheKey)) {
      const tableId = getTableId();

      if (tableId) {
        DataTableModule.showLoader(tableId, "Loading reports...");
      }
    }

    AppUtils.cachedGScriptCall(
      cacheKey,
      serverFunction,
      [],
      (data) => {
        const reportLogs = Array.isArray(data?.reportLogs)
          ? data.reportLogs
          : [];

        renderReportHistory(reportLogs);

        /*
         * Some callers need to continue only after
         * the table has finished rendering.
         */
        if (typeof callback !== "function") {
          return;
        }

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            callback(data);
          });
        });
      },
      false,
      refresh,
    );
  }

  function getTableId() {
    const tbody = document.getElementById(TABLE_BODY_ID);

    if (!tbody) {
      return null;
    }

    const table = tbody.closest("table");

    if (!table?.id) {
      return null;
    }

    return `#${table.id}`;
  }

  function renderReportHistory(reportLogs) {
    const tbody = document.getElementById(TABLE_BODY_ID);

    if (!tbody) {
      return;
    }

    const table = tbody.closest("table");

    if (!table?.id) {
      return;
    }

    const tableId = `#${table.id}`;

    /*
     * No records.
     */
    if (!Array.isArray(reportLogs) || !reportLogs.length) {
      DataTableModule.showEmpty(tableId, "No reports generated yet.");

      return;
    }

    tbody.innerHTML = "";

    reportLogs.forEach((log, index) => {
      tbody.appendChild(createReportHistoryRow(log, index));
    });

    /*
     * Initialize only after rows exist.
     */
    DataTableModule.init(TABLE_TITLE, tableId);
  }

  function createReportHistoryRow(log, index) {
    const tr = document.createElement("tr");

    const reportDate = log?.date ?? "";

    const reportName = log?.name ?? "";

    const reportLink = log?.link ?? "";

    const reportId = log?.id ?? "";

    tr.innerHTML = `
      <td class="text-center">
        <b>${index + 1}</b>
      </td>

      <td>
        ${AppUtils.escapeHtml(reportDate)}
      </td>

      <td class="text-center">
        <span class="badge bg-light text-info">
          <i class="fa fa-file-pdf"></i>
          ${AppUtils.escapeHtml(reportName)}
        </span>
      </td>

      <td class="text-center">
        <div class="btn-group btn-group-sm">

          <button
            type="button"
            class="btn btn-report-action btn-view-report"
            data-url="${AppUtils.escapeHtml(reportLink)}"
            title="View Report"
          >
            <i class="fa fa-eye"></i>
          </button>

          <button
            type="button"
            class="btn btn-report-action btn-email-report"
            data-id="${AppUtils.escapeHtml(reportId)}"
            title="Send Email"
          >
            <i class="fa fa-envelope"></i>
          </button>

          <button
            type="button"
            class="btn btn-report-action btn-discord-report"
            data-id="${AppUtils.escapeHtml(reportId)}"
            title="Send to Discord"
          >
            <i class="fab fa-discord"></i>
          </button>

        </div>
      </td>
    `;

    return tr;
  }

  function loadCustomMonthlyReportsPageData(callback = null, refresh = false) {
    loadReportHistory(
      "monthlyReportsPageData",
      "getMonthlyReportHistory",
      callback,
      refresh,
    );
  }

  function loadCustomYearlyReportsPageData(callback = null, refresh = false) {
    loadReportHistory(
      "yearlyReportsPageData",
      "getYearlyReportHistory",
      callback,
      refresh,
    );
  }

  return {
    loadCustomMonthlyReportsPageData,
    loadCustomYearlyReportsPageData,
  };
})();

export { ReportHistory };
