import { AppUtils } from "../utils";
import { DataTableModule } from "../tables/data-table";
import { TableFilterService } from "../tables/table-filter-service";

const ReportsOverview = (() => {
  const TABLE_ID = "#reports-export-table";
  const TABLE_TITLE = "Reports Overview";

  function loadReportsOverview() {
    DataTableModule.showLoader(TABLE_ID);

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

    if (!Array.isArray(logs) || !logs.length) {
      DataTableModule.showEmpty(TABLE_ID, "No reports generated yet.");

      return;
    }

    DataTableModule.destroy(TABLE_ID);

    $tbody.empty();

    logs.forEach((log, index) => {
      $tbody.append(createReportLogRow(log, index));
    });

    DataTableModule.init(TABLE_TITLE, TABLE_ID);

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
    const type = String(log.type || "").toUpperCase();

    const badgeClass =
      {
        MONTHLY: "bg-grow-early",
        YEARLY: "bg-alternate",
        DATAEXPORT: "bg-night-sky",
      }[type] || "bg-secondary";

    return `
      <tr>

        <td class="text-center">
          <b>${index + 1}</b>
        </td>

        <td>
          ${AppUtils.escapeHtml(log.date ?? "")}
        </td>

        <td class="text-center">
          <span class="badge bg-light text-info">
            <i class="fa-solid fa-file-pdf"></i>
            ${AppUtils.escapeHtml(log.name ?? "")}
          </span>
        </td>

        <td class="text-center">
          <span class="badge text-white ${badgeClass}">
            ${AppUtils.escapeHtml(log.type ?? "")}
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
              data-url="${AppUtils.escapeHtml(log.link ?? "")}"
            >
              <i class="pe-7s-display2 me-2 text-info"></i>
              View Report
            </button>

            <button
              type="button"
              tabindex="0"
              role="menuitem"
              class="dropdown-item btn-report-action btn-email-report"
              data-id="${AppUtils.escapeHtml(log.id ?? "")}"
            >
              <i class="pe-7s-mail me-2 text-success"></i>
              Send Email
            </button>

            <button
              type="button"
              tabindex="0"
              role="menuitem"
              class="dropdown-item btn-report-action btn-discord-report"
              data-id="${AppUtils.escapeHtml(log.id ?? "")}"
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
