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
import { AppShellModule } from "./app-shell.js";
import { AppUtils } from "./utils.js";
import { integrationsConfigurationPage } from "./pages/integration-page.js";
import { externalSheetsManagerPage } from "./pages/external-sheets-manager-page.js";

const RouterModule = (() => {
  let currentPage = "home";
  let currentModule = null;
  let pageToken = 0;

  let initialized = false;
  let initializing = null;

  /*
   * Navigation requested before the router finished
   * initializing.
   */
  let pendingPage = null;

  const routes = {
    home: HomePage,

    addManualHours: addManualHoursPage,
    externalSheetsManager: externalSheetsManagerPage,

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

    integrationsConfiguration: integrationsConfigurationPage,
  };

  const getPageToken = () => pageToken;

  function isValidRoute(pageName) {
    return typeof pageName === "string" && !!routes[pageName];
  }

  function setCurrentPage(pageName) {
    currentPage = pageName;

    localStorage.setItem("gcb_currentPageGC", pageName);
  }

  function getCurrentPage() {
    return currentPage;
  }

  /**
   * Initialize router and application shell.
   */
  async function init() {
    if (initialized) {
      return true;
    }

    if (initializing) {
      return initializing;
    }

    initializing = (async () => {
      try {
        /*
         * ------------------------------------------------
         * 1. Initialize application shell
         * ------------------------------------------------
         */
        const shellReady = await AppShellModule.init();

        if (!shellReady) {
          throw new Error("AppShellModule failed to initialize.");
        }

        /*
         * ------------------------------------------------
         * 2. Initialize shared UI
         * ------------------------------------------------
         */
        AppUI.init();

        /*
         * ------------------------------------------------
         * 3. Restore previous page
         * ------------------------------------------------
         */
        const savedPage = localStorage.getItem("gcb_currentPageGC");

        const restoredPage = isValidRoute(savedPage) ? savedPage : "home";

        /*
         * Only use pendingPage if it is a valid route.
         *
         * Otherwise restore the page from localStorage.
         */
        const initialPage = isValidRoute(pendingPage)
          ? pendingPage
          : restoredPage;

        /*
         * Clear pending navigation before
         * marking the router ready.
         */
        pendingPage = null;

        /*
         * ------------------------------------------------
         * 4. Router is now ready
         * ------------------------------------------------
         */
        initialized = true;

        /*
         * ------------------------------------------------
         * 5. Load initial page
         * ------------------------------------------------
         */
        go(initialPage);

        return true;
      } catch (error) {
        console.error("[RouterModule] Initialization failed:", error);

        initialized = false;

        AppUtils.showError(
          `Application initialization failed: ${error?.message || error}`,
        );

        return false;
      } finally {
        initializing = null;
      }
    })();

    return initializing;
  }

  /**
   * Navigate to a page.
   */
  function go(pageName) {
    /*
     * ------------------------------------------------
     * Router is not ready yet.
     *
     * Remember the requested page instead of
     * immediately trying to navigate.
     * ------------------------------------------------
     */
    if (!initialized) {
      /*
       * Do not allow the default "home" navigation
       * to override a page restored from localStorage.
       */
      if (pageName === "home") {
        return;
      }

      if (isValidRoute(pageName)) {
        pendingPage = pageName;
      }

      return;
    }

    /*
     * ------------------------------------------------
     * Resolve route
     * ------------------------------------------------
     */
    const resolvedPageName = isValidRoute(pageName) ? pageName : "home";

    const page = routes[resolvedPageName];

    if (!page) {
      console.error(`[RouterModule] Route "${resolvedPageName}" not found.`);

      return;
    }

    /*
     * Don't reload the same page unnecessarily.
     */
    if (resolvedPageName === currentPage && currentModule) {
      return;
    }

    /*
     * ------------------------------------------------
     * Invalidate previous async callbacks
     * ------------------------------------------------
     */
    pageToken++;

    const token = pageToken;

    /*
     * ------------------------------------------------
     * Cleanup BEFORE replacing page DOM
     * ------------------------------------------------
     */

    DataTableModule.destroyAll();
    ChartModule.destroyAllCharts();

    currentModule?.destroy?.();
    currentModule = null;

    /*
     * ------------------------------------------------
     * Store current page
     * ------------------------------------------------
     */
    setCurrentPage(resolvedPageName);

    /*
     * ------------------------------------------------
     * Load page
     * ------------------------------------------------
     */
    PageLoaderModule.loadPage(resolvedPageName, () => {
      /*
       * Ignore stale callbacks.
       */
      if (token !== pageToken) {
        return;
      }

      AppUI.setupStaggerCards();

      /*
       * Initialize page.
       */
      page.init?.(token);

      currentModule = page;

      /*
       * Update navigation.
       */
      AppUI.activateNavigation(resolvedPageName);

      requestAnimationFrame(() => {
        AppUI.playStaggerReveal();
      });
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

