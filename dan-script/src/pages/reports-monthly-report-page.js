import { RouterModule } from "../routers.js";
import { AppUtils } from "../utils.js";
import { ReportHistory } from "../reports/history.js";
import { ReportActions } from "../reports/actions.js";

const reportsMonthlyReportPage = (() => {
  let bound = false;

  const init = () => {
    if (bound) {return;}
    bound = true;

    bindActions();
    loadData();
  };

  const destroy = () => {
    if (!bound) {return;}
    bound = false;

    $(document).off(".reportsMonthly");
  };

  const bindActions = () => {
    $(document)
      .off(".reportsMonthly")

      .on("click.reportsMonthly", ".btn-view-report", (e) => {
        const url = $(e.currentTarget).data("url");
        window.open(url, "_blank");
      })

      .on("click.reportsMonthly", ".btn-email-report", function () {
        const $btn = $(this);
        ReportActions.confirmAction(
          "emailReport",
          "Send Email Report?",
          "Are you sure you want to dispatch this custom report via email?",
          () => ReportActions.handleEmailReport($btn),
        );
      })

      .on("click.reportsMonthly", ".btn-discord-report", function () {
        const $btn = $(this);
        ReportActions.confirmAction(
          "discordReport",
          "Send Discord Notification?",
          "This will broadcast an active notification stream to the designated channel. Proceed?",
          () => ReportActions.handleDiscordReport($btn),
        );
      })

      .on("click.reportsMonthly", "#btn-generate-monthly-report", function () {
        const $btn = $(this);
        ReportActions.confirmAction(
          "generateMonthlyReport",
          "Generate Monthly Summary?",
          "Compiling logs requires calculations across your monthly data points. Proceed?",
          () => ReportActions.handleBtnGenerateMonthlyReport($btn),
        );
      })

      .on("click.reportsMonthly", "#generate-yearly-report", () => {
        const page = "reportsAnnualReport";
        RouterModule.go(page);
      })

      .on("click.reportsMonthly", "#download-latest-pdf", function () {
        const btn = $(this);
        const loading = AppUtils.setButtonLoading(btn[0], "Downloading...");
        ReportActions.downloadLatestPDF(btn, loading);
      })

      .on("click.reportsMonthly", "#email-latest-report", function () {
        const $btn = $(this);
        ReportActions.confirmAction(
          "emailLatestReport",
          "Email Latest Report?",
          "This will send the latest generated report to your registered email.",
          () => ReportActions.handleEmailLatestReport($btn),
        );
      })

      .on("click.reportsMonthly", "#send-discord-notification", function () {
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

      const today = new Date();

      const currentMonth = today.toLocaleString("default", {
          month: "long"
      });

      const currentYear = today.getFullYear();

      $("#monthly-report-month").val(currentMonth);

      const $year = $("#monthly-report-year");

      $year.empty();

      for (let year = 2024; year <= currentYear; year++) {
        $year.append(
          `<option value="${year}">${year}</option>`
        );
      }

      $year.val(currentYear);

      ReportHistory.loadCustomMonthlyReportsPageData();

  };

  return { init, destroy };
})();

export { reportsMonthlyReportPage };