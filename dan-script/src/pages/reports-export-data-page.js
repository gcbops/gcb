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

          const btn = $(this);

          btn.prop("disabled", true);

          google.script.run

              .withSuccessHandler(() => {

                  btn.prop("disabled", false);

                  AppUtils.showDashboardToast(
                      "Email sent successfully!",
                      "success"
                  );

              })

              .withFailureHandler(err => {

                  btn.prop("disabled", false);

                  AppUtils.showError(err);

              })

              .sendRequestedEmailReport(
                  btn.data("id")
              );

      })

      .on("click.reports", ".btn-discord-report", function () {

          const btn = $(this);

          btn.prop("disabled", true);

          google.script.run

              .withSuccessHandler(() => {

                  btn.prop("disabled", false);

                  AppUtils.showDashboardToast(
                      "Discord notification sent!",
                      "success"
                  );

              })

              .withFailureHandler(err => {

                  btn.prop("disabled", false);

                  AppUtils.showError(err);

              })

              .sendRequestedDiscordReport(
                  btn.data("id")
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
        btn.prop("disabled", true);

        ReportActions.downloadLatestPDF(btn);

        setTimeout(() => {
          btn.prop("disabled", false);
        }, 1000);

      })

      .on("click.reports", "#email-latest-report", function () {

        const btn = $(this);

        btn.prop("disabled", true);

        ReportActions.emailLatestReport(btn);

      })

      .on("click.reports", "#send-discord-notification", function () {

        const btn = $(this);

        btn.prop("disabled", true);

        ReportActions.sendLatestReportToDiscord(btn);

      });

  };

  const loadData = () => {
    ReportsOverview.loadReportsOverview();
  };

  return { init, destroy };
})();

export { reportsExportDataPage };