import { AppUtils } from "../utils.js";
import { ReportHistory } from "../reports/history.js";
import { ReportActions } from "../reports/actions.js";
import { DataTableModule } from "../tables/data-table.js";

const reportsAnnualReportPage = (() => {
  let bound = false;

  const init = () => {
    if (bound) {
      return;
    }

    bound = true;

    bindActions();
    loadData();
  };

  const destroy = () => {
    if (!bound) {
      return;
    }

    bound = false;

    $(document).off(".reportsAnnual");

    DataTableModule.destroy("#annual-report-history");
  };

  const bindActions = () => {
    $(document)
      .off(".reportsAnnual")

      /*
       * Report history actions
       */
      .on("click.reportsAnnual", ".btn-view-report", (e) => {
        const url = $(e.currentTarget).data("url");

        if (url) {
          window.open(url, "_blank");
        }
      })

      .on("click.reportsAnnual", ".btn-email-report", function () {
        const $btn = $(this);

        AppUtils.confirmAction(
          "emailReport",
          "Send Email Report?",
          "Are you sure you want to send this report via email?",
          () => ReportActions.handleEmailReport($btn),
        );
      })

      .on("click.reportsAnnual", ".btn-discord-report", function () {
        const $btn = $(this);

        AppUtils.confirmAction(
          "discordReport",
          "Send Discord Notification?",
          "Are you sure you want to send this report to Discord?",
          () => ReportActions.handleDiscordReport($btn),
        );
      })

      /*
       * Generate report
       */
      .on("click.reportsAnnual", "#btn-generate-yearly-report", function (e) {
        e.preventDefault();

        const $btn = $(this);

        AppUtils.confirmAction(
          "generateYearlyReport",
          "Generate Annual Report?",
          "This will generate a PDF report for the selected year. Proceed?",
          () => ReportActions.handleBtnGenerateYearlyReport($btn),
        );
      })

      /*
       * Latest report actions
       */
      .on("click.reportsAnnual", "#download-latest-pdf", function () {
        const $btn = $(this);

        const loading = AppUtils.setButtonLoading($btn[0], "Opening...");

        ReportActions.downloadLatestPDF($btn, loading, "Yearly");
      })

      .on("click.reportsAnnual", "#email-latest-report", function () {
        const $btn = $(this);

        AppUtils.confirmAction(
          "emailLatestReport",
          "Email Latest Annual Report?",
          "This will send the latest annual report to your registered email.",
          () => {
            ReportActions.handleEmailLatestReport($btn, "Yearly");
          },
        );
      })

      .on("click.reportsAnnual", "#send-discord-notification", function () {
        const $btn = $(this);

        AppUtils.confirmAction(
          "sendDiscordNotification",
          "Send Latest Annual Report to Discord?",
          "This will send the latest annual report to the configured Discord channel.",
          () => {
            ReportActions.handleSendDiscordNotification($btn, "Yearly");
          },
        );
      })

      /*
       * Update displayed period.
       */
      .on("change.reportsAnnual", "#yearly-report-year", updatePeriodLabel);
  };

  const loadData = () => {
    populateYearSelector();
    updatePeriodLabel();

    loadReportsOverview();

    ReportHistory.loadCustomYearlyReportsPageData(handleHistoryLoaded, false);
  };

  const populateYearSelector = () => {
    const currentYear = new Date().getFullYear();

    const $year = $("#yearly-report-year");

    if (!$year.length) {
      return;
    }

    $year.empty();

    for (let year = 2024; year <= currentYear; year++) {
      $year.append(`<option value="${year}">${year}</option>`);
    }

    $year.val(currentYear);

    AppUtils.initSelect2(".generator-filters");
  };

  const loadReportsOverview = () => {
    AppUtils.cachedGScriptCall(
      "reportsOverview",
      "getReportsOverview",
      [],
      (data) => {
        updateAutomationStatus(data);
      },
      false,
      false,
    );
  };

  const updateAutomationStatus = (data) => {
    const automation = data?.counts?.automation;

    $("#annual-automation-status").text(automation ? "Active" : "Not Active");
  };

  const updatePeriodLabel = () => {
    const year = $("#yearly-report-year").val();

    if (!year) {
      $("#yearly-report-period-label").text("-");
      return;
    }

    $("#yearly-report-period-label").text(`Year ${year}`);
  };

  const handleHistoryLoaded = (logs = []) => {
    const reports = Array.isArray(logs) ? logs : [];

    updateSummary(reports);
    updateLatestReport(reports);
  };

  const updateSummary = (reports) => {
    const count = reports.length;

    $("#annual-reports-count").text(count);

    if (!count) {
      $("#annual-last-report").text("-");
      return;
    }

    const latest = reports[0];

    $("#annual-last-report").text(latest?.name || latest?.date || "-");
  };

  const updateLatestReport = (reports) => {
    if (!Array.isArray(reports) || !reports.length) {
      $("#annual-latest-report-name").text("No report available");

      $("#annual-latest-report-date").text("-");

      return;
    }

    const latest = reports[0];

    $("#annual-latest-report-name").text(latest?.name || "Annual Report");

    $("#annual-latest-report-date").text(latest?.date || "-");
  };

  return {
    init,
    destroy,
  };
})();

export { reportsAnnualReportPage };