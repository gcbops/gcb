import { AppUtils } from "../utils";

const ReportHistory = (() => {
  function loadReportHistory(
    cacheKey,
    serverFunction,
    tableBodyId,
    callback = null,
    refresh = false,
  ) {
    AppUtils.cachedGScriptCall(
      cacheKey,
      serverFunction,
      [],
      (data) => {
        const reportLogs = data?.reportLogs || [];

        renderReportHistory(tableBodyId, reportLogs);

        if (typeof callback !== "function") {
          return;
        }

        // Wait until the new rows are actually rendered.
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

  function renderReportHistory(tableBodyId, reportLogs) {
    const tbody = $(`#${tableBodyId}`);

    if (!tbody.length) {
      return;
    }

    tbody.empty();

    if (!Array.isArray(reportLogs) || !reportLogs.length) {
      renderEmptyReportHistory(tbody);
      return;
    }

    reportLogs.forEach((log, index) => {
      tbody.append(createReportHistoryRow(log, index));
    });
  }

  function renderEmptyReportHistory(tbody) {
    tbody.html(`
      <tr>
        <td
          colspan="4"
          class="text-center text-muted py-4"
        >
          No reports generated yet.
        </td>
      </tr>
    `);
  }

  function createReportHistoryRow(log, index) {
    return `
      <tr>
        <td class="text-center">
          <b>${index + 1}</b>
        </td>

        <td>
          ${log.date || ""}
        </td>

        <td class="text-center">
          <span class="badge bg-light text-info">
            ${log.name || ""}
          </span>
        </td>

        <td class="text-center">
          <div class="btn-group btn-group-sm">

            <button
              class="btn btn-report-action btn-view-report"
              data-url="${log.link || ""}"
              title="View Report"
            >
              <i class="fa fa-eye"></i>
            </button>

            <button
              class="btn btn-report-action btn-email-report"
              data-id="${log.id || ""}"
              title="Send Email"
            >
              <i class="fa fa-envelope"></i>
            </button>

            <button
              class="btn btn-report-action btn-discord-report"
              data-id="${log.id || ""}"
              title="Send to Discord"
            >
              <i class="fab fa-discord"></i>
            </button>

          </div>
        </td>
      </tr>
    `;
  }

  function loadCustomMonthlyReportsPageData(callback = null, refresh = false) {
    loadReportHistory(
      "monthlyReportsPageData",
      "getMonthlyReportHistory",
      "monthly-report-history",
      callback,
      refresh,
    );
  }

  function loadCustomYearlyReportsPageData(callback = null, refresh = false) {
    loadReportHistory(
      "yearlyReportsPageData",
      "getYearlyReportHistory",
      "yearly-report-history",
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
