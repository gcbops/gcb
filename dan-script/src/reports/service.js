import { AppUtils } from "../utils";

const ReportService = (() => {

    function getLatestReport() {
        const data = AppUtils.cacheGet("reportsOverview");
        if (!data || !data.logs?.length) {
            AppUtils.showError("No reports found.");
            return null;
        }
        return data.logs[0];
    }

    return { getLatestReport };
})();

export { ReportService };
