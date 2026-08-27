import { RouterModule } from "../routers.js";
import { AppUtils } from "../utils.js";
import { ReportsOverview } from "../reports/overview.js";
import { ReportActions } from "../reports/actions.js";

const reportsExportDataPage = (() => {
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

    $(document).off(".reports");
  };

  const bindActions = () => {
    $(document)
      .off(".reports")

      .on("click.reports", ".btn-view-report", (e) => {
        const url = $(e.currentTarget).data("url");
        window.open(url, "_blank");
      })

      .on("click.reports", ".btn-email-report", function () {
        const $btn = $(this);
        ReportActions.confirmAction(
          "emailReport",
          "Send Email Report?",
          "Are you sure you want to dispatch this custom report via email?",
          () => ReportActions.handleEmailReport($btn),
        );
      })

      .on("click.reports", ".btn-discord-report", function () {
        const $btn = $(this);
        ReportActions.confirmAction(
          "discordReport",
          "Send Discord Notification?",
          "This will broadcast an active notification stream to the designated channel. Proceed?",
          () => ReportActions.handleDiscordReport($btn),
        );
      })

      .on("click.reports", "#generate-monthly-report", () => {
        const page = "reportsMonthlyReport";
        RouterModule.go(page);
      })

      .on("click.reports", "#generate-yearly-report", () => {
        const page = "reportsAnnualReport";
        RouterModule.go(page);
      })

      .on("click.reports", "#download-latest-pdf", function () {
        const btn = $(this);
        const loading = AppUtils.setButtonLoading(btn[0], "Downloading...");
        ReportActions.downloadLatestPDF(btn, loading);
      })

      .on("click.reports", "#email-latest-report", function () {
        const $btn = $(this);
        ReportActions.confirmAction(
          "emailLatestReport",
          "Email Latest Report?",
          "This will send the latest generated report to your registered email.",
          () => ReportActions.handleEmailLatestReport($btn),
        );
      })

      .on("click.reports", "#send-discord-notification", function () {
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
    ReportsOverview.loadReportsOverview();
  };

  return { init, destroy };
})();

export { reportsExportDataPage };