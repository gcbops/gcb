const AppUI = (() => {
  function init() {
    initPerfectScrollbars();
    initLoadingState();
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
