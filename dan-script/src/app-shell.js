import { AppUtils } from "./utils";

const AppShellModule = (() => {
  let initialized = false;
  let initializing = null;

  function loadComponent(cacheKey, fileName) {
    const htmlCacheKey = AppUtils.getHtmlCacheKey(cacheKey);

    return new Promise((resolve, reject) => {
      AppUtils.cachedGScriptCall(
        htmlCacheKey,
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
         * Shell UI
         * ------------------------------------------------
         */

        try {
          initializeShellUI();
        } catch (error) {
          console.warn("[AppShell] Shell UI initialization failed:", error);
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

  function initializeShellUI() {
    /*
     * ------------------------------------------------
     * Sidebar hamburger
     * ------------------------------------------------
     */

    initializeSidebar();

    /*
     * ------------------------------------------------
     * Dropdowns
     * ------------------------------------------------
     */

    initializeDropdownRecovery();
  }

  function initializeDropdownRecovery() {
    if (document.documentElement.dataset.dropdownFix === "true") {
      return;
    }

    document.documentElement.dataset.dropdownFix = "true";

    document.addEventListener(
      "click",
      (e) => {
        const toggle = e.target.closest?.('[data-bs-toggle="dropdown"]');

        if (!toggle) {
          return;
        }

        /*
         * Only handle the actual toggle button.
         * Do not interfere with clicks inside the menu.
         */
        if (toggle !== e.target && !toggle.contains(e.target)) {
          return;
        }

        e.preventDefault();
        e.stopPropagation();

        const instance = bootstrap.Dropdown.getOrCreateInstance(toggle);

        instance.toggle();
      },
      true,
    );
  }

  function initializeSidebar() {
    const closeSidebarButtons = document.querySelectorAll(".close-sidebar-btn");

    if (!closeSidebarButtons.length) {
      return;
    }

    closeSidebarButtons.forEach((button) => {
      if (button.dataset.shellBound === "true") {
        return;
      }

      button.dataset.shellBound = "true";

      button.addEventListener("click", () => {
        const className = button.dataset.class;

        if (!className) {
          return;
        }

        const appContainer = document.querySelector(".app-container");

        if (appContainer) {
          appContainer.classList.toggle(className);
        }

        button.classList.toggle("is-active");
      });
    });
  }

  return {
    init,
    waitForElement,
  };
})();

export { AppShellModule };
