const AppUI = (() => {
  function init() {
    initPerfectScrollbars();
    initLoadingState();
    initScrollBehavior();
  }

  function initLoadingState() {
    setTimeout(() => {
      document.body.classList.add("loaded");

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
      }

      /*
       * Add future scroll behaviors here.
       *
       * Example:
       * handleMobileHeaderScroll(currentScrollY, lastScrollY);
       * handleScrollProgress(currentScrollY);
       */

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
      }
    });
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

  return {
    init,
    activateNavigation,
    setupStaggerCards,
    playStaggerReveal,
  };
})();

export { AppUI };
