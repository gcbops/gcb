import { GcbAuthModule } from "../auth/auth";
import { DataTableModule } from "../components/data-table";
import { AppUtils } from "../utils/utils";
import { ReportService } from "./service";

const ReportHistory = (() => {
  const TABLE_TITLE = "Report History";

  async function loadReportHistory({
    cacheKey,
    serverFunction,
    tableId,
    tbodyId,
    callback = null,
    refresh = false,
  }) {
    if (refresh || !AppUtils.cacheGet(cacheKey)) {
      if (tableId && !refresh) {
        DataTableModule.showLoader(tableId);
      }
    }

    try {
      const [sessionId, signature] = await GcbAuthModule.getAuthArgs();

      AppUtils.cachedGScriptCall(
        cacheKey,
        serverFunction,
        [sessionId, signature],
        (data) => {
          const reportLogs = Array.isArray(data?.reportLogs)
            ? data.reportLogs
            : [];

          renderReportHistory({
            reportLogs,
            tableId,
            tbodyId,
          });

          if (typeof callback === "function") {
            callback(reportLogs, data);
          }
        },
        false,
        refresh,
      );
    } catch (error) {
      console.error(`[ReportHistory] Failed to load ${serverFunction}:`, error);

      AppUtils.showError(error?.message || "Unable to load report history.");
    }
  }

  function renderReportHistory({ reportLogs, tableId, tbodyId }) {
    const tbody = document.getElementById(tbodyId);

    if (!tbody) {
      return;
    }

    DataTableModule.hideTableOverlay(tableId);

    const table = tbody.closest("table");

    if (!table?.id) {
      return;
    }

    const resolvedTableId = tableId || `#${table.id}`;

    DataTableModule.destroy(resolvedTableId);

    tbody.innerHTML = "";

    if (!Array.isArray(reportLogs) || !reportLogs.length) {
      DataTableModule.showEmpty(resolvedTableId, "No reports generated yet.");

      return;
    }

    reportLogs.forEach((log, index) => {
      tbody.appendChild(createReportHistoryRow(log, index));
    });

    DataTableModule.init(TABLE_TITLE, resolvedTableId, false, {
      paging: false,
      scrollY: "420px",
      layout: {
        topStart: null,
        topEnd: null,
        bottomStart: ["info"],
        bottomEnd: ["search"],
      },
    });
  }

  function createReportHistoryRow(log, index) {
    const tr = document.createElement("tr");

    const reportDate = log?.date ?? "";
    const reportName = log?.name ?? "";
    const reportLink = log?.link ?? "";
    const reportId = log?.id ?? "";
    const reportType = log?.type ?? "";

    const isBillingReport = reportType === "Billing";

    const fileIcon = isBillingReport ? "fa-file-csv" : "fa-file-pdf";
    const viewTitle = isBillingReport ? "Open CSV" : "View Report";

    const safeReportUrl = ReportService.getSafeReportUrl(reportLink);

    tr.innerHTML = `
      <td class="text-center">
        <b>${index + 1}</b>
      </td>

      <td>
        ${AppUtils.escapeHtml(reportDate)}
      </td>

      <td class="text-center">
        <span class="badge bg-light text-gc">
          <i class="fa-solid ${AppUtils.escapeHtml(fileIcon)} fs-5 me-1"></i>
          ${AppUtils.escapeHtml(reportName)}
        </span>
      </td>

      <td class="text-center">
        <div class="dropleft btn-group">
          <button
            type="button"
            class="p-0 btn border-0"
            data-bs-toggle="dropdown"
            aria-haspopup="true"
            aria-expanded="false"
            title="Report actions"
          >
            <i class="pe-7s-more"></i>
          </button>

          <div
            tabindex="-1"
            role="menu"
            aria-hidden="true"
            class="dropdown-menu"
          >
            <button
              type="button"
              tabindex="0"
              role="menuitem"
              class="dropdown-item btn-report-action btn-view-report"
              data-url="${AppUtils.escapeHtml(safeReportUrl)}"
              title="${AppUtils.escapeHtml(viewTitle)}"
            >
              <i class="pe-7s-display2 me-2 text-info"></i>
              ${AppUtils.escapeHtml(viewTitle)}
            </button>

            <button
              type="button"
              tabindex="0"
              role="menuitem"
              data-required-role="manager"
              class="dropdown-item btn-report-action btn-email-report"
              data-id="${AppUtils.escapeHtml(reportId)}"
              data-type="${AppUtils.escapeHtml(reportType)}"
              title="Send Email"
            >
              <i class="pe-7s-mail me-2 text-success"></i>
              Send Email
            </button>

            <button
              type="button"
              tabindex="0"
              role="menuitem"
              data-required-role="manager"
              class="dropdown-item btn-report-action btn-discord-report"
              data-id="${AppUtils.escapeHtml(reportId)}"
              data-type="${AppUtils.escapeHtml(reportType)}"
              title="Send to Discord"
            >
              <i class="pe-7s-joy me-2 text-alternate"></i>
              Send to Discord
            </button>
          </div>
        </div>
      </td>
    `;

    return tr;
  }

  function loadCustomMonthlyReportsPageData(callback = null, refresh = false) {
    loadReportHistory({
      cacheKey: "monthlyReportsPageData",
      serverFunction: "getMonthlyReportHistory",
      tableId: "#monthly-report-history",
      tbodyId: "monthly-report-history-body",
      callback,
      refresh,
    });
  }

  function loadCustomYearlyReportsPageData(callback = null, refresh = false) {
    loadReportHistory({
      cacheKey: "yearlyReportsPageData",
      serverFunction: "getYearlyReportHistory",
      tableId: "#annual-report-history",
      tbodyId: "annual-report-history-body",
      callback,
      refresh,
    });
  }

  return {
    loadCustomMonthlyReportsPageData,
    loadCustomYearlyReportsPageData,
  };
})();

export { ReportHistory };