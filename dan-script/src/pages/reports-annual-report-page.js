import { RouterModule } from "../routers.js";
import { AppUtils } from "../utils.js";
import { ReportHistory } from "../reports/history.js";
import { ReportActions } from "../reports/actions.js";
import { ReportGenerator } from "../reports/generator.js";

const reportsAnnualReportPage = (() => {

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

          .on("click.reportsAnnual", ".btn-discord-report", function () {

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

          .on("click.reportsAnnual", "#btn-generate-yearly-report", function () {

              const btn = $(this);
              const year = $("#yearly-report-year").val();
              const type = "yearly";

              ReportGenerator.setGenerateState(type, btn, true);

              AppUtils.showDashboardToast(
                  "Analyzing Request...",
                  "info"
              );

              google.script.run
                  .withSuccessHandler(result => {

                      if (!result.valid) {

                          ReportGenerator.setGenerateState(type, btn, false);

                          AppUtils.showDashboardToast(
                              result.message,
                              "warning"
                          );

                          return;

                      }

                      ReportGenerator.generateYearlyReport(year, btn);

                  })
                  .withFailureHandler(err => {

                      ReportGenerator.setGenerateState(type, btn, false);

                      console.error(err);

                      AppUtils.showDashboardToast(
                          err.message || "Something went wrong.",
                          "error"
                      );

                  })
                  .validateCustomYearlyReport(year);

          })

          .on("click.reportsAnnual", "#generate-yearly-report", () => {
            const page = "reportsAnnualReport";
            RouterModule.go(page);
          })

          .on("click.reportsAnnual", "#download-latest-pdf", function () {

            const btn = $(this);
            btn.prop("disabled", true);

            ReportActions.downloadLatestPDF(btn);

            setTimeout(() => {
              btn.prop("disabled", false);
            }, 1000);

          })

          .on("click.reportsAnnual", "#email-latest-report", function () {

            const btn = $(this);

            btn.prop("disabled", true);

            ReportActions.emailLatestReport(btn);

          })

          .on("click.reportsAnnual", "#send-discord-notification", function () {

            const btn = $(this);

            btn.prop("disabled", true);

            ReportActions.sendLatestReportToDiscord(btn);

          });

    };

    const loadData = () => {

        const currentYear = new Date().getFullYear();

        const $year = $("#yearly-report-year");

        $year.empty();

        for (let year = 2024; year <= currentYear; year++) {

            $year.append(
                `<option value="${year}">${year}</option>`
            );

        }

        $year.val(currentYear);

        ReportHistory.loadCustomYearlyReportsPageData();

    };

    return {
        init,
        destroy
    };

})();

export { reportsAnnualReportPage };