import {
  ChartModule,
  TableModule,
  WidgetModule,
  PageLoaderModule,
} from "./modules.js";

const RouterModule = (() => {

    let currentPage = "home";
    let currentModule = null;
    let pageToken = 0;
    const getPageToken = () => pageToken;

    const setCurrentPage = (page) => {
      currentPage = page;
      localStorage.setItem("currentPageGC", page);
    };

    const getCurrentPage = () => currentPage;

    const init = () => {
      currentPage = localStorage.getItem("currentPageGC") || "home";
    };

    const routes = {

        home() {
          WidgetModule.loadTopCardMetrics();
          ChartModule.loadChart("daily");
          ChartModule.loadChart("monthly");
          ChartModule.loadChart("yearly", false, new Date().getFullYear());
          ChartModule.loadPrevYearCombinedChart();
          WidgetModule.loadTopPaidList();
          WidgetModule.loadTopProjectList();
        },

        addManualHours() {
          WidgetModule.loadGrindValues();
          WidgetModule.loadClientsDataByCategory("Client Tracker - Today", "Activity Today", "Activity Today");
          TableModule.loadClients();
        },

        dailyOverview() {
          WidgetModule.loadTopCardMetrics();
          ChartModule.loadChart("daily");
          WidgetModule.loadTopPaidList();
          WidgetModule.loadTopProjectList();
        },

        monthlyOverview() {
          WidgetModule.loadTopCardMetrics();
          ChartModule.loadChart("monthly");
          WidgetModule.loadTopPaidList();
          WidgetModule.loadTopProjectList();
        },

        yearlyOverview() {
          WidgetModule.loadTopCardMetrics();
          ChartModule.loadChart("yearly", false, new Date().getFullYear());
          WidgetModule.loadTopPaidList();
          WidgetModule.loadTopProjectList();
        },

        growthComparisonOverview() {
          WidgetModule.loadTopCardMetrics();
          ChartModule.loadPrevYearCombinedChart();
          ChartModule.loadChart("yearly");
          WidgetModule.loadTopPaidList();
          WidgetModule.loadTopProjectList();
        },

        topClients() {
          WidgetModule.loadClientsDataByCategory("Paid & Owed Log", "Top Paid Accounts", "Top Paid");
          WidgetModule.loadTopPaidList();
          WidgetModule.loadTopProjectList();
        },

        activeClients() {
          WidgetModule.loadAllAndActiveClientsInTable("activeClientsData");
          WidgetModule.loadTopPaidList();
          WidgetModule.loadTopProjectList();
        },

        outstandingClients() {
          WidgetModule.loadClientsDataByCategory("Paid & Owed Log", "Outstanding Accounts", "Outstanding Accounts");
          WidgetModule.loadWorstPaidList();
          WidgetModule.loadWorstProjectList();
        },

        allClients() {},

        upsellOverview() {},

        allManualProjects() {
          WidgetModule.loadAllManualProjects();
          WidgetModule.loadTopPaidList();
          WidgetModule.loadTopProjectList();
          TableModule.setupTaskForm();
          TableModule.loadClients("#client", true);
        },

        hourlyOverview() {},

        settingsConfiguration() {},

        billingPaidHours() {
          WidgetModule.loadTopCardMetricsBilling();
          WidgetModule.loadTopPaidList();
          WidgetModule.loadTopProjectList();
        },

        billingOwedHours() {
          WidgetModule.loadTopCardMetricsBilling();
          WidgetModule.loadWorstPaidList();
          WidgetModule.loadWorstProjectList();
        },

        performanceYearly() {
          WidgetModule.loadTopCardMetrics();
          ChartModule.loadChart("yearly");
        },

        performanceDaily() {
          WidgetModule.loadGrindValues();
          ChartModule.loadChart("daily", true);
        },  

        performanceTarget() {
          ChartModule.drawRealtimeAnimatedChart();
          ChartModule.loadPrevYearCombinedChart();
          WidgetModule.loadTargetPercentsCards( "targetPercentsCurrentYear", "getTargetPercentsCurrentYear", "curr-target-hrs", true );
          WidgetModule.loadTargetPercentsCards( "targetPercentsPreviousYear", "getTargetPercentsPreviousYear", "prev-target-hrs", true );
        },

        reportsExportData() {},

        reportsMonthlyReport() {},

        reportsAnnualReport() {},

    };

    function go(pageName, pageModule = null) {
      if (!routes[pageName]) {pageName = "home";}
      pageToken++;
      const thisToken = pageToken;

      if (currentModule && typeof currentModule.destroy === "function") {
        currentModule.destroy();
      }

      ChartModule.destroyRealtimeChart();

      setCurrentPage(pageName);

      PageLoaderModule.loadPage(pageName, () => {

        // run route logic
        routes[pageName](thisToken);

        // init new page module
        if (pageModule && typeof pageModule.init === "function") {
          pageModule.init();
        }

        currentModule = pageModule;

        // UI cleanup
        $(".drawer").removeClass("drawer-open");
        $(".app-sidebar__inner li a, .dropdown-quick-actions .dropdown-item")
          .removeClass("mm-active")
          .filter(`[data-page="${pageName}"]`)
          .addClass("mm-active");
      });
    }

    return {
      go,
      init,
      setCurrentPage,
      getCurrentPage,
      getPageToken
    };

})();

export { RouterModule };