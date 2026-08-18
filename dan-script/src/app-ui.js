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

  return {
    init,
    activateNavigation,
  };
})();

export { AppUI };
