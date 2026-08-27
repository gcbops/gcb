import { RouterModule } from "../routers.js";
import { AppUtils } from "../utils.js";
import { ReportHistory } from "../reports/history.js";
import { ReportActions } from "../reports/actions.js";

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
  };

  const bindActions = () => {
    $(document)
      .off(".reportsAnnual")

      .on("click.reportsAnnual", ".btn-view-report", (e) => {
        const url = $(e.currentTarget).data("url");
        window.open(url, "_blank");
      })

      .on("click.reportsAnnual", ".btn-email-report", function () {
        const $btn = $(this);
        ReportActions.confirmAction(
          "emailReport",
          "Send Email Report?",
          "Are you sure you want to dispatch this custom report via email?",
          () => ReportActions.handleEmailReport($btn),
        );
      })

      .on("click.reportsAnnual", ".btn-discord-report", function () {
        const $btn = $(this);
        ReportActions.confirmAction(
          "discordReport",
          "Send Discord Notification?",
          "This will broadcast an active notification stream to the designated channel. Proceed?",
          () => ReportActions.handleDiscordReport($btn),
        );
      })

      .on("click.reportsAnnual", "#generate-monthly-report", () => {
        const page = "reportsMonthlyReport";
        RouterModule.go(page);
      })

      .on("click.reportsAnnual", "#btn-generate-yearly-report", function () {
        const $btn = $(this);
        ReportActions.confirmAction(
          "generateYearlyReport",
          "Generate Yearly Summary?",
          "Compiling analytics logs requires data calculations across historical points. Proceed?",
          () => ReportActions.handleBtnGenerateYearlyReport($btn),
        );
      })

      .on("click.reportsAnnual", "#download-latest-pdf", function () {
        const btn = $(this);
        const loading = AppUtils.setButtonLoading(btn[0], "Downloading...");
        ReportActions.downloadLatestPDF(btn, loading);
      })

      .on("click.reportsAnnual", "#email-latest-report", function () {
        const $btn = $(this);
        ReportActions.confirmAction(
          "emailLatestReport",
          "Email Latest Report?",
          "This will send the latest generated report to your registered email.",
          () => ReportActions.handleEmailLatestReport($btn),
        );
      })

      .on("click.reportsAnnual", "#send-discord-notification", function () {
        const $btn = $(this);
        ReportActions.confirmAction(
          "sendDiscordNotification",
          "Send Latest Alert to Discord?",
          "This will send the latest generated report directly to the private Discord channel.",
          () => ReportActions.handleSendDiscordNotification($btn),
        );
      });
  };

  const loadData = () => {
    const currentYear = new Date().getFullYear();

    const $year = $("#yearly-report-year");

    $year.empty();

    for (let year = 2024; year <= currentYear; year++) {
      $year.append(`<option value="${year}">${year}</option>`);
    }

    $year.val(currentYear);

    ReportHistory.loadCustomYearlyReportsPageData();
  };

  return {
    init,
    destroy,
  };
})();

export { reportsAnnualReportPage };