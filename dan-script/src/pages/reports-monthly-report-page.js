import { AppUtils } from "../utils.js";
import { ReportHistory } from "../reports/history.js";
import { ReportActions } from "../reports/actions.js";
import { DataTableModule } from "../tables/data-table.js";

const reportsMonthlyReportPage = (() => {
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

    $(document).off(".reportsMonthly");

    DataTableModule.destroy("#monthly-report-history");
  };

  const bindActions = () => {
    $(document)
      .off(".reportsMonthly")

      /*
       * Report history actions
       */
      .on("click.reportsMonthly", ".btn-view-report", (e) => {
        const url = $(e.currentTarget).data("url");

        if (url) {
          window.open(url, "_blank");
        }
      })

      .on("click.reportsMonthly", ".btn-email-report", function () {
        const $btn = $(this);

        AppUtils.confirmAction(
          "emailReport",
          "Send Email Report?",
          "Are you sure you want to send this report via email?",
          () => ReportActions.handleEmailReport($btn),
        );
      })

      .on("click.reportsMonthly", ".btn-discord-report", function () {
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
      .on("click.reportsMonthly", "#btn-generate-monthly-report", function (e) {
        e.preventDefault();

        const $btn = $(this);

        AppUtils.confirmAction(
          "generateMonthlyReport",
          "Generate Monthly Report?",
          "This will generate a PDF report for the selected month and year. Proceed?",
          () => ReportActions.handleBtnGenerateMonthlyReport($btn),
        );
      })

      /*
       * Latest report actions
       */
      .on("click.reportsMonthly", "#download-latest-pdf", function () {
        const $btn = $(this);

        const loading = AppUtils.setButtonLoading($btn[0], "Opening...");

        ReportActions.downloadLatestPDF($btn, loading, "Monthly");
      })

      .on("click.reportsMonthly", "#email-latest-report", function () {
        const $btn = $(this);

        AppUtils.confirmAction(
          "emailLatestReport",
          "Email Latest Monthly Report?",
          "This will send the latest monthly report to your registered email.",
          () => {
            ReportActions.handleEmailLatestReport($btn, "Monthly");
          },
        );
      })

      .on("click.reportsMonthly", "#send-discord-notification", function () {
        const $btn = $(this);

        AppUtils.confirmAction(
          "sendDiscordNotification",
          "Send Latest Monthly Report to Discord?",
          "This will send the latest monthly report to the configured Discord channel.",
          () => {
            ReportActions.handleSendDiscordNotification($btn, "Monthly");
          },
        );
      })

      /*
       * Update displayed period.
       */
      .on(
        "change.reportsMonthly",
        "#monthly-report-month, #monthly-report-year",
        updatePeriodLabel,
      );
  };

  const loadData = () => {
    populateYearSelector();
    updatePeriodLabel();

    loadReportsOverview();

    ReportHistory.loadCustomMonthlyReportsPageData(handleHistoryLoaded, false);
  };

  const populateYearSelector = () => {
    const currentYear = new Date().getFullYear();

    const $year = $("#monthly-report-year");

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

    $("#monthly-automation-status").text(automation ? "Active" : "Not Active");
  };

  const updatePeriodLabel = () => {
    const month = $("#monthly-report-month").val();
    const year = $("#monthly-report-year").val();

    if (!month || !year) {
      $("#monthly-report-period-label").text("-");
      return;
    }

    $("#monthly-report-period-label").text(`${month} ${year}`);
  };

  const handleHistoryLoaded = (logs = []) => {
    const reports = Array.isArray(logs) ? logs : [];

    updateSummary(reports);
    updateLatestReport(reports);
  };

  const updateSummary = (reports) => {
    const count = reports.length;

    $("#monthly-reports-count").text(count);

    if (!count) {
      $("#monthly-last-report").text("-");
      return;
    }

    const latest = reports[0];

    $("#monthly-last-report").text(latest?.name || latest?.date || "-");
  };

  const updateLatestReport = (reports) => {
    if (!Array.isArray(reports) || !reports.length) {
      $("#monthly-latest-report-name").text("No report available");

      $("#monthly-latest-report-date").text("-");

      return;
    }

    const latest = reports[0];

    $("#monthly-latest-report-name").text(latest?.name || "Monthly Report");

    $("#monthly-latest-report-date").text(latest?.date || "-");
  };

  return {
    init,
    destroy,
  };
})();

export { reportsMonthlyReportPage };