import { AppUtils } from "../utils/utils.js";
import { ReportHistory } from "./history";
import { TableModule } from "../tables/tables";
import { reportsMonthlyReportPage } from "../pages/reports-monthly-report-page";
import { reportsAnnualReportPage } from "../pages/reports-annual-report-page";
import {
  getAuthArgs,
  handleInvalidSessionError,
} from "../auth/auth-error-handler.js";

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

  function handleGenerateError(type, err, message = "Something went wrong!", loading) {
    setGenerateState(type, false, loading);

    if (err) {
      console.error(err);
      AppUtils.showError(err);
    }

    AppUtils.showError(message);
  }

  async function prepareReportGeneration(type, btn, params, loading) {
    const cfg = CONFIG[type];
    const reportName = cfg.reportName(params);

    try {
      const [sessionId, signature] = await getAuthArgs();
      AppUtils.gScriptRun({
        gscriptFunc: "checkExistingReport",
        args: [sessionId, signature, type, reportName],

        onError: (err) => {
          setGenerateState(type, false, loading);
          AppUtils.showError(err);
        },

        onSuccess: async (result) => {
          if (!result.exists) {
            loading.setText("Generating Report");
            requestReportGeneration(cfg, type, btn, params, loading);
            return;
          }

          const choice = await confirmExistingReport(result.report);

          if (choice?.cancelled || choice?.downloaded) {
            setGenerateState(type, false, loading);
            return;
          }

          if (choice?.regenerate) {
            loading.setText("Generating Report");
            requestReportGeneration(cfg, type, btn, params, loading);
          }
        },
      });
    } catch (error) {
      setGenerateState(type, false, loading);

      if (handleInvalidSessionError(error)) {
        return;
      }

      AppUtils.showError(error?.message || "Unable to generate report.");
    }
  }

  async function requestReportGeneration(cfg, type, btn, params, loading) {
    try {
      const [sessionId, signature] = await getAuthArgs();
      AppUtils.gScriptRun({
        gscriptFunc: "updateCustomReportPDF",
        args: [sessionId, signature, type, ...cfg.updateArgs(params)],

        onError: (err) =>
          handleGenerateError(
            type,
            err,
            err?.message || "Unable to request report.",
            loading,
          ),

        onSuccess: () => checkReportReady(cfg, type, btn, "", loading),
      });
    } catch (error) {
      if (handleInvalidSessionError(error)) {
        return;
      }

      handleGenerateError(
        type,
        error,
        error?.message || "Unable to request report.",
        loading,
      );
    }
  }

  function checkReportReady(cfg, type, btn, attempts = 0, loading) {
    if (attempts >= REPORT_MAX_ATTEMPTS) {
      setGenerateState(type, false, loading);

      AppUtils.showError("Timed out waiting for report.");
      return;
    }

    AppUtils.gScriptRun({
      gscriptFunc: "isReportReady",
      args: [type],

      onError: (err) =>
        handleGenerateError(
          type,
          err,
          err?.message || "Report not ready.",
          loading,
        ),

      onSuccess: (ready) => {
        if (!ready) {
          setTimeout(() => {
            checkReportReady(cfg, type, btn, attempts + 1, loading);
          }, REPORT_CHECK_INTERVAL);

          return;
        }

        saveReport(type, btn, cfg, loading);
      },
    });
  }

  async function saveReport(type, btn, cfg, loading) {
    try {
      const [sessionId, signature] = await getAuthArgs();
      AppUtils.gScriptRun({
        gscriptFunc: "saveCustomReportPDF",
        args: [sessionId, signature, type],

        onError: (err) => {
          handleGenerateError(
            type,
            err,
            err?.message || "Unable to save the report.",
            loading,
          );
        },

        onSuccess: () => {
          loading.setSuccess("Generated successfully");

          setGenerateState(type, false);

          if (type === "monthly") {
            reportsMonthlyReportPage.refresh();
          }

          if (type === "yearly") {
            reportsAnnualReportPage.refresh();
          }

          cfg.reloadHistory(() => {
            TableModule.highlightLatestRow(cfg.historyTableId, 0);
          });

          AppUtils.showDashboardToast(cfg.successMessage, "success");
        },
      });
    } catch (error) {
      if (handleInvalidSessionError(error)) {
        return;
      }

      handleGenerateError(
        type,
        error,
        error?.message || "Unable to save the report.",
        loading,
      );
    }
  }

  function generateMonthlyReport(month, year, btn, loading) {
    prepareReportGeneration("monthly", btn, { month, year }, loading);
  }

  function generateYearlyReport(year, btn, loading) {
    prepareReportGeneration("yearly", btn, { year }, loading);
  }

  
  function callGScriptAsync(gscriptFunc, args) {
    return new Promise((resolve, reject) => {
      AppUtils.gScriptRun({
        gscriptFunc,
        args,
        staleCheck: false,
        onSuccess: resolve,
        onError: reject,
      });
    });
  }

  function getSafeReportUrl(value) {
    try {
      const url = new URL(String(value || "").trim());

      if (
        url.protocol !== "https:" ||
        !["drive.google.com", "docs.google.com"].includes(
          url.hostname.toLowerCase(),
        ) ||
        url.username ||
        url.password
      ) {
        return "";
      }

      return url.href;
    } catch {
      return "";
    }
  }

  function confirmExistingReport(report) {
    return new Promise((resolve) => {
      const ns = ".queuedReportExists";
      let settled = false;

      const finish = (result) => {
        if (settled) {
          return;
        }

        settled = true;
        AppUtils.closeModal("#app-modal");
        resolve(result);
      };

      AppUtils.openModal("#app-modal", {
        placement: "center",

        header: "<div></div>",

        body: `
          <h5 class="modal-title">
            <strong>Report Already Exists</strong>
          </h5>
          <p>
            A report for
            <strong>${AppUtils.escapeHtml(report?.name || "this period")}</strong>
            already exists.
          </p>
        `,

        footer: `
          <button type="button" class="btn btn-secondary btn-cancel">
            Cancel
          </button>
          <button type="button" class="btn btn-info btn-download">
            Download
          </button>
          <button type="button" class="btn btn-danger btn-generate">
            Generate New
          </button>
        `,

        onOpen($modal) {
          $modal
            .off(ns)
            .on(`click${ns}`, ".btn-cancel", () => {
              finish({ cancelled: true });
            })
            .on(`click${ns}`, ".btn-download", () => {
              const reportUrl = getSafeReportUrl(report?.link);

              if (!reportUrl) {
                AppUtils.showError("The existing report link is invalid.");
                return;
              }

              try {
                const url = new URL(reportUrl);

                const fileId =
                  url.pathname.match(
                    /\/(?:file|document|spreadsheets|presentation)\/d\/([^/]+)/,
                  )?.[1] || url.searchParams.get("id");

                if (!fileId) {
                  AppUtils.showError(
                    "Unable to determine the report file ID for downloading.",
                  );
                  return;
                }

                const downloadUrl = new URL("https://drive.google.com/uc");
                downloadUrl.searchParams.set("export", "download");
                downloadUrl.searchParams.set("id", fileId);

                window.open(downloadUrl.href, "_blank", "noopener,noreferrer");

                finish({
                  downloaded: true,
                  reportName: report.name,
                });
              } catch (error) {
                console.error(error);
                AppUtils.showError("Unable to download the existing report.");
              }
            })
            .on(`click${ns}`, ".btn-generate", () => {
              finish({ regenerate: true });
            });
        },

        onClose($modal) {
          $modal.off(ns);

          if (!settled) {
            settled = true;
            resolve({ cancelled: true });
          }
        },
      });
    });
  }
  
  async function generateReportRequest(payload, { requestId, updateProgress }) {
    const type = String(payload?.type || "").toLowerCase();
    const year = Number(payload?.year);
    const month = String(payload?.month || "").trim();

    if (!CONFIG[type]) {
      throw new Error("Unsupported report type.");
    }

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new Error("A valid report year is required.");
    }

    if (type === "monthly" && !month) {
      throw new Error("A report month is required.");
    }

    if (!requestId) {
      throw new Error("Missing request ID for report generation.");
    }

    const params = type === "monthly" ? { month, year } : { year };
    const cfg = CONFIG[type];
    const reportName = cfg.reportName(params);

    updateProgress("Checking for an existing report");

    const [sessionId, signature] = await getAuthArgs();

    const existing = await callGScriptAsync("checkExistingReport", [
      sessionId,
      signature,
      type,
      reportName,
    ]);

    if (existing?.exists) {
      const choice = await confirmExistingReport(existing.report);

      if (choice.cancelled) {
        return { cancelled: true };
      }

      if (choice.downloaded) {
        return {
          downloaded: true,
          reportName: choice.reportName,
        };
      }
    }

    updateProgress("Generating and saving PDF");

    const savedReport = await callGScriptAsync("generateCustomReportPDF", [
      sessionId,
      signature,
      type,
      type === "monthly" ? month : "",
      year,
      requestId,
    ]);

    if (!savedReport?.success || !savedReport.reportUrl) {
      throw new Error("The report was not saved successfully.");
    }

    const reportUrl = getSafeReportUrl(savedReport.reportUrl);

    if (!reportUrl) {
      throw new Error("The generated report returned an invalid URL.");
    }

    if (type === "monthly") {
      reportsMonthlyReportPage.refresh();
    } else {
      reportsAnnualReportPage.refresh();
    }

    cfg.reloadHistory(() => {
      TableModule.highlightLatestRow(cfg.historyTableId, 0);
    });

    AppUtils.showDashboardToast(cfg.successMessage, "success");

    return {
      type,
      reportName,
      year,
      ...(type === "monthly" ? { month } : {}),
      reportUrl,
      ...(savedReport.reportId ? { reportId: savedReport.reportId } : {}),
      ...(savedReport.reusedExisting ? { reusedExisting: true } : {}),
    };
  }

  return {
    generateMonthlyReport,
    generateYearlyReport,
    setGenerateState,
    generateReportRequest,
  };
})();

export { ReportGenerator };