import { clientDirectoryPage } from "./pages/client-directory-page.js";
import { reportsDataExportPage } from "./pages/reports-data-export-page.js";
import { reportsMonthlyReportPage } from "./pages/reports-monthly-report-page.js";
import { reportsAnnualReportPage } from "./pages/reports-annual-report-page.js";
import { settingsConfigurationPage } from "./pages/config-page.js";
import { clientActivityPage } from "./pages/client-activity-page.js";
import { billingOwedHoursPage } from "./pages/billing-owed-hours-page.js";
import { billingPaidHoursPage } from "./pages/billing-paid-hours-page.js";
import { dailyOverviewPage } from "./pages/daily-overview-page.js";
import { growthComparisonOverviewPage } from "./pages/growth-comparison-overview-page.js";
import { HomePage } from "./pages/home-page.js";
import { monthlyOverviewPage } from "./pages/monthly-overview-page.js";
import { performanceTargetPage } from "./pages/performance-target-page.js";
import { yearlyOverviewPage } from "./pages/yearly-overview-page.js";
import { ChartModule } from "./charts.js";
import { PageLoaderModule } from "./page-loader.js";
import { DataTableModule } from "./tables/data-table.js";
import { AppUI } from "./app-ui.js";
import { AppShellModule } from "./app-shell.js";
import { AppUtils } from "./utils.js";
import { integrationsConfigurationPage } from "./pages/integration-page.js";
import { clientRankingsPage } from "./pages/client-ranking-page.js";
import { clientOpportunitiesPage } from "./pages/client-opportunities-page.js";
import { projectRankingsPage } from "./pages/project-rankings-page.js";
import { projectDirectoryPage } from "./pages/project-directory-page.js";
import { billingOverviewPage } from "./pages/billing-overview-page.js";
import { billingInvoiceStatusPage } from "./pages/billing-invoice-status-page.js";
import { performanceOverviewPage } from "./pages/performance-overview.js";
import { performanceProductivityPage } from "./pages/performance-productivity-page.js";
import { clientDetailsPage } from "./pages/client-details.js";

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

  const GITHUB_ORIGIN = "https://gcbops.github.io";

  const isGitHubEmbedded = window.GCB_IS_GITHUB_EMBEDDED === true;

  const isDirectGas = !isGitHubEmbedded;

  const routes = {
    home: HomePage,

    dailyOverview: dailyOverviewPage,
    monthlyOverview: monthlyOverviewPage,
    yearlyOverview: yearlyOverviewPage,
    growthComparisonOverview: growthComparisonOverviewPage,

    clientDirectory: clientDirectoryPage,
    clientActivity: clientActivityPage,
    clientRankings: clientRankingsPage,
    clientOpportunities: clientOpportunitiesPage,
    clientDetails: clientDetailsPage,

    projectRankings: projectRankingsPage,
    projectDirectory: projectDirectoryPage,

    billingOverview: billingOverviewPage,
    billingPaidHours: billingPaidHoursPage,
    billingOwedHours: billingOwedHoursPage,
    billingInvoiceStatus: billingInvoiceStatusPage,

    performanceProductivity: performanceProductivityPage,
    performanceOverview: performanceOverviewPage,
    performanceTarget: performanceTargetPage,

    reportsDataExport: reportsDataExportPage,
    reportsMonthlyReport: reportsMonthlyReportPage,
    reportsAnnualReport: reportsAnnualReportPage,

    settingsConfiguration: settingsConfigurationPage,
    integrationsConfiguration: integrationsConfigurationPage,
  };

  const getPageToken = () => pageToken;

  function isValidRoute(pageName) {
    return typeof pageName === "string" && !!routes[pageName];
  }

  function getInitialPage() {
    const templatePage = window.GCB_INITIAL_PAGE;

    if (isValidRoute(templatePage)) {
      return templatePage;
    }

    const savedPage = localStorage.getItem("gcb_currentPageGC");

    return isValidRoute(savedPage) ? savedPage : "home";
  }

  function setCurrentPage(pageName) {
    currentPage = pageName;

    localStorage.setItem("gcb_currentPageGC", pageName);
  }

  function getCurrentPage() {
    return currentPage;
  }

  function pushHistory(pageName) {
    if (isDirectGas) {
      history.pushState({ gcbPage: pageName }, "", window.location.href);

      return;
    }

    window.top.postMessage(
      {
        type: "GCB_NAVIGATION",
        page: pageName,
      },
      GITHUB_ORIGIN,
    );
  }

  function handlePopState(event) {
    if (isDirectGas) {
      const page = event.state?.gcbPage;

      if (isValidRoute(page)) {
        go(page, false);
      }

      return;
    }

    /*
     * GitHub owns browser history when embedded.
     */
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

        window.addEventListener("popstate", handlePopState);

        /*
         * ------------------------------------------------
         * 3. Restore previous page
         * ------------------------------------------------
         */
        const restoredPage = getInitialPage();

        /*
         * Explicit navigation requests take priority.
         */
        const initialPage = isValidRoute(pendingPage)
          ? pendingPage
          : restoredPage;

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
        go(initialPage, false);

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
  function go(pageName, updateHistory = true) {

    /*
     * ------------------------------------------------
     * Router is not ready yet.
     * ------------------------------------------------
     */
    if (!initialized) {
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

    if (updateHistory) {
      pushHistory(resolvedPageName);
    }

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
    AppUtils.closeAllDrawers();
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
      if (token !== pageToken) {
        return;
      }

      page.init?.(token);

      currentModule = page;

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

