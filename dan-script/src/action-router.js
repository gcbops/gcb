import { RouterModule } from "./routers.js";

const ActionRouterModule = (() => {
  let initialized = false;

  function init() {
    if (initialized) {
      return;
    }

    document.addEventListener("click", handleNavigationClick, true);

    initialized = true;
  }

  function destroy() {
    if (!initialized) {
      return;
    }

    document.removeEventListener("click", handleNavigationClick, true);

    initialized = false;
  }

  function handleNavigationClick(e) {
    const pageBtn = e.target.closest("[data-page]");

    if (!pageBtn) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const $btn = $(pageBtn);

    if (shouldIgnore($btn)) {
      return;
    }

    const page = $btn.data("page");

    if (!page) {
      return;
    }

    const appContainer = document.querySelector(".app-container");

    if (appContainer) {
      appContainer.classList.add("closed-sidebar");
    }

    RouterModule.go(page);
  }

  function shouldIgnore($btn) {
    return (
      $btn.hasClass("mm-active") ||
      ($btn.is("[aria-expanded]") && $btn.next().prop("tagName") === "UL")
    );
  }

  return {
    init,
    destroy,
  };
})();

export { ActionRouterModule };
