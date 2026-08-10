import { RouterModule } from "../routers.js";
import { AppUtils } from "../utils.js";
import { PageModules } from "../page-modules.js";
import { ReportHistory } from "../reports/history.js";
import { ReportActions } from "../reports/actions.js";
import { ReportGenerator } from "../reports/generator.js";

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

    .on("click.reportsMonthly", ".btn-discord-report", function () {

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

    .on("click.reportsMonthly", "#btn-generate-monthly-report", function () {

      const btn = $(this);
      const month = $("#monthly-report-month").val();
      const year = $("#monthly-report-year").val();
      const type = "monthly";

      ReportGenerator.setGenerateState(type, btn, true);

      AppUtils.showDashboardToast(
          "Analyzing Request...",
          "info"
      );

      google.script.run
      .withSuccessHandler(result => {

        if (!result.valid) {
          ReportGenerator.setGenerateState(type, btn, false);

          AppUtils.showDashboardToast(result.message, "warning");
          return;
        }

        ReportGenerator.generateMonthlyReport(month, year, btn);

      })
      .withFailureHandler(err => {
        ReportGenerator.setGenerateState(type, btn, false);

        console.error(err);

        AppUtils.showDashboardToast(
            err.message || "Something went wrong.",
            "error"
        );
      })
      .validateCustomMonthlyReport(month, year);

    })

    .on("click.reportsMonthly", "#generate-yearly-report", () => {
      const page = "reportsAnnualReport";
      RouterModule.go(page, PageModules[page] || null);
    })

    .on("click.reportsMonthly", "#download-latest-pdf", function () {

      const btn = $(this);
      btn.prop("disabled", true);

      ReportActions.downloadLatestPDF(btn);

      setTimeout(() => {
        btn.prop("disabled", false);
      }, 1000);

    })

    .on("click.reportsMonthly", "#email-latest-report", function () {

      const btn = $(this);

      btn.prop("disabled", true);

      ReportActions.emailLatestReport(btn);

    })

    .on("click.reportsMonthly", "#send-discord-notification", function () {

      const btn = $(this);

      btn.prop("disabled", true);

      ReportActions.sendLatestReportToDiscord(btn);

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