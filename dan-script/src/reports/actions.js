import { ReportService } from "./service";
import { AppUtils } from "../utils";

const ReportActions = (() => {
  function downloadLatestPDF(btn, loading) {
    const report = getLatestReport(btn);

    if (!report) {
      if (loading) {loading.restore();}
      return;
    }

    window.open(report.link, "_blank");

    if (loading) {loading.restore();}
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

  return {
    downloadLatestPDF,
    emailLatestReport,
    sendLatestReportToDiscord,
  };
})();

export { ReportActions };
