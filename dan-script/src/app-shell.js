import { AppUtils } from "./utils";

const AppShellModule = (() => {
  let initialized = false;
  let initializing = null;

  function loadComponent(cacheKey, fileName) {
    return new Promise((resolve, reject) => {
      AppUtils.cachedGScriptCall(
        cacheKey,
        "loadHtmlComponent",
        [fileName],
        (html) => resolve(html),
        false,
      );
    });
  }

  function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(selector);

      if (existing) {
        resolve(existing);
        return;
      }

      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);

        if (!element) {
          return;
        }

        observer.disconnect();
        clearTimeout(timeoutId);

        resolve(element);
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      const timeoutId = setTimeout(() => {
        observer.disconnect();

        reject(
          new Error(`Element "${selector}" was not found within ${timeout}ms.`),
        );
      }, timeout);
    });
  }

  async function init() {
    if (initialized) {
      return true;
    }

    if (initializing) {
      return initializing;
    }

    initializing = (async () => {
      try {
        const appContainer = await waitForElement("#app-container");

        /*
         * ------------------------------------------------
         * Loader
         * ------------------------------------------------
         */

        try {
          const loaderHtml = await loadComponent("app-loader", "loader");

          if (loaderHtml) {
            document.body.insertAdjacentHTML("afterbegin", loaderHtml);
          }
        } catch (error) {
          console.warn("[AppShell] Loader failed:", error);
        }

        /*
         * ------------------------------------------------
         * Dialogs
         * ------------------------------------------------
         */

        try {
          const dialogsHtml = await loadComponent("app-dialogs", "dialogs");

          if (dialogsHtml) {
            appContainer.insertAdjacentHTML("afterend", dialogsHtml);
          }
        } catch (error) {
          console.warn("[AppShell] Dialogs failed:", error);
        }

        /*
         * ------------------------------------------------
         * Done
         * ------------------------------------------------
         */

        initialized = true;

        return true;
      } catch (error) {
        console.error("[AppShell] Initialization failed:", error);

        initialized = false;

        AppUtils.showError(
          `Failed to initialize application: ${error?.message || error}`,
        );

        return false;
      } finally {
        initializing = null;
      }
    })();

    return initializing;
  }

  return {
    init,
    waitForElement,
  };
})();

export { AppShellModule };
