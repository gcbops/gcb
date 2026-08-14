import { AppUtils } from "./utils";

const AppShellModule = (() => {
  let initialized = false;

  /**
   * Load an HTML component through GAS.
   */
  function loadComponent(cacheKey, fileName) {
    return new Promise((resolve, reject) => {
      AppUtils.cachedGScriptCall(
        cacheKey,
        "loadHtmlComponent",
        [fileName],
        (html) => resolve(html),
      );
    });
  }

  /**
   * Find an element by ID first,
   * then fall back to its class.
   */
  function findTarget(id, className) {
    return (
      document.getElementById(id) || document.querySelector(`.${className}`)
    );
  }

  /**
   * Insert HTML relative to an element.
   */
  function insertAfter(html, element) {
    if (!element) {
      throw new Error("Target element not found.");
    }

    element.insertAdjacentHTML("afterend", html);
  }

  /**
   * Initialize the application shell.
   *
   * This should only run once.
   */
  async function init() {
    if (initialized) {
      console.warn("⚠️ AppShellModule already initialized.");
      return true;
    }

    initialized = true;

    try {
      /*
       * ========================================================
       * 1. LOADER
       * ========================================================
       */

      const loaderHtml = await loadComponent("app-loader", "loader");

      document.body.insertAdjacentHTML("afterbegin", loaderHtml);

      /*
       * ========================================================
       * 2. APP HEADER
       * ========================================================
       */

      const headerTarget = findTarget("app-header", "app-header");

      if (!headerTarget) {
        throw new Error('App header target "#app-header" not found.');
      }

      const headerHtml = await loadComponent("app-header", "app-header");

      headerTarget.innerHTML = headerHtml;

      /*
       * ========================================================
       * 3. APP SIDEBAR
       * ========================================================
       */

      const sidebarTarget = findTarget("app-sidebar", "app-sidebar");

      if (!sidebarTarget) {
        throw new Error('App sidebar target "#app-sidebar" not found.');
      }

      const sidebarHtml = await loadComponent("app-sidebar", "app-sidebar");

      sidebarTarget.innerHTML = sidebarHtml;

      /*
       * ========================================================
       * 4. APP FOOTER
       * ========================================================
       */

      const footerTarget = findTarget("app-footer", "app-footer");

      if (!footerTarget) {
        throw new Error('App footer target "#app-footer" not found.');
      }

      const footerHtml = await loadComponent("app-footer", "app-footer");

      footerTarget.innerHTML = footerHtml;

      /*
       * ========================================================
       * 5. DIALOGS
       * ========================================================
       */

      const dialogsHtml = await loadComponent("app-dialogs", "dialogs");

      const appContainer =
        document.getElementById("app-container") ||
        document.querySelector(".app-container");

      if (appContainer) {
        insertAfter(dialogsHtml, appContainer);
      } else {
        document.body.insertAdjacentHTML("beforeend", dialogsHtml);
      }

      /*
       * ========================================================
       * DONE
       * ========================================================
       */

      return true;
    } catch (error) {
      console.error("❌ AppShellModule initialization failed:", error);

      initialized = false;

      AppUtils.showError(
        `Failed to initialize application: ${error?.message || error}`,
      );

      return false;
    }
  }

  return {
    init,
  };
})();

export { AppShellModule };