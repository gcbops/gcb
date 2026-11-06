import { ReportService } from "./service";
import { AppUtils } from "../utils/utils.js";
import { ValidationModule } from "../utils/validations.js";
import { RequestManager } from "../requests/request-manager.js";
import {
  getAuthArgs,
  handleInvalidSessionError,
} from "../auth/auth-error-handler.js";

const ReportActions = (() => {
  function downloadLatestPDF(loading, reportType) {
    const report = getLatestReport(reportType);

    if (!report) {
      if (loading) {loading.restore();}
      return;
    }

    const reportUrl = ReportService.getSafeReportUrl(report.link);

    if (!reportUrl) {
      if (loading) {
        loading.restore();
      }

      AppUtils.showError("Report link is invalid or unavailable.");
      return;
    }

    window.open(reportUrl, "_blank", "noopener,noreferrer");

    if (loading) {loading.restore();}
  }

  function emailLatestReport(btn, loading, reportType) {
    sendLatestReport({
      btn,
      loading,
      reportType,
      reportMethod: "emailLatestReport",
      loadingMessage: "Sending email...",
      successMessage: "Latest report emailed!",
      errorMessage: "Failed to send email.",
    });
  }

  function sendLatestReportToDiscord(btn, loading, reportType) {
    sendLatestReport({
      btn,
      loading,
      reportType,
      reportMethod: "sendLatestReportToDiscord",
      loadingMessage: "Sending Discord notification...",
      successMessage: "Discord notification sent!",
      errorMessage: "Failed to send Discord notification.",
    });
  }

  async function sendLatestReport(config) {
    const report = getLatestReport(config.reportType);

    if (!report) {
      if (config.loading) {
        config.loading.restore();
      }
      return;
    }

    try {
      const [sessionId, signature] = await getAuthArgs();

      AppUtils.gScriptRun({
        gscriptFunc: config.reportMethod,
        args: [sessionId, signature, report],

        onSuccess: () => {
          handleReportSuccess(
            config.btn,
            config.successMessage,
            config.loading,
          );
        },

        onError: (err) => {
          handleReportFailure(
            config.btn,
            err,
            config.errorMessage,
            config.loading,
          );
        },
      });
    } catch (error) {
      if (handleInvalidSessionError(error)) {
        return;
      }

      handleReportFailure(
        config.btn,
        error,
        config.errorMessage,
        config.loading,
      );
    }
  }

  function getLatestReport(reportType) {
    const report = ReportService.getLatestReport(reportType);

    if (!report) {return null;}

    return report;
  }

  function handleReportSuccess(btn, message, loading) {
    if (loading) {loading.setSuccess("Sent successfully");}

    AppUtils.showDashboardToast(message, "success");
  }

  function handleReportFailure(btn, err, message, loading) {
    if (loading) {loading.restore();}

    AppUtils.showError(err);
  }
  
  const handleEmailReport = async ($btn) => {
    const reportId = $btn.data("id");
    const reportType = $btn.data("type");
    const isBillingReport = reportType === "Billing";

    if (!reportId) {
      AppUtils.showError("The report ID is missing.");
      return;
    }

    try {
      RequestManager.enqueue(
        "send-report-email",
        {
          reportId: String(reportId),
          reportType,
          isDataExport: isBillingReport,
        },
        isBillingReport ? "Email Billing Records CSV" : "Email report",
      );

      AppUtils.showDashboardToast(
        "Email delivery added to the request queue.",
        "success",
      );
    } catch (error) {
      console.error(
        "[Email] Failed to queue latest report email:",
        error,
      );

      AppUtils.showError(error?.message || "Unable to queue report email.");
    }
  };

  const handleDiscordReport = async ($btn) => {
    const reportId = $btn.data("id");
    const reportType = $btn.data("type");
    const isBillingReport = reportType === "Billing";

    if (!reportId) {
      AppUtils.showError("The report ID is missing.");
      return;
    }

    try {
      RequestManager.enqueue(
        "send-report-discord",
        {
          reportId: String(reportId),
          reportType,
          isDataExport: isBillingReport,
        },
        isBillingReport
          ? "Send Billing Records CSV to Discord"
          : "Send report to Discord",
      );

      AppUtils.showDashboardToast(
        "Discord delivery added to the request queue.",
        "success",
      );
    } catch (error) {
      console.error(
        "[Discord] Failed to queue latest report on discord:",
        error,
      );

      AppUtils.showError(error?.message || "Unable to queue latest report on discord.");
    }
  };

  const queueReportGeneration = (payload, label) => {
    try {
      RequestManager.enqueue("generate-report", payload, label);

      AppUtils.showDashboardToast(
        `${label} added to the request queue.`,
        "success",
      );
    } catch (error) {
      console.error("[Reports] Failed to queue report generation:", error);

      AppUtils.showError(
        error?.message || `Unable to queue ${label.toLowerCase()}.`,
      );
    }
  };

  const handleBtnGenerateYearlyReport = async ($btn) => {
    const selectYear = $("#yearly-report-year");

    const yearResult = ValidationModule.number(
      selectYear.val(),
      "Report year",
      {
        min: 2024,
        max: new Date().getFullYear(),
      },
    );

    if (!yearResult.valid) {
      AppUtils.showDashboardToast(yearResult.message, "warning");
      return;
    }

    const year = yearResult.value;

    queueReportGeneration(
      { type: "yearly", year },
      `Generate annual report — ${year}`,
    );
  };

  const handleBtnGenerateMonthlyReport = async ($btn) => {
    const selectMonth = $("#monthly-report-month");
    const selectYear = $("#monthly-report-year");

    const monthResult = ValidationModule.requiredString(
      selectMonth.val(),
      "Report month",
      { maxLength: 20 },
    );

    if (!monthResult.valid) {
      AppUtils.showDashboardToast(monthResult.message, "warning");
      return;
    }

    const yearResult = ValidationModule.number(
      selectYear.val(),
      "Report year",
      {
        min: 2024,
        max: new Date().getFullYear(),
      },
    );

    if (!yearResult.valid) {
      AppUtils.showDashboardToast(yearResult.message, "warning");
      return;
    }

    const month = monthResult.value;
    const year = yearResult.value;

    queueReportGeneration(
      { type: "monthly", month, year },
      `Generate monthly report — ${month} ${year}`,
    );
  };

  const handleEmailLatestReport = ($btn, reportType) => {
    const report = getLatestReport(reportType);

    if (!report) {
      AppUtils.showError("No latest report is available to email.");
      return;
    }

    try {
      RequestManager.enqueue(
        "send-report-email",
        {
          isLatestReport: true,
          report,
          reportType,
          isDataExport: false,
        },
        `Email latest ${reportType} report`,
      );

      AppUtils.showDashboardToast(
        "Latest report email added to the request queue.",
        "success",
      );
    } catch (error) {
      console.error("[Email] Failed to queue latest report email:", error);
      
      AppUtils.showError(
        error?.message || "Unable to queue latest report email.",
      );
    }
  };

  const handleSendDiscordNotification = ($btn, reportType) => {
    const report = getLatestReport(reportType);

    if (!report) {
      AppUtils.showError("No latest report is available to send.");
      return;
    }

    try {
      RequestManager.enqueue(
        "send-report-discord",
        {
          isLatestReport: true,
          report,
          reportType,
          isDataExport: false,
        },
        `Send latest ${reportType} report to Discord`,
      );

      AppUtils.showDashboardToast(
        "Latest report Discord delivery added to the request queue.",
        "success",
      );
    } catch (error) {
      console.error("[Discord] Failed to queue latest report on discord:", error);

      AppUtils.showError(
        error?.message || "Unable to queue latest report on discord.",
      );
    }
  };

  return {
    downloadLatestPDF,
    emailLatestReport,
    sendLatestReportToDiscord,
    handleEmailReport,
    handleDiscordReport,
    handleBtnGenerateYearlyReport,
    handleBtnGenerateMonthlyReport,
    handleEmailLatestReport,
    handleSendDiscordNotification,
  };
})();

export { ReportActions };