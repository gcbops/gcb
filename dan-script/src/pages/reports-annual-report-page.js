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

          .on("click.reportsAnnual", ".btn-discord-report", function () {
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

          .on("click.reportsAnnual", "#btn-generate-yearly-report", function () {

              const btn = $(this);
              const selectYear = $("#yearly-report-year");
              const type = "yearly";
              const year = selectYear.val();
              selectYear.prop("disabled", true);

              const loading = AppUtils.setButtonLoading(
                btn[0],
                "Analyzing Report Request...",
              );

              google.script.run
                  .withSuccessHandler(result => {

                      if (!result.valid) {

                          ReportGenerator.setGenerateState(type, false, loading);

                          AppUtils.showDashboardToast(
                              result.message,
                              "warning"
                          );

                          return;

                      }

                      ReportGenerator.generateYearlyReport(year, btn, loading);

                  })
                  .withFailureHandler(err => {

                      ReportGenerator.setGenerateState(type, false, loading);

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
            const loading = AppUtils.setButtonLoading(btn[0], "Downloading...");

            ReportActions.downloadLatestPDF(btn, loading);

          })

          .on("click.reportsAnnual", "#email-latest-report", function () {

            const btn = $(this);
            const loading = AppUtils.setButtonLoading(
              btn[0],
              "Sending email...",
            );

            ReportActions.emailLatestReport(btn, loading);

          })

          .on("click.reportsAnnual", "#send-discord-notification", function () {

            const btn = $(this);
            const loading = AppUtils.setButtonLoading(
              btn[0],
              "Sending Discord...",
            );

            ReportActions.sendLatestReportToDiscord(btn, loading);

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