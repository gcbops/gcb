import { LoaderModule } from "./components/loader";
import { AppPopoverModule } from "./components/app-popover";
import { Select2Module } from "./components/select2";

const AppUI = (() => {
  function init() {
    initPerfectScrollbars();
    initLoadingState();
    initScrollBehavior();
    initFooterQuickAccess();
  }

  function initLoadingState() {
    setTimeout(() => {
      LoaderModule.hide();

      document.querySelectorAll(".drawer").forEach((drawer) => {
        drawer.classList.add("reg");
      });

      const appContainer = document.querySelector(".app-container");

      if (appContainer) {
        appContainer.classList.remove("loading");
        appContainer.classList.add("closed-sidebar");
      }
    }, 5000);
  }

  function initScrollBehavior() {
    let lastScrollY = window.scrollY;
    let ticking = false;

    function handleScroll() {
      const currentScrollY = window.scrollY;

      /*
       * Mobile-only scroll behavior.
       */
      if (window.innerWidth <= 768) {
        handleMobileFooterScroll(currentScrollY, lastScrollY);

        handleHeaderScroll(currentScrollY, lastScrollY);
      }

      lastScrollY = currentScrollY;
      ticking = false;
    }

    function requestTick() {
      if (!ticking) {
        window.requestAnimationFrame(handleScroll);
        ticking = true;
      }
    }

    window.addEventListener("scroll", requestTick, {
      passive: true,
    });

    /*
     * Handle resize so the footer is restored
     * when switching from mobile to desktop.
     */
    window.addEventListener("resize", () => {
      if (window.innerWidth > 768) {
        const footer = document.querySelector(".app-wrapper-footer");

        footer?.classList.remove("footer-hidden");

        const header = document.querySelector(".app-header");

        header?.classList.remove("app-header-hidden");
      }
    });
  }

  function initPageSelect2() {
    const $scope = "#app-main__inner";
    
    const $select2Fields = $($scope).find(
      "select.js-select2, select.js-select2-dynamic",
    );

    if (!$select2Fields.length) {
      return;
    }

    Select2Module.init($scope);
  }

  function activateNavigation(pageName) {
    $(".drawer").removeClass("drawer-open");

    $(".app-sidebar__inner li a, .dropdown-quick-actions .dropdown-item")
      .removeClass("mm-active")
      .filter(`[data-page="${pageName}"]`)
      .addClass("mm-active");
  }

  function initPerfectScrollbars() {
    if (typeof PerfectScrollbar === "undefined") {
      console.warn("[AppUI] PerfectScrollbar library not loaded.");

      return;
    }

    const elements = [
      document.querySelector(".scrollbar-sidebar"),
      ...document.querySelectorAll(".scrollbar-container"),
    ].filter(Boolean);

    elements.forEach((element) => {
      if (element._perfectScrollbar) {
        return;
      }

      try {
        element._perfectScrollbar = new PerfectScrollbar(element);
      } catch (error) {
        console.warn("[AppUI] PerfectScrollbar failed:", element, error);
      }
    });
  }

  function initFooterQuickAccess() {
    const footer = document.querySelector(".app-wrapper-footer");

    if (!footer || footer.dataset.quickAccessInitialized === "true") {
      return;
    }

    footer.dataset.quickAccessInitialized = "true";

    registerFooterPopovers();
    bindFooterActions(footer);
  }

  function registerFooterPopovers() {
    AppPopoverModule.register("gcb-notifications", {
      title: "Notifications & System",
      icon: '<i class="pe-7s-bell"></i>',
      width: 380,
      tabs: [
        {
          id: "schedule",
          label: "Schedules",
          content: `
          <div class="app-popover-section">
            <h6>Scheduled Triggers</h6>
            <p>View scheduled triggers and daily update status.</p>
            <span class="badge bg-secondary">Not connected</span>
          </div>
        `,
        },
        {
          id: "reports",
          label: "Reports",
          content: `
          <div class="app-popover-section">
            <h6>Scheduled Reports</h6>
            <p>Review report schedules and their latest status.</p>
            <span class="badge bg-secondary">Not connected</span>
          </div>
        `,
        },
        {
          id: "logs",
          label: "System Logs",
          content: `
          <div class="app-popover-section">
            <h6>System Errors</h6>
            <p>View application errors and recent system activity.</p>
            <span class="badge bg-secondary">Not connected</span>
          </div>
        `,
        },
      ],
    });

    AppPopoverModule.register("gcb-hours-summary", {
      title: "Hours Summary",
      icon: '<i class="pe-7s-clock"></i>',
      width: 360,
      tabs: [
        {
          id: "today",
          label: "Today",
          content: createHoursPlaceholder("Today's Hours"),
        },
        {
          id: "week",
          label: "Week",
          content: createHoursPlaceholder("This Week"),
        },
        {
          id: "month",
          label: "Month",
          content: createHoursPlaceholder("This Month"),
        },
      ],
    });

    AppPopoverModule.register("gcb-user-menu", {
      title: "Account",
      icon: '<i class="pe-7s-user"></i>',
      width: 300,
      content: `
      <div class="app-popover-account">
        <div class="app-popover-account__identity">
          <strong>GCB User</strong>
          <small>Account information</small>
        </div>

        <div class="list-group list-group-flush">
          <button
            type="button"
            class="list-group-item list-group-item-action"
            data-footer-action="profile"
          >
            <i class="pe-7s-user me-2"></i>
            Profile
          </button>

          <button
            type="button"
            class="list-group-item list-group-item-action"
            data-footer-action="settings"
          >
            <i class="pe-7s-config me-2"></i>
            Settings
          </button>

          <button
            type="button"
            class="list-group-item list-group-item-action text-danger"
            data-footer-action="logout"
          >
            <i class="pe-7s-power me-2"></i>
            Sign out
          </button>
        </div>
      </div>
    `,
    });
  }

  function createHoursPlaceholder(title) {
    return `
    <div class="app-popover-section">
      <h6>${title}</h6>
      <div class="app-popover-metric">—</div>
      <p>Hours data will appear here when connected.</p>
    </div>
  `;
  }

  function handleHeaderScroll(currentScrollY, lastScrollY) {
    const header = document.querySelector(".app-header");

    if (!header) {
      return;
    }

    const showThreshold = 80;
    const scrollDifference = 5;

    const isScrollingDown = currentScrollY > lastScrollY;

    const isScrollingUp = currentScrollY < lastScrollY;

    const scrollDelta = Math.abs(currentScrollY - lastScrollY);

    /*
     * At or near the top → always show the header.
     */
    if (currentScrollY <= showThreshold) {
      header.classList.remove("app-header-hidden");

      return;
    }

    /*
     * Scrolling up → hide the header.
     */
    if (isScrollingUp && scrollDelta > scrollDifference) {
      header.classList.add("app-header-hidden");

      return;
    }

    /*
     * Scrolling down → keep the header visible/sticky.
     */
    if (isScrollingDown && scrollDelta > scrollDifference) {
      header.classList.remove("app-header-hidden");
    }
  }

  function bindFooterActions(footer) {
    footer.addEventListener("click", (event) => {
      const action = event.target.closest("[data-footer-action]");

      if (!action || !footer.contains(action)) {
        return;
      }

      switch (action.dataset.footerAction) {
        case "profile":
          // Connect to the existing profile/settings navigation.
          break;

        case "settings":
          // Connect to the existing settings page or modal.
          break;

        case "logout":
          // Connect to the real authentication/session logout flow.
          break;
      }
    });
  }

  function handleMobileFooterScroll(currentScrollY, lastScrollY) {
    const footer = document.querySelector(".app-wrapper-footer");

    if (!footer) {
      return;
    }

    /*
     * Scrolling down → hide footer.
     */
    if (currentScrollY > lastScrollY && currentScrollY > 80) {
      footer.classList.add("footer-hidden");
    } else {
      /*
       * Scrolling up or near top → show footer.
       */
      footer.classList.remove("footer-hidden");
    }
  }

  // Set up the initial skeleton/blur state on each card
  function setupStaggerCards(container = "#app-main__inner") {
    const root =
      typeof container === "string"
        ? document.querySelector(container)
        : container;

    if (!root) {
      return;
    }

    root.querySelectorAll(".card").forEach((card) => {
      card.classList.remove("loaded");
      card.classList.add("stagger");
    });
  }

  function playStaggerReveal(container = "#app-main__inner") {
    const root =
      typeof container === "string"
        ? document.querySelector(container)
        : container;

    if (!root) {
      return;
    }

    document
      .getElementById("app-main-inner-container")
      .classList.remove("opacity-0");

    const cards = root.querySelectorAll(".card.stagger");
    const stagger = 350;

    cards.forEach((card, index) => {
      setTimeout(
        () => {
          card.classList.remove("stagger");
          card.classList.add("loaded");
        },
        400 + index * stagger,
      );
    });
  }

  // Set up skeleton state on each card
  function setupSkeletonCards(container = "#app-main__inner") {
    const root =
      typeof container === "string"
        ? document.querySelector(container)
        : container;

    if (!root) {
      return;
    }

    root.querySelectorAll(".skeleton-target").forEach((card) => {
      card.classList.remove("loaded");
      card.classList.add("skeleton");
    });
  }

  // Reveal cards with optional stagger
  function playSkeletonReveal(container = "#app-main__inner") {
    const root =
      typeof container === "string"
        ? document.querySelector(container)
        : container;

    if (!root) {
      return;
    }

    const containerEl = document.getElementById("app-main-inner-container");
    if (containerEl) {
      containerEl.classList.remove("opacity-0");
    }

    const cards = root.querySelectorAll(".skeleton-target.skeleton");
    const stagger = 350; // ms between each card

    cards.forEach((card, index) => {
      setTimeout(
        () => {
          card.classList.add("loaded");
          // Optionally remove 'skeleton' class after animation if you want
          setTimeout(() => card.classList.remove("skeleton"), 400);
        },
        100 + index * stagger,
      );
    });
  }

  return {
    init,
    activateNavigation,
    setupStaggerCards,
    playStaggerReveal,
    setupSkeletonCards,
    playSkeletonReveal,
    initPageSelect2,
  };
})();

export { AppUI };
