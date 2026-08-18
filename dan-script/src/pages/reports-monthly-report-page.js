import { RouterModule } from "../routers.js";
import { AppUtils } from "../utils.js";
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

        google.script.run
            .withSuccessHandler(() => {
                AppUtils.showDashboardToast(
                    "Email sent successfully!",
                    "success"
                );
            })
            .withFailureHandler(err => {
                AppUtils.showError(err);
            })
            .sendRequestedEmailReport(
                btn.data("id")
            );

    })

    .on("click.reportsMonthly", ".btn-discord-report", function () {

        const btn = $(this);

        google.script.run
            .withSuccessHandler(() => {
                AppUtils.showDashboardToast(
                    "Discord notification sent!",
                    "success"
                );
            })
            .withFailureHandler(err => {
                AppUtils.showError(err);
            })
            .sendRequestedDiscordReport(
                btn.data("id")
            );
    })

    .on("click.reportsMonthly", "#btn-generate-monthly-report", function () {

      const btn = $(this);
      const selectMonth = $("#monthly-report-month");
      const selectYear = $("#monthly-report-year");
      const month = selectMonth.val();
      const year = selectYear.val();
      const type = "monthly";
      selectMonth.prop("disabled", true);
      selectYear.prop("disabled", true);

      const loading = AppUtils.setButtonLoading(
        btn[0],
        "Analyzing Report Request...",
      );

      google.script.run
      .withSuccessHandler(result => {

        if (!result.valid) {
          ReportGenerator.setGenerateState(type, false, loading);

          AppUtils.showDashboardToast(result.message, "warning");
          return;
        }

        ReportGenerator.generateMonthlyReport(month, year, btn, loading);

      })
      .withFailureHandler(err => {
        ReportGenerator.setGenerateState(type, false, loading);

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
      RouterModule.go(page);
    })

    .on("click.reportsMonthly", "#download-latest-pdf", function () {

      const btn = $(this);
      const loading = AppUtils.setButtonLoading(btn[0], "Downloading...");

      ReportActions.downloadLatestPDF(btn, loading);

    })

    .on("click.reportsMonthly", "#email-latest-report", function () {

      const btn = $(this);
      const loading = AppUtils.setButtonLoading(btn[0], "Sending email...");

      ReportActions.emailLatestReport(btn, loading);

    })

    .on("click.reportsMonthly", "#send-discord-notification", function () {

      const btn = $(this);
      const loading = AppUtils.setButtonLoading(btn[0], "Sending Discord...");

      ReportActions.sendLatestReportToDiscord(btn, loading);

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