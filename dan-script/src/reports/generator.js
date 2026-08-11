import { AppUtils } from "../utils";
import { ReportHistory } from "./history";
import { TableModule } from "../tables/tables";

const ReportGenerator = (() => {

  const REPORT_MAX_ATTEMPTS = 60;
  const REPORT_CHECK_INTERVAL = 5000;

  const CONFIG = {
    yearly: {
      fields: ["#yearly-report-year"],
      reportName: ({ year }) => `${year} Performance`,
      updateArgs: ({ year }) => [null, year],
      historyTableId: "yearly-report-history",
      successMessage: "Annual report generated successfully!",
      reloadHistory: (callback) =>
        ReportHistory.loadCustomYearlyReportsPageData(callback, true),
    },

    monthly: {
      fields: ["#monthly-report-month", "#monthly-report-year"],
      reportName: ({ month, year }) => `${month} ${year}`,
      updateArgs: ({ month, year }) => [month, year],
      historyTableId: "monthly-report-history",
      successMessage: "Monthly report generated successfully!",
      reloadHistory: (callback) =>
        ReportHistory.loadCustomMonthlyReportsPageData(callback, true),
    },
  };

  function setGenerateState(type, btn, disabled) {
    btn.prop("disabled", disabled);

    CONFIG[type].fields.forEach((selector) => {
      $(selector).prop("disabled", disabled);
    });
  }

  function handleGenerateError(type, btn, err, message = "Something went wrong!") {
    setGenerateState(type, btn, false);

    if (err) {
      console.error(err);
      AppUtils.showError(err);
    }

    AppUtils.showError(message);
  }

  function prepareReportGeneration(type, btn, params) {
    const cfg = CONFIG[type];
    const reportName = cfg.reportName(params);

    google.script.run
      .withFailureHandler((err) => {
        setGenerateState(type, btn, false);
        AppUtils.showError(err);
      })
      .withSuccessHandler((result) => {
        if (!result.exists) {
          requestReportGeneration(cfg, type, btn, params);
          return;
        }

        showExistsModal(cfg, type, btn, params, result.report);
      })
      .checkExistingReport(type, reportName);
  }

  function showExistsModal(cfg, type, btn, params, report) {
    const ns = `.${type}ReportModal`;

    AppUtils.openModal("#app-modal", {
      placement: "center",

      header: "<div></div>",

      body: `
                <h5 class="modal-title">
                    <strong>Report Already Exists</strong>
                </h5>
                <p>
                    A report for <strong>${report.name}</strong> already exists.
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
          .off(ns)
          .on(`click${ns}`, ".btn-cancel", () => {
            AppUtils.closeModal("#app-modal");
          })
          .on(`click${ns}`, ".btn-download", () => {
            window.open(report.link, "_blank");
            AppUtils.closeModal("#app-modal");
          })
          .on(`click${ns}`, ".btn-generate", () => {
            AppUtils.closeModal("#app-modal");
            requestReportGeneration(cfg, type, btn, params);
            setGenerateState(type, btn, true);
          });
      },

      onClose($modal) {
        $modal.off(ns);
        setGenerateState(type, btn, false);
      },
    });
  }

  function requestReportGeneration(cfg, type, btn, params) {
    google.script.run
      .withFailureHandler((err) => handleGenerateError(type, btn, err))
      .withSuccessHandler(() => checkReportReady(cfg, type, btn))
      .updateCustomReportPDF(type, ...cfg.updateArgs(params));
  }

  function checkReportReady(cfg, type, btn, attempts = 0) {
    if (attempts === 0) {
      AppUtils.showDashboardToast("Preparing report...", "info");
    }

    if (attempts >= REPORT_MAX_ATTEMPTS) {
      setGenerateState(type, btn, false);

      AppUtils.showError("Timed out waiting for report.");

      return;
    }

    google.script.run
      .withFailureHandler((err) => handleGenerateError(type, btn, err))
      .withSuccessHandler((ready) => {
        if (!ready) {
          setTimeout(() => {
            checkReportReady(cfg, type, btn, attempts + 1);
          }, REPORT_CHECK_INTERVAL);

          return;
        }

        saveReport(type, btn, cfg);
      })
      .isReportReady(type);
  }

  function saveReport(type, btn, cfg) {
    google.script.run
      .withFailureHandler((err) => {
        handleGenerateError(type, btn, err);
      })
      .withSuccessHandler(() => {
        setGenerateState(type, btn, false);

        cfg.reloadHistory(() => {
          TableModule.highlightLatestRow(cfg.historyTableId, 0);
        });

        AppUtils.showDashboardToast(cfg.successMessage, "success");
      })
      .saveCustomReportPDF(type);
  }

  function generateMonthlyReport(month, year, btn) {
    prepareReportGeneration("monthly", btn, { month, year });
  }

  function generateYearlyReport(year, btn) {
    prepareReportGeneration("yearly", btn, { year });
  }

  return {
    generateMonthlyReport,
    generateYearlyReport,
    setGenerateState,
  };
})();

export { ReportGenerator };