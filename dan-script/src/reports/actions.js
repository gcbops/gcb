import { ReportService } from "./service";
import { AppUtils } from "../utils";
import { ReportGenerator } from "./generator";
import { ValidationModule } from "../validations";
import { GcbAuthModule } from "../auth/auth";

const ReportActions = (() => {
  function downloadLatestPDF(btn, loading, reportType) {
    const report = getLatestReport(reportType);

    if (!report) {
      if (loading) {loading.restore();}
      return;
    }

    if (!report.link) {
      if (loading) {loading.restore();}
      AppUtils.showError("Report link is unavailable.");
      return;
    }

    window.open(report.link, "_blank");

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
      const [sessionId, signature] = await GcbAuthModule.getAuthArgs();

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

    const successMessage =
      reportType === "Data Export"
        ? "CSV emailed successfully!"
        : "Email sent successfully!";

    const serverFunction =
      reportType === "Data Export"
        ? "sendBillingRecordsCSVEmail"
        : "sendRequestedEmailReport";

    try {
      const [sessionId, signature] = await GcbAuthModule.getAuthArgs();

      AppUtils.gScriptRun({
        gscriptFunc: serverFunction,
        args: [sessionId, signature, reportId],

        onSuccess: () => AppUtils.showDashboardToast(successMessage, "success"),

        onError: (err) => AppUtils.showError(err),
      });
    } catch (error) {
      AppUtils.showError(error?.message || "Authentication required.");
    }
  };

  const handleDiscordReport = async ($btn) => {
    const reportId = $btn.data("id");
    const reportType = $btn.data("type");

    const successMessage =
      reportType === "Data Export"
        ? "CSV sent to Discord successfully!"
        : "Discord notification sent!";

    const serverFunction =
      reportType === "Data Export"
        ? "sendBillingRecordsCSVDiscord"
        : "sendRequestedDiscordReport";

    try {
      const [sessionId, signature] = await GcbAuthModule.getAuthArgs();

      AppUtils.gScriptRun({
        gscriptFunc: serverFunction,
        args: [sessionId, signature, reportId],

        onSuccess: () => AppUtils.showDashboardToast(successMessage, "success"),

        onError: (err) => AppUtils.showError(err),
      });
    } catch (error) {
      AppUtils.showError(error?.message || "Authentication required.");
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
      const [sessionId, signature] = await GcbAuthModule.getAuthArgs();

      AppUtils.gScriptRun({
        gscriptFunc: "validateCustomYearlyReport",
        args: [sessionId, signature, year],

        onSuccess: (result) => {
          if (!result.valid) {
            ReportGenerator.setGenerateState(type, false, loading);

            AppUtils.showDashboardToast(result.message, "warning");

            return;
          }

          ReportGenerator.generateYearlyReport(year, $btn, loading);
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

      AppUtils.showDashboardToast(
        error?.message || "Authentication required.",
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
      const [sessionId, signature] = await GcbAuthModule.getAuthArgs();

      AppUtils.gScriptRun({
        gscriptFunc: "validateCustomMonthlyReport",
        args: [sessionId, signature, month, year],

        onSuccess: (result) => {
          if (!result.valid) {
            ReportGenerator.setGenerateState(type, false, loading);

            AppUtils.showDashboardToast(result.message, "warning");

            return;
          }

          ReportGenerator.generateMonthlyReport(month, year, $btn, loading);
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

      AppUtils.showDashboardToast(
        error?.message || "Authentication required.",
        "error",
      );
    }
  };

  const handleEmailLatestReport = ($btn, reportType) => {
    const loading = AppUtils.setButtonLoading($btn[0], "Sending email...");

    emailLatestReport($btn, loading, reportType);
  };

  const handleSendDiscordNotification = ($btn, reportType) => {
    const loading = AppUtils.setButtonLoading($btn[0], "Sending Discord...");

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