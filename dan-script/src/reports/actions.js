import { ReportService } from "./service";
import { AppUtils } from "../utils";

const ReportActions = (() => {
  function downloadLatestPDF(btn) {
    const report = getLatestReport(btn);

    if (!report) {
      return;
    }

    window.open(report.link, "_blank");

    btn.prop("disabled", false);
  }

  function emailLatestReport(btn) {
    sendLatestReport({
      btn,
      reportMethod: "emailLatestReport",
      loadingMessage: "Sending email...",
      successMessage: "Latest report emailed!",
      errorMessage: "Failed to send email.",
    });
  }

  function sendLatestReportToDiscord(btn) {
    sendLatestReport({
      btn,
      reportMethod: "sendLatestReportToDiscord",
      loadingMessage: "Sending Discord notification...",
      successMessage: "Discord notification sent!",
      errorMessage: "Failed to send Discord notification.",
    });
  }

  function sendLatestReport(config) {
    const report = getLatestReport(config.btn);

    if (!report) {
      return;
    }

    AppUtils.showDashboardToast(config.loadingMessage, "info");

    google.script.run
      .withSuccessHandler(() => {
        handleReportSuccess(config.btn, config.successMessage);
      })
      .withFailureHandler((err) => {
        handleReportFailure(config.btn, err, config.errorMessage);
      })[config.reportMethod](report);
  }

  function getLatestReport(btn) {
    const report = ReportService.getLatestReport();

    if (!report) {
      btn.prop("disabled", false);
      return null;
    }

    return report;
  }

  function handleReportSuccess(btn, message) {
    btn.prop("disabled", false);

    AppUtils.showDashboardToast(message, "success");
  }

  function handleReportFailure(btn, err, message) {
    btn.prop("disabled", false);
    AppUtils.showError(err);
  }

  return {
    downloadLatestPDF,
    emailLatestReport,
    sendLatestReportToDiscord,
  };
})();

export { ReportActions };
