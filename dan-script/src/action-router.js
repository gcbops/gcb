import { RouterModule } from "./routers.js";
import { PageModules } from "./page-modules.js";

const ActionRouterModule = (() => {

  const init = () => {

    const ignore = ($btn) =>
      $btn.hasClass("mm-active") ||
      ($btn.is("[aria-expanded]") && $btn.next().prop("tagName") === "UL");

    document.addEventListener(
      "click",
      (e) => {
        const pageBtn = e.target.closest("[data-page]");
        if (!pageBtn) {return;}

        e.preventDefault();
        e.stopPropagation();

        const $btn = $(pageBtn);
        if (ignore($btn)) {return;}

        const page = $btn.data("page");
        RouterModule.go(page, PageModules[page] || null);
      },
      true
    );
  };

  return { init };
})();

export { ActionRouterModule };