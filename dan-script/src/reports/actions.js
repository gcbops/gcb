import { ReportService } from "./service";
import { AppUtils } from "../utils";
import { ReportGenerator } from "./generator";

const ReportActions = (() => {
  function downloadLatestPDF(btn, loading) {
    const report = getLatestReport(btn);

    if (!report) {
      if (loading) {
        loading.restore();
      }
      return;
    }

    window.open(report.link, "_blank");

    if (loading) {
      loading.restore();
    }
  }

  function emailLatestReport(btn, loading) {
    sendLatestReport({
      btn,
      loading,
      reportMethod: "emailLatestReport",
      loadingMessage: "Sending email...",
      successMessage: "Latest report emailed!",
      errorMessage: "Failed to send email.",
    });
  }

  function sendLatestReportToDiscord(btn, loading) {
    sendLatestReport({
      btn,
      loading,
      reportMethod: "sendLatestReportToDiscord",
      loadingMessage: "Sending Discord notification...",
      successMessage: "Discord notification sent!",
      errorMessage: "Failed to send Discord notification.",
    });
  }

  function sendLatestReport(config) {
    const report = getLatestReport(config.btn);

    if (!report) {
      if (config.loading) {
        config.loading.restore();
      }
      return;
    }

    google.script.run
      .withSuccessHandler(() => {
        handleReportSuccess(config.btn, config.successMessage, config.loading);
      })
      .withFailureHandler((err) => {
        handleReportFailure(
          config.btn,
          err,
          config.errorMessage,
          config.loading,
        );
      })[config.reportMethod](report);
  }

  function getLatestReport(btn) {
    const report = ReportService.getLatestReport();

    if (!report) {
      // Button re-enable is now handled by loading.restore()
      return null;
    }

    return report;
  }

  function handleReportSuccess(btn, message, loading) {
    if (loading) {
      loading.setSuccess("Sent successfully");
    }
    AppUtils.showDashboardToast(message, "success");
  }

  function handleReportFailure(btn, err, message, loading) {
    if (loading) {
      loading.restore();
    }
    AppUtils.showError(err);
  }

  const handleEmailReport = ($btn) => {
    google.script.run
      .withSuccessHandler(() => {
        AppUtils.showDashboardToast("Email sent successfully!", "success");
      })
      .withFailureHandler((err) => {
        AppUtils.showError(err);
      })
      .sendRequestedEmailReport($btn.data("id"));
  };

  const handleDiscordReport = ($btn) => {
    google.script.run
      .withSuccessHandler(() => {
        AppUtils.showDashboardToast("Discord notification sent!", "success");
      })
      .withFailureHandler((err) => {
        AppUtils.showError(err);
      })
      .sendRequestedDiscordReport($btn.data("id"));
  };

  const handleBtnGenerateYearlyReport = ($btn) => {
    const selectYear = $("#yearly-report-year");
    const type = "yearly";
    const year = selectYear.val();
    selectYear.prop("disabled", true);

    const loading = AppUtils.setButtonLoading(
      $btn[0],
      "Analyzing Report Request...",
    );

    google.script.run
      .withSuccessHandler((result) => {
        if (!result.valid) {
          ReportGenerator.setGenerateState(type, false, loading);
          AppUtils.showDashboardToast(result.message, "warning");
          return;
        }
        ReportGenerator.generateYearlyReport(year, $btn, loading);
      })
      .withFailureHandler((err) => {
        ReportGenerator.setGenerateState(type, false, loading);
        console.error(err);
        AppUtils.showDashboardToast(
          err.message || "Something went wrong.",
          "error",
        );
      })
      .validateCustomYearlyReport(year);
  };

  const handleBtnGenerateMonthlyReport = ($btn) => {
    const selectMonth = $("#monthly-report-month");
    const selectYear = $("#monthly-report-year");
    const month = selectMonth.val();
    const year = selectYear.val();
    const type = "monthly";

    selectMonth.prop("disabled", true);
    selectYear.prop("disabled", true);

    const loading = AppUtils.setButtonLoading(
      $btn[0],
      "Analyzing Report Request...",
    );

    google.script.run
      .withSuccessHandler((result) => {
        if (!result.valid) {
          ReportGenerator.setGenerateState(type, false, loading);
          AppUtils.showDashboardToast(result.message, "warning");
          return;
        }
        ReportGenerator.generateMonthlyReport(month, year, $btn, loading);
      })
      .withFailureHandler((err) => {
        ReportGenerator.setGenerateState(type, false, loading);
        console.error(err);
        AppUtils.showDashboardToast(
          err.message || "Something went wrong.",
          "error",
        );
      })
      .validateCustomMonthlyReport(month, year);
  };


  const handleEmailLatestReport = ($btn) => {
    const loading = AppUtils.setButtonLoading($btn[0], "Sending email...");
    emailLatestReport($btn, loading);
  };

  const handleSendDiscordNotification = ($btn) => {
    const loading = AppUtils.setButtonLoading($btn[0], "Sending Discord...");
    sendLatestReportToDiscord($btn, loading);
  };

  const confirmAction = (ns, title, message, actionCallback) => {
    AppUtils.openConfirmationModal({
      ns: ns,
      title: title,
      message: message,
      onProceed: ($modal) => {
        actionCallback();
        AppUtils.closeModal("#app-modal");
      },
    });
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
    confirmAction,
  };
})();

export { ReportActions };
