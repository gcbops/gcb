import {
  AppUtils,
  RouterModule,
  WidgetModule,
  PageModules,
} from "../modules.js";

const reportsExportDataPageModule = (() => {
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
        RouterModule.go(page, PageModules[page] || null);
      })

      .on("click.reports", "#generate-yearly-report", () => {
        const page = "reportsAnnualReport";
        RouterModule.go(page, PageModules[page] || null);
      })

      .on("click.reports", "#download-latest-pdf", function () {

        const btn = $(this);
        btn.prop("disabled", true);

        downloadLatestPDF();

        setTimeout(() => {
          btn.prop("disabled", false);
        }, 1000);

      })

      .on("click.reports", "#email-latest-report", function () {

        const btn = $(this);

        btn.prop("disabled", true);

        emailLatestReport(btn);

      })

      .on("click.reports", "#send-discord-notification", function () {

        const btn = $(this);

        btn.prop("disabled", true);

        sendLatestDiscord(btn);

      });

  };

  const loadData = () => {
    WidgetModule.loadReportsExportsPageData();
  };

  function getLatestReport() {
    const data = AppUtils.cacheGet("reportsPageData");
    if (!data || !data.logs?.length) {
      AppUtils.showDashboardToast("No reports found.", "error");
      return null;
    }
    return data.logs[0];
  }

  function downloadLatestPDF(btn) {
    const report = getLatestReport();
    if (!report) {
        btn.prop("disabled", false);
        return;
    }
    window.open(report.link, "_blank");
  }

  function emailLatestReport(btn) {

    const report = getLatestReport();
    if (!report) {
      btn.prop("disabled", false);
      return;
    }

    AppUtils.showDashboardToast("Sending email...", "info");

    google.script.run
      .withSuccessHandler(() => {
        btn.prop("disabled", false);
        AppUtils.showDashboardToast("Latest report emailed!", "success");
      })
      .withFailureHandler(err => {
        btn.prop("disabled", false);
        AppUtils.showError(err);
        AppUtils.showDashboardToast("Failed to send email.", "error");
      })
      .sendLatestEmailReport(report);

  }

  function sendLatestDiscord(btn) {

    const report = getLatestReport();
    if (!report) {
      btn.prop("disabled", false);
      return;
    }

    AppUtils.showDashboardToast("Sending Discord notification...", "info");

    google.script.run
      .withSuccessHandler(() => {
        btn.prop("disabled", false);
        AppUtils.showDashboardToast("Discord notification sent!", "success");
      })
      .withFailureHandler(err => {
        btn.prop("disabled", false);
        AppUtils.showError(err);
        AppUtils.showDashboardToast("Failed to send Discord notification.", "error");
      })
      .sendLatestDiscordReport(report);

  }

  return { init, destroy };
})();

export { reportsExportDataPageModule };