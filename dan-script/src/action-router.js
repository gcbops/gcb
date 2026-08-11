import { RouterModule } from "./routers.js";

const ActionRouterModule = (() => {
  function init() {
    document.addEventListener("click", handleNavigationClick, true);
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
  };
})();

export { ActionRouterModule };
