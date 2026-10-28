import { AppUtils } from "../utils/utils";
import { DataTableModule } from "../components/data-table";
import { TableFilterService } from "../tables/table-filter-service";
import { GcbAuthModule } from "../auth/auth";
import { ReportService } from "./service";

const ReportsOverview = (() => {
  const TABLE_ID = "#reports-export-table";
  const TABLE_TITLE = "Reports Overview";

  async function loadReportsOverview() {
    DataTableModule.showLoader(TABLE_ID);

    try {
      const [sessionId, signature] = await GcbAuthModule.getAuthArgs();

      AppUtils.cachedGScriptCall(
        "reportsOverview",
        "getReportsOverview",
        [sessionId, signature],
        (data) => {
          renderReportsOverview(data);
        },
        false,
        true,
      );
    } catch (error) {
      console.error(
        "[ReportsOverview] Failed to load reports overview:",
        error,
      );

      AppUtils.showError(error?.message || "Unable to load reports overview.");
    }
  }

  function renderReportsOverview(data) {
    if (!data) {
      DataTableModule.showEmpty(TABLE_ID, "No report data available.");

      return;
    }

    renderReportLogs(data.logs || []);
    renderReportStatus(data);
    renderReportCounts(data.counts || {});
  }

  function renderReportLogs(logs) {
    const $tbody = $(`${TABLE_ID} tbody`);

    if (!$tbody.length) {
      return;
    }

    DataTableModule.hideTableOverlay(TABLE_ID);

    if (!Array.isArray(logs) || !logs.length) {
      DataTableModule.showEmpty(TABLE_ID, "No reports generated yet.");

      return;
    }

    DataTableModule.destroy(TABLE_ID);

    $tbody.empty();

    logs.forEach((log, index) => {
      $tbody.append(createReportLogRow(log, index));
    });

    DataTableModule.init(TABLE_TITLE, TABLE_ID, false, {
      paging: false,
      scrollY: "420px",
      layout: {
        topStart: null,
        topEnd: null,
        bottomStart: ["info"],
        bottomEnd: ["search"],
      },
    });

    if (document.getElementById("reportHistoryTypeFilter")) {
      TableFilterService.init(
        "reportHistoryTypeFilter",
        "reports-export-table",
        3,
        "table-filter-value",
        "all",
      );
    }
  }

  function createReportLogRow(log, index) {
    const reportDate = log?.date ?? "";
    const reportName = log?.name ?? "";
    const reportLink = log?.link ?? "";
    const reportId = log?.id ?? "";
    const reportType = log?.type ?? "";
    const type = String(reportType || "").toUpperCase();

    const badgeClass =
      {
        MONTHLY: "bg-grow-early",
        YEARLY: "bg-alternate",
        DATAEXPORT: "bg-night-sky",
      }[type] || "bg-secondary";

    const isBillingReport = reportType === "Billing";

    const fileIcon = isBillingReport ? "fa-file-csv" : "fa-file-pdf";
    const viewTitle = isBillingReport ? "Open CSV" : "View Report";

    const safeReportUrl = ReportService.getSafeReportUrl(reportLink);

    return `
      <tr>

        <td class="text-center">
          <b>${index + 1}</b>
        </td>

        <td>
          ${AppUtils.escapeHtml(reportDate)}
        </td>

        <td class="text-center">
          <span class="badge bg-light text-gc">
            <i class="fa-solid ${fileIcon} fs-5 me-1"></i>
            ${AppUtils.escapeHtml(reportName)}
          </span>
        </td>

        <td class="text-center">
          <span class="badge text-white ${badgeClass}">
            ${AppUtils.escapeHtml(reportType)}
          </span>
        </td>

        <td class="action-btn-group">
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
            >
              <i class="pe-7s-joy me-2 text-alternate"></i>
              Send to Discord
            </button>
          </div>
        </td>

      </tr>
    `;
  }

  function renderReportStatus(data) {
    $("#last-monthly-report").text(getLatestReportDate(data.logs, "Monthly"));

    $("#last-yearly-report").text(getLatestReportDate(data.logs, "Yearly"));

    $("#next-scheduled-report").text(data.nextScheduled || "-");

    updateConnectionStatus("#drive-storage-status", data.driveStorage);

    updateConnectionStatus("#discord-status", data.discord);

    updateConnectionStatus("#email-status", data.email);
  }

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

  function getLatestReportDate(logs = [], type) {
    const report = logs.find((log) => log.type === type);

    return report ? report.date : "-";
  }

  function updateConnectionStatus(
    selector,
    connected,
    successText = "Connected",
    failureText = "Not Connected",
  ) {
    $(selector)
      .text(connected ? successText : failureText)
      .toggleClass("text-success", connected)
      .toggleClass("text-danger", !connected);
  }

  return {
    loadReportsOverview,
  };
})();

export { ReportsOverview };
