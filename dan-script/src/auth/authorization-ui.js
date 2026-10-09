import { GcbAuthModule } from "./auth.js";

const AuthorizationUIModule = (() => {
  const ROUTE_REQUIREMENTS = {
    // Clients
    clientDirectory: {
      capability: "clients.view",
    },
    clientActivity: {
      capability: "clients.view",
    },
    clientRankings: {
      capability: "clients.view",
    },
    clientOpportunities: {
      capability: "clients.view",
    },
    clientDetails: {
      capability: "clients.view",
    },

    // Projects
    projectDirectory: {
      capability: "clients.view",
    },
    projectRankings: {
      capability: "clients.view",
    },

    // Billing
    billingOverview: {
      capability: "billing.view",
    },
    billingPaidHours: {
      capability: "billing.view",
    },
    billingOwedHours: {
      capability: "billing.view",
    },
    billingInvoiceStatus: {
      capability: "billing.view",
    },

    // Performance
    performanceOverview: {
      capability: "hours.view",
    },
    performanceTarget: {
      capability: "hours.view",
    },
    performanceProductivity: {
      capability: "hours.view",
    },

    // Reports
    reportsMonthlyReport: {
      capability: "reports.view",
    },
    reportsAnnualReport: {
      capability: "reports.view",
    },
    reportsDataExport: {
      capability: "reports.view",
    },

    // Settings
    settingsConfiguration: {
      capability: "settings.manage",
    },

    // Integrations — admin only
    integrationsConfiguration: {
      capability: "settings.manage",
      role: "admin",
    },
  };

  function canAccessRoute(pageName) {
    const requirement = ROUTE_REQUIREMENTS[pageName];

    if (!requirement) {
      return true;
    }

    if (requirement.role && GcbAuthModule.getRole() !== requirement.role) {
      return false;
    }

    if (
      requirement.capability &&
      !GcbAuthModule.hasCapability(requirement.capability)
    ) {
      return false;
    }

    return true;
  }

  function getRouteCapability(pageName) {
    return ROUTE_REQUIREMENTS[pageName] || null;
  }

  function applyNavigationPermissions() {
    document.querySelectorAll("[data-page]").forEach((element) => {
      const pageName = element.dataset.page;

      if (!pageName) {
        return;
      }

      const allowed = canAccessRoute(pageName);

      element.closest("li")?.classList.toggle("d-none", !allowed);
    });

    document.querySelectorAll(".vertical-nav-menu > li").forEach((section) => {
      const childLinks = section.querySelectorAll("ul [data-page]");

      if (!childLinks.length) {
        return;
      }

      const hasVisibleChild = [...childLinks].some(
        (link) => !link.closest("li")?.classList.contains("d-none"),
      );

      section.classList.toggle("d-none", !hasVisibleChild);
    });
  }

  function canAccessRequirement({ capability = null, role = null } = {}) {
    if (role && GcbAuthModule.getRole() !== role) {
      return false;
    }

    if (capability && !GcbAuthModule.hasCapability(capability)) {
      return false;
    }

    return true;
  }

  function applyActionPermissions() {
    document
      .querySelectorAll("[data-required-capability], [data-required-role]")
      .forEach((element) => {
        const capability = element.dataset.requiredCapability || null;

        const role = element.dataset.requiredRole || null;

        const allowed = canAccessRequirement({
          capability,
          role,
        });

        if (!allowed) {
          element.remove();
        }
      });
  }

  return {
    canAccessRoute,
    getRouteCapability,
    applyNavigationPermissions,
    canAccessRequirement,
    applyActionPermissions,
  };
})();

export { AuthorizationUIModule };
