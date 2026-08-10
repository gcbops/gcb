import { AppUtils } from "../utils";

const ReportService = (() => {

    function getLatestReport() {
        const data = AppUtils.cacheGet("reportsOverview");
        if (!data || !data.logs?.length) {
            AppUtils.showDashboardToast("No reports found.", "error");
            return null;
        }
        return data.logs[0];
    }

    return { getLatestReport };
})();

export { ReportService };
