import { allClientsPage } from "./pages/all-clients-page.js";
import { upsellOverviewPage } from "./pages/upsell-overview-page.js";
import { hourlyOverviewPage } from "./pages/hourly-overview-page.js";
import { reportsExportDataPage } from "./pages/reports-export-data-page.js";
import { reportsMonthlyReportPage } from "./pages/reports-monthly-report-page.js";
import { reportsAnnualReportPage } from "./pages/reports-annual-report-page.js";
import { settingsConfigurationPage } from "./pages/config-page.js";
import { activeClientsPage } from "./pages/active-clients-page.js";
import { addManualHoursPage } from "./pages/add-manual-hours-page.js";
import { allManualProjectsPage } from "./pages/all-manual-projects-page.js";
import { billingOwedHoursPage } from "./pages/billing-owed-hours-page.js";
import { billingPaidHoursPage } from "./pages/billing-paid-hours-page.js";
import { dailyOverviewPage } from "./pages/daily-overview-page.js";
import { growthComparisonOverviewPage } from "./pages/growth-comparison-overview-page.js";
import { HomePage } from "./pages/home-page.js";
import { monthlyOverviewPage } from "./pages/monthly-overview-page.js";
import { outstandingClientsPage } from "./pages/outstanding-clients-page.js";
import { performanceDailyPage } from "./pages/performance-daily-page.js";
import { performanceTargetPage } from "./pages/performance-target-page.js";
import { performanceYearlyPage } from "./pages/performance-yearly-page.js";
import { topClientsPage } from "./pages/top-clients-page.js";
import { yearlyOverviewPage } from "./pages/yearly-overview-page.js";
import { ChartModule } from "./charts.js";
import { PageLoaderModule } from "./page-loader.js";
import { DataTableModule } from "./tables/data-table.js";
import { AppUI } from "./app-ui.js";

const RouterModule = (() => {
  let currentPage = "home";
  let currentModule = null;
  let pageToken = 0;
  const getPageToken = () => pageToken;

  const setCurrentPage = (page) => {
    currentPage = page;
    localStorage.setItem("gcb_currentPageGC", page);
  };

  const getCurrentPage = () => currentPage;

  const init = () => {
    const savedPage = localStorage.getItem("gcb_currentPageGC");

    currentPage = routes[savedPage] ? savedPage : "home";
  };

  const routes = {
    home: HomePage,

    addManualHours: addManualHoursPage,

    dailyOverview: dailyOverviewPage,

    monthlyOverview: monthlyOverviewPage,

    yearlyOverview: yearlyOverviewPage,

    growthComparisonOverview: growthComparisonOverviewPage,

    topClients: topClientsPage,

    activeClients: activeClientsPage,

    outstandingClients: outstandingClientsPage,

    allClients: allClientsPage,

    upsellOverview: upsellOverviewPage,

    allManualProjects: allManualProjectsPage,

    hourlyOverview: hourlyOverviewPage,

    settingsConfiguration: settingsConfigurationPage,

    billingPaidHours: billingPaidHoursPage,

    billingOwedHours: billingOwedHoursPage,

    performanceYearly: performanceYearlyPage,

    performanceDaily: performanceDailyPage,

    performanceTarget: performanceTargetPage,

    reportsExportData: reportsExportDataPage,

    reportsMonthlyReport: reportsMonthlyReportPage,

    reportsAnnualReport: reportsAnnualReportPage,
  };

  function go(pageName) {
    const resolvedPageName = routes[pageName] ? pageName : "home";
    const page = routes[resolvedPageName];

    pageToken++;

    currentModule?.destroy?.();
    currentModule = null;

    ChartModule.destroyAllCharts();
    DataTableModule.destroyAll();

    setCurrentPage(resolvedPageName);

    const token = pageToken;

    PageLoaderModule.loadPage(resolvedPageName, () => {
      if (token !== pageToken) {
        return;
      }

      page.init?.(token);

      currentModule = page;

      AppUI.activateNavigation(pageName);
    });
  }

  return {
    go,
    init,
    setCurrentPage,
    getCurrentPage,
    getPageToken,
  };
})();

export { RouterModule };
