import { AppUtils } from "../utils";
import { ReportHistory } from "./history";
import { TableModule } from "../tables/tables";

const ReportGenerator = (() => {

  const REPORT_MAX_ATTEMPTS = 30;
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

  function setGenerateState(type, disabled, loading) {
    CONFIG[type].fields.forEach((selector) => {
      $(selector).prop("disabled", disabled);
    });

    if (loading) {
      loading.restore();
    }
  }

  function handleGenerateError(type, btn, err, message = "Something went wrong!", loading) {
    setGenerateState(type, false, loading);

    if (err) {
      console.error(err);
      AppUtils.showError(err);
    }

    AppUtils.showError(message);
  }

  function prepareReportGeneration(type, btn, params, loading) {
    const cfg = CONFIG[type];
    const reportName = cfg.reportName(params);

    google.script.run
      .withFailureHandler((err) => {
        setGenerateState(type, false, loading);
        AppUtils.showError(err);
      })
      .withSuccessHandler((result) => {
        if (!result.exists) {
          loading.setText("Generating Report...");
          requestReportGeneration(cfg, type, btn, params, loading);
          return;
        }

        showExistsModal(cfg, type, btn, params, result.report, loading);
      })
      .checkExistingReport(type, reportName);
  }

  function showExistsModal(cfg, type, btn, params, report, loading) {
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
          .on(`click${ns}`, ".btn-cancel, .btn-close", () => {
            AppUtils.closeModal("#app-modal");
            console.log(loading);
            if (loading) {
              setGenerateState(type, false, loading);
            }
          })
          .on(`click${ns}`, ".btn-download", () => {
            window.open(report.link, "_blank");
            AppUtils.closeModal("#app-modal");
            if (loading) {
              setGenerateState(type, false, loading);
            }
          })
          .on(`click${ns}`, ".btn-generate", () => {
            if (loading) {
              loading.setText("Generating Annual Report...");
            }
            requestReportGeneration(cfg, type, btn, params, loading);
            AppUtils.closeModal("#app-modal");
          });
      },

      onClose($modal) {
        $modal.off(ns);
      },
    });
  }

  function requestReportGeneration(cfg, type, btn, params, loading) {
    google.script.run
      .withFailureHandler((err) => handleGenerateError(type, btn, err, loading))
      .withSuccessHandler(() => checkReportReady(cfg, type, btn, "", loading))
      .updateCustomReportPDF(type, ...cfg.updateArgs(params));
  }

  function checkReportReady(cfg, type, btn, attempts = 0, loading) {
  
    if (attempts >= REPORT_MAX_ATTEMPTS) {
      setGenerateState(type, false, loading);
      AppUtils.showError("Timed out waiting for report.");
      return;
    }

    google.script.run
      .withFailureHandler((err) => handleGenerateError(type, btn, err, loading))
      .withSuccessHandler((ready) => {
        if (!ready) {
          setTimeout(() => {
            checkReportReady(cfg, type, btn, attempts + 1, loading);
          }, REPORT_CHECK_INTERVAL);
          return;
        }

        saveReport(type, btn, cfg, loading);
      })
      .isReportReady(type);
  }

  function saveReport(type, btn, cfg, loading) {
    google.script.run
      .withFailureHandler((err) => {
        handleGenerateError(type, btn, err, loading);
      })
      .withSuccessHandler(() => {
        setGenerateState(type, false, loading);

        cfg.reloadHistory(() => {
          TableModule.highlightLatestRow(cfg.historyTableId, 0);
        });

        AppUtils.showDashboardToast(cfg.successMessage, "success");
      })
      .saveCustomReportPDF(type);
  }

  function generateMonthlyReport(month, year, btn, loading) {
    prepareReportGeneration("monthly", btn, { month, year }, loading);
  }

  function generateYearlyReport(year, btn, loading) {
    prepareReportGeneration("yearly", btn, { year }, loading);
  }

  return {
    generateMonthlyReport,
    generateYearlyReport,
    setGenerateState,
  };
})();

export { ReportGenerator };