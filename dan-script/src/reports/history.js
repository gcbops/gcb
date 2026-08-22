import { DataTableModule } from "../tables/data-table";
import { AppUtils } from "../utils";

const ReportHistory = (() => {
  function loadReportHistory(
    cacheKey,
    serverFunction,
    callback = null,
    refresh = false,
  ) {
    AppUtils.cachedGScriptCall(
      cacheKey,
      serverFunction,
      [],
      (data) => {
        const reportLogs = data?.reportLogs || [];

        renderReportHistory(reportLogs);

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

  function renderReportHistory(reportLogs) {
    const $tbody = $("#data-table-body");

    if (!$tbody.length) {
      return;
    }

    const $table = $tbody.closest("table");

    if (!$table.length) {
      return;
    }

    const tableId = $table.attr("id");


    $tbody.empty();

    if (!Array.isArray(reportLogs) || !reportLogs.length) {
      renderEmptyReportHistory($tbody);
      return;
    }

    reportLogs.forEach((log, index) => {
      $tbody.append(createReportHistoryRow(log, index));
    });

    /*
     * Initialize after rendering.
     */
    if (tableId) {
      DataTableModule.init("Report History", `#${tableId}`);
    }
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
            <i class="fa fa-file-pdf"></i> ${log.name || ""}
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
