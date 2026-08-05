import {
  AppUtils,
  RouterModule,
  TableModule,
  WidgetModule,
  PageModules,
} from "../modules.js";

const reportsMonthlyReportModule = (() => {
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

      setGenerateState(btn, true);

      AppUtils.showDashboardToast(
          "Analyzing Request...",
          "info"
      );

      google.script.run
      .withSuccessHandler(result => {

        if (!result.valid) {
          setGenerateState(btn, false);

          AppUtils.showDashboardToast(result.message, "warning");
          return;
        }

        checkMonthlyReportExists(month, year, btn);

      })
      .withFailureHandler(err => {
        setGenerateState(btn, false);

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

      downloadLatestPDF();

      setTimeout(() => {
        btn.prop("disabled", false);
      }, 1000);

    })

    .on("click.reportsMonthly", "#email-latest-report", function () {

      const btn = $(this);

      btn.prop("disabled", true);

      emailLatestReport(btn);

    })

    .on("click.reportsMonthly", "#send-discord-notification", function () {

      const btn = $(this);

      btn.prop("disabled", true);

      sendLatestDiscord(btn);

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

      WidgetModule.loadCustomMonthlyReportsPageData();

  };

  function setGenerateState(btn, disabled) {

      btn.prop("disabled", disabled);

      $("#monthly-report-month")
          .prop("disabled", disabled);

      $("#monthly-report-year")
          .prop("disabled", disabled);

  }

  function checkMonthlyReportReady(btn, attempts = 0) {

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

                      checkMonthlyReportReady(
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

                      WidgetModule.loadCustomMonthlyReportsPageData(() => {

                          TableModule.highlightLatestRow(
                              "monthlyReportsTable",
                              0
                          );

                      });

                      AppUtils.showDashboardToast(
                          "Monthly report generated successfully!",
                          "success"
                      );

                  })
                  .saveCustomReportPDF("monthly");

          })
          .isReportReady("monthly");

  }

  function checkMonthlyReportExists(month, year, btn) {

      google.script.run
          .withFailureHandler(err => {

              setGenerateState(btn, false);

              AppUtils.showError(err);

          })
          .withSuccessHandler(result => {

              if (!result.exists) {

                  generateMonthlyReport(month, year, btn);
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
                  <button
                    class="btn btn-secondary btn-cancel">
                    Cancel
                  </button>

                  <button
                    class="btn btn-info btn-download">
                    Download
                  </button>

                  <button
                    class="btn btn-danger btn-generate">
                    Generate New
                  </button>
                `,

                onOpen($modal) {

                  $modal
                    .off(".monthlyReportModal")

                    .on("click.monthlyReportModal", ".btn-cancel", () => {
                      AppUtils.closeModal("#app-modal");
                    })

                    .on("click.monthlyReportModal", ".btn-download", () => {
                      window.open(result.report.link, "_blank");
                      AppUtils.closeModal("#app-modal");
                    })

                    .on("click.monthlyReportModal", ".btn-generate", () => {
                      AppUtils.closeModal("#app-modal");
                      generateMonthlyReport(month, year, btn);
                    });

                },

                onClose($modal) {

                  $modal.off(".monthlyReportModal");
                  setGenerateState(btn, false);

                }

              });

          })
          .checkExistingReport("monthly", `${month} ${year}`);

  }

  function generateMonthlyReport(month, year, btn) {

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
              checkMonthlyReportReady(btn);
          })
          .updateCustomReportPDF("monthly", month, year);

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

  return { init, destroy };
})();

export { reportsMonthlyReportModule };