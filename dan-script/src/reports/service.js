import { AppUtils } from "../utils/utils";

const ReportService = (() => {
  function getLatestReport(type = null) {
    const data = AppUtils.cacheGet("reportsOverview");

    if (!data || !Array.isArray(data.logs) || !data.logs.length) {
      AppUtils.showError("No reports found.");
      return null;
    }

    const reports = type
      ? data.logs.filter((report) => report?.type === type)
      : data.logs;

    if (!reports.length) {
      AppUtils.showError(
        type ? `No ${type.toLowerCase()} reports found.` : "No reports found.",
      );
      return null;
    }

    return reports[0];
  }

  function getSafeReportUrl(value) {
    const raw = String(value || "").trim();

    if (!raw) {
      return "";
    }

    try {
      const url = new URL(raw);

      const allowedHosts = ["drive.google.com", "docs.google.com"];

      if (
        url.protocol !== "https:" ||
        !allowedHosts.includes(url.hostname.toLowerCase()) ||
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

  return {
    getLatestReport,
    getSafeReportUrl,
  };
})();

export { ReportService };