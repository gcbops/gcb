import { AppUtils } from "./utils.js";

const PageLoaderModule = (() => {
  const DEFAULT_PAGE_META = {
    title: "Lab Performance Dashboard",
    desc: "Monitor all key metrics across clients, projects, and hours at a glance.",
    icon: "pe-7s-graph2 icon-gradient bg-malibu-beach",
  };

  const pageMeta = {
    activeClients: {
      title: "Active Clients",
      desc: "View all clients currently active.",
      icon: "pe-7s-users icon-gradient bg-malibu-beach",
    },
    topClients: {
      title: "Top Clients",
      desc: "Check highest performing clients.",
      icon: "pe-7s-users icon-gradient bg-malibu-beach",
    },
    allClients: {
      title: "All Clients",
      desc: "See every client in one place.",
      icon: "pe-7s-users icon-gradient bg-malibu-beach",
    },
    outstandingClients: {
      title: "Outstanding Clients",
      desc: "See clients with pending or unpaid items.",
      icon: "pe-7s-users icon-gradient bg-malibu-beach",
    },
    addManualHours: {
      title: "Add Manual Hours",
      desc: "Log manual hours and track entries in real time.",
      icon: "pe-7s-hourglass icon-gradient bg-malibu-beach",
    },
    externalSheetsManager: {
      title: "External Sheets Manager",
      desc: "Manage and sync external Google Sheets used by the system.",
      icon: "pe-7s-folder icon-gradient bg-malibu-beach",
    },
    upsellOverview: {
      title: "Upsell Entries",
      desc: "Log upsell hours and track entries in real time.",
      icon: "pe-7s-piggy icon-gradient bg-malibu-beach",
    },
    dailyOverview: {
      title: "Daily Overview",
      desc: "See daily performance at a glance.",
      icon: "pe-7s-graph3 icon-gradient bg-malibu-beach",
    },
    growthComparisonOverview: {
      title: "Growth Comparison Overview",
      desc: "Track growth and spot trends quickly.",
      icon: "pe-7s-graph3 icon-gradient bg-malibu-beach",
    },
    monthlyOverview: {
      title: "Monthly Overview",
      desc: "See monthly performance at a glance.",
      icon: "pe-7s-graph3 icon-gradient bg-malibu-beach",
    },
    yearlyOverview: {
      title: "Yearly Overview",
      desc: "See yearly trends and progress at a glance.",
      icon: "pe-7s-graph3 icon-gradient bg-malibu-beach",
    },
    allManualProjects: {
      title: "Manual Projects",
      desc: "View all manual projects.",
      icon: "pe-7s-portfolio icon-gradient bg-malibu-beach",
    },
    hourlyOverview: {
      title: "Hourly Overview",
      desc: "View hourly history.",
      icon: "pe-7s-portfolio icon-gradient bg-malibu-beach",
    },
    billingPaidHours: {
      title: "Paid Hours Summary",
      desc: "Overview of hours that have already been billed and paid.",
      icon: "pe-7s-cash icon-gradient bg-malibu-beach",
    },
    billingOwedHours: {
      title: "Owed Hours Summary",
      desc: "Overview of hours that are pending billing or payment.",
      icon: "pe-7s-cash icon-gradient bg-malibu-beach",
    },
    performanceYearly: {
      title: "Yearly Performance",
      desc: "Track yearly results, growth trends, and overall performance progress.",
      icon: "pe-7s-graph3 icon-gradient bg-malibu-beach",
    },
    performanceDaily: {
      title: "Daily Performance",
      desc: "Monitor daily activities, completed tasks, and performance updates.",
      icon: "pe-7s-clock icon-gradient bg-mean-fruit",
    },
    performanceTarget: {
      title: "Performance Targets",
      desc: "View goals, targets, achievements, and progress toward expected results.",
      icon: "pe-7s-target icon-gradient bg-sunny-morning",
    },
    reportsExportData: {
      title: "Report Center",
      desc: "Generate and download reports.",
      icon: "pe-7s-download icon-gradient bg-sunny-morning",
    },
    reportsMonthlyReport: {
      title: "Generate Monthly Report",
      desc: "Generate and manage monthly productivity reports.",
      icon: "pe-7s-download icon-gradient bg-sunny-morning",
    },
    reportsAnnualReport: {
      title: "Generate Annual Report",
      desc: "Generate and manage annual productivity reports.",
      icon: "pe-7s-download icon-gradient bg-sunny-morning",
    },
    settingsConfiguration: {
      title: "Settings",
      desc: "Control system configurations and customize platform behavior.",
      icon: "pe-7s-config icon-gradient bg-malibu-beach",
    },
    integrationsConfiguration: {
      title: "Integrations",
      desc: "Set up and verify connections to external services used by the platform.",
      icon: "pe-7s-config icon-gradient bg-malibu-beach",
    },
  };

  function loadPage(pageName, done) {
    const meta = pageMeta[pageName] || DEFAULT_PAGE_META;

    /*
     * ------------------------------------------------
     * Page title
     * ------------------------------------------------
     *
     * app-page-title is now loaded only once
     * on the homepage.
     *
     * We only update its contents here.
     */
    updatePageHeader(meta);

    /*
     * ------------------------------------------------
     * Page content container
     * ------------------------------------------------
     */

    const pageContainer = document.getElementById("app-main-inner-container");

    if (!pageContainer) {
      AppUtils.showError("App main inner container not found.");

      return;
    }

    /*
     * ------------------------------------------------
     * Load subpage
     * ------------------------------------------------
     */

    const cacheKey = AppUtils.getHtmlCacheKey(`page_${pageName}`);

    AppUtils.cachedGScriptCall(
      cacheKey,
      "loadHtmlComponent",
      [pageName],
      (pageHtml) => {
        /*
         * Replace only the subpage content.
         *
         * This keeps app-page-title and the rest
         * of the shell untouched.
         */
        pageContainer.innerHTML = pageHtml;

        if (typeof done === "function") {
          done();
        }
      },
      (error) => {
        console.error(`[PageLoader] Failed to load page: ${pageName}`, error);

        AppUtils.showError(`Failed to load page: ${pageName}`);
      },
    );
  }

  function updatePageHeader(meta) {
    const pageTitle = document.getElementById("pageTitle");

    if (pageTitle) {
      pageTitle.textContent = meta.title;
    }

    const pageTitleDesc = document.getElementById("pageTitleDesc");

    if (pageTitleDesc) {
      pageTitleDesc.textContent = meta.desc;
    }

    const pageTitleIcon = document.getElementById("pageTitleIcon");

    if (pageTitleIcon) {
      pageTitleIcon.className = meta.icon;
    }
  }

  return {
    loadPage,
  };
})();

export { PageLoaderModule };
