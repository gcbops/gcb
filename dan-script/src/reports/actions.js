import { ReportService } from "./service";
import { AppUtils } from "../utils/utils.js";
import { ReportGenerator } from "./generator";
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
          isBillingReport,
        },
        isBillingReport ? "Email Billing Records CSV" : "Email report",
      );

      AppUtils.showDashboardToast(
        "Email delivery added to the request queue.",
        "success",
      );
    } catch (error) {
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
          isBillingReport,
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
      AppUtils.showError(error?.message || "Unable to queue Discord delivery.");
    }
  };

  const handleBtnGenerateYearlyReport = async ($btn) => {
    const selectYear = $("#yearly-report-year");
    const type = "yearly";

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

    selectYear.prop("disabled", true);

    const loading = AppUtils.setButtonLoading(
      $btn[0],
      "Analyzing Report Request...",
    );

    try {
      const [sessionId, signature] = await getAuthArgs();

      AppUtils.gScriptRun({
        gscriptFunc: "validateCustomYearlyReport",
        args: [sessionId, signature, year],

        onSuccess: (result) => {

          ReportGenerator.setGenerateState(type, false, loading);

          if (!result.valid) {
            AppUtils.showDashboardToast(result.message, "warning");

            return;
          }

          RequestManager.enqueue(
            "generate-report",
            { type: "yearly", year },
            `Generate annual report — ${year}`,
          );
        },

        onError: (err) => {
          ReportGenerator.setGenerateState(type, false, loading);

          console.error(err);

          AppUtils.showDashboardToast(
            err.message || "Something went wrong.",
            "error",
          );
        },
      });
    } catch (error) {
      ReportGenerator.setGenerateState(type, false, loading);

      if (handleInvalidSessionError(error)) {
        return;
      }

      console.error(error);

      AppUtils.showDashboardToast(
        error?.message || "Unable to validate custom yearly report.",
        "error",
      );
    }
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
    const type = "monthly";

    selectMonth.prop("disabled", true);
    selectYear.prop("disabled", true);

    const loading = AppUtils.setButtonLoading(
      $btn[0],
      "Analyzing Report Request...",
    );

    try {
      const [sessionId, signature] = await getAuthArgs();

      AppUtils.gScriptRun({
        gscriptFunc: "validateCustomMonthlyReport",
        args: [sessionId, signature, month, year],

        onSuccess: (result) => {
          ReportGenerator.setGenerateState(type, false, loading);
          
          if (!result.valid) {
            AppUtils.showDashboardToast(result.message, "warning");
            return;
          }

          RequestManager.enqueue(
            "generate-report",
            { type: "monthly", month, year },
            `Generate monthly report — ${month} ${year}`,
          );
        },

        onError: (err) => {
          ReportGenerator.setGenerateState(type, false, loading);

          console.error(err);

          AppUtils.showDashboardToast(
            err.message || "Something went wrong.",
            "error",
          );
        },
      });
    } catch (error) {
      ReportGenerator.setGenerateState(type, false, loading);

      console.error(error);

      if (handleInvalidSessionError(error)) {
        return;
      }

      AppUtils.showDashboardToast(
        error?.message || "Unable to validate custom monthly report.",
        "error",
      );
    }
  };

  const handleEmailLatestReport = ($btn, reportType) => {
    const loading = AppUtils.setButtonLoading($btn[0], false, true);

    emailLatestReport($btn, loading, reportType);
  };

  const handleSendDiscordNotification = ($btn, reportType) => {
    const loading = AppUtils.setButtonLoading($btn[0], false, true);

    sendLatestReportToDiscord($btn, loading, reportType);
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