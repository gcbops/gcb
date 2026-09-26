import { AppUI } from "./app-ui.js";
import { AppUtils } from "./utils.js";

const PageLoaderModule = (() => {
  const DEFAULT_PAGE_META = {
    title: "Lab Performance Dashboard",
    desc: "Monitor all key metrics across clients, projects, and hours at a glance.",
    icon: "pe-7s-graph2 icon-gradient bg-malibu-beach",
  };

  // Available gradient backgrounds from Architect-UI / DashboardPack
  const gradientBgs = [
    "bg-happy-green",
    "bg-premium-dark",
    "bg-love-kiss",
    "bg-grow-early",
    "bg-strong-bliss",
    "bg-warm-flame",
    "bg-tempting-azure",
    "bg-sunny-morning",
    "bg-mean-fruit",
    "bg-night-fade",
    "bg-heavy-rain",
    "bg-amy-crisp",
    "bg-malibu-beach",
    "bg-deep-blue",
    "bg-mixed-hopes",
    "bg-happy-itmeo",
    "bg-happy-fisher",
    "bg-arielle-smile",
    "bg-ripe-malin",
    "bg-vicious-stance",
    "bg-midnight-bloom",
    "bg-night-sky",
    "bg-slick-carbon",
    "bg-royal",
    "bg-asteroid",
  ];

  // Helper to pick a gradient (cycle through list)
  function getGradientBg(index) {
    return gradientBgs[index % gradientBgs.length];
  }

  const pageMeta = {
    clientDirectory: {
      title: "Client Directory",
      desc: "Browse and manage all clients in one place.",
      icon: "pe-7s-users icon-gradient " + getGradientBg(0),
    },
    clientActivity: {
      title: "Client Activity",
      desc: "Monitor client activity and recent work in real time.",
      icon: "pe-7s-hourglass icon-gradient " + getGradientBg(1),
    },
    clientRankings: {
      title: "Client Ranking",
      desc: "Performance leaders across your client portfolio.",
      icon: "pe-7s-medal icon-gradient " + getGradientBg(2),
    },
    clientDetails: {
      title: "Client Details",
      desc: "View client information, activity, projects, and account records.",
      icon: "pe-7s-id icon-gradient " + getGradientBg(0),
    },
    clientOpportunities: {
      title: "Client Opportunities",
      desc: "Track approved upsell work and hourly client opportunities.",
      icon: "pe-7s-target icon-gradient " + getGradientBg(3),
    },
    dailyOverview: {
      title: "Daily Overview",
      desc: "See daily performance at a glance.",
      icon: "pe-7s-graph3 icon-gradient " + getGradientBg(4),
    },
    growthComparisonOverview: {
      title: "Growth Comparison Overview",
      desc: "Track growth and spot trends quickly.",
      icon: "pe-7s-graph3 icon-gradient " + getGradientBg(5),
    },
    monthlyOverview: {
      title: "Monthly Overview",
      desc: "See monthly performance at a glance.",
      icon: "pe-7s-graph3 icon-gradient " + getGradientBg(6),
    },
    yearlyOverview: {
      title: "Yearly Overview",
      desc: "See yearly trends and progress at a glance.",
      icon: "pe-7s-graph3 icon-gradient " + getGradientBg(7),
    },
    projectDirectory: {
      title: "Project Directory",
      desc: "View and manage all projects.",
      icon: "pe-7s-portfolio icon-gradient " + getGradientBg(8),
    },
    projectRankings: {
      title: "Project Rankings",
      desc: "Explore project performance, activity, and rankings.",
      icon: "pe-7s-graph2 icon-gradient " + getGradientBg(9),
    },
    billingOverview: {
      title: "Billing Overview",
      desc: "Overview of billing status and tracked hours.",
      icon: "pe-7s-graph icon-gradient " + getGradientBg(20),
    },
    billingPaidHours: {
      title: "Paid Hours Summary",
      desc: "Overview of hours currently marked as paid.",
      icon: "pe-7s-cash icon-gradient " + getGradientBg(10),
    },
    billingOwedHours: {
      title: "Owed Hours Summary",
      desc: "Overview of hours currently marked as unpaid or invoiced.",
      icon: "pe-7s-cash icon-gradient " + getGradientBg(11),
    },
    billingInvoiceStatus: {
      title: "Invoice Status",
      desc: "Overview of hours and records currently marked as invoiced.",
      icon: "pe-7s-note icon-gradient " + getGradientBg(12),
    },
    performanceOverview: {
      title: "Performance Overview",
      desc: "Overview of current-year hours, targets, and performance.",
      icon: "pe-7s-graph1 icon-gradient " + getGradientBg(13),
    },
    performanceTarget: {
      title: "Performance Targets",
      desc: "View goals, targets, achievements, and progress toward expected results.",
      icon: "pe-7s-target icon-gradient " + getGradientBg(14),
    },
    performanceProductivity: {
      title: "Productivity",
      desc: "Track work output, hours per task, and estimated hour value.",
      icon: "pe-7s-graph3 icon-gradient " + getGradientBg(14),
    },
    reportsDataExport: {
      title: "Report Center",
      desc: "View, generate, and manage reports.",
      icon: "pe-7s-download icon-gradient " + getGradientBg(15),
    },
    reportsMonthlyReport: {
      title: "Monthly Reports",
      desc: "Generate and manage monthly productivity reports.",
      icon: "pe-7s-download icon-gradient " + getGradientBg(16),
    },
    reportsAnnualReport: {
      title: "Annual Reports",
      desc: "Generate and manage annual productivity reports.",
      icon: "pe-7s-download icon-gradient " + getGradientBg(17),
    },
    settingsConfiguration: {
      title: "Settings",
      desc: "Control system configurations and customize platform behavior.",
      icon: "pe-7s-config icon-gradient " + getGradientBg(18),
    },
    integrationsConfiguration: {
      title: "Integrations",
      desc: "Set up and verify connections to external services used by the platform.",
      icon: "pe-7s-config icon-gradient " + getGradientBg(19),
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

        AppUI.setupStaggerCards();

        if (typeof done === "function") {
          done();
        }
      },
      false,
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
