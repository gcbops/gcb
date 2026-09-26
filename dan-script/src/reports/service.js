// import { AppUtils } from "../utils";

// const ReportService = (() => {

//     function getLatestReport() {
//         const data = AppUtils.cacheGet("reportsOverview");
//         if (!data || !data.logs?.length) {
//             AppUtils.showError("No reports found.");
//             return null;
//         }
//         return data.logs[0];
//     }

//     return { getLatestReport };
// })();

// export { ReportService };

import { AppUtils } from "../utils";

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

  return {
    getLatestReport,
  };
})();

export { ReportService };