import {
  AppUtils,
  RouterModule,
  TableModule,
  WidgetModule,
  PageModules,
} from "../modules.js";

const reportsAnnualReportModule = (() => {

    let bound = false;

    const REPORT_MAX_ATTEMPTS = 60;
    const REPORT_CHECK_INTERVAL = 5000;

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

              setGenerateState(btn, true);

              AppUtils.showDashboardToast(
                  "Analyzing Request...",
                  "info"
              );

              google.script.run
                  .withSuccessHandler(result => {

                      if (!result.valid) {

                          setGenerateState(btn, false);

                          AppUtils.showDashboardToast(
                              result.message,
                              "warning"
                          );

                          return;

                      }

                      checkAnnualReportExists(year, btn);

                  })
                  .withFailureHandler(err => {

                      setGenerateState(btn, false);

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
            RouterModule.go(page, PageModules[page] || null);
          })

          .on("click.reportsAnnual", "#download-latest-pdf", function () {

            const btn = $(this);
            btn.prop("disabled", true);

            downloadLatestPDF();

            setTimeout(() => {
              btn.prop("disabled", false);
            }, 1000);

          })

          .on("click.reportsAnnual", "#email-latest-report", function () {

            const btn = $(this);

            btn.prop("disabled", true);

            emailLatestReport(btn);

          })

          .on("click.reportsAnnual", "#send-discord-notification", function () {

            const btn = $(this);

            btn.prop("disabled", true);

            sendLatestDiscord(btn);

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

        WidgetModule.loadCustomYearlyReportsPageData();

    };

    function setGenerateState(btn, disabled) {

        btn.prop("disabled", disabled);

        $("#yearly-report-year")
            .prop("disabled", disabled);

    }

    function checkAnnualReportExists(year, btn) {

        google.script.run
            .withFailureHandler(err => {

                setGenerateState(btn, false);

                AppUtils.showError(err);

            })
            .withSuccessHandler(result => {

                if (!result.exists) {

                    generateAnnualReport(year, btn);
                    return;

                }

                AppUtils.openModal("#app-modal", {

                    placement: "center",

                    header: "<div></div>",

                    body: `
                        <h5 class="modal-title">
                          <strong>
                            Report Already Exists
                          </strong>
                        </h5>
                        <p>
                            A report for
                            <strong>${result.report.name}</strong>
                            already exists.
                        </p>
                    `,

                    footer: `
                        <button class="btn btn-secondary btn-lg btn-cancel">
                            Cancel
                        </button>

                        <button class="btn btn-info btn-lg btn-download">
                            Download
                        </button>

                        <button class="btn btn-danger btn-lg btn-generate">
                            Generate New
                        </button>
                    `,

                    onOpen($modal) {

                        $modal
                            .off(".annualReportModal")

                            .on(
                                "click.annualReportModal",
                                ".btn-cancel",
                                () => {

                                    AppUtils.closeModal("#app-modal");

                                }
                            )

                            .on(
                                "click.annualReportModal",
                                ".btn-download",
                                () => {

                                    window.open(
                                        result.report.link,
                                        "_blank"
                                    );

                                    AppUtils.closeModal("#app-modal");

                                }
                            )

                            .on(
                                "click.annualReportModal",
                                ".btn-generate",
                                () => {

                                    AppUtils.closeModal("#app-modal");

                                    generateAnnualReport(
                                        year,
                                        btn
                                    );

                                }
                            );

                    },

                    onClose($modal) {

                        $modal.off(".annualReportModal");

                        setGenerateState(btn, false);

                    }

                });

            })
            .checkExistingReport("yearly", `${year} Performance`);

    }

    function generateAnnualReport(year, btn) {

        google.script.run
            .withFailureHandler(err => {

                setGenerateState(btn, false);

                console.error(err);

                AppUtils.showDashboardToast(
                    "Something went wrong!",
                    "error"
                );

            })
            .withSuccessHandler(() => {

                checkAnnualReportReady(btn);

            })
            .updateCustomReportPDF("yearly", null, year);

    }

    function checkAnnualReportReady(btn, attempts = 0) {

      AppUtils.showDashboardToast(
          "Preparing report...",
          "info"
      );

        if (attempts >= REPORT_MAX_ATTEMPTS) {

            setGenerateState(btn, false);

            AppUtils.showDashboardToast(
                "Timed out waiting for report.",
                "error"
            );

            return;

        }

        google.script.run
            .withFailureHandler(err => {

                setGenerateState(btn, false);

                console.error(err);

                AppUtils.showDashboardToast(
                    "Something went wrong!",
                    "error"
                );

            })
            .withSuccessHandler(ready => {

                if (!ready) {

                    setTimeout(() => {

                        checkAnnualReportReady(
                            btn,
                            attempts + 1
                        );

                    }, REPORT_CHECK_INTERVAL);

                    return;

                }

                google.script.run
                    .withFailureHandler(err => {

                        setGenerateState(btn, false);

                        console.error(err);

                        AppUtils.showDashboardToast(
                            "Something went wrong!",
                            "error"
                        );

                    })
                    .withSuccessHandler(() => {

                        setGenerateState(btn, false);

                        WidgetModule.loadCustomYearlyReportsPageData(() => {

                            TableModule.highlightLatestRow(
                                "yearlyReportsTable",
                                0
                            );

                        });

                        AppUtils.showDashboardToast(
                            "Annual report generated successfully!",
                            "success"
                        );

                    })
                    .saveCustomReportPDF("yearly");

            })
            .isReportReady("yearly");

    }

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

    return {
        init,
        destroy
    };

})();

export { reportsAnnualReportModule };