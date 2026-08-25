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
        false
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

        const headerHtml = await loadComponent(
          "app-page-title",
          "app-page-title",
        );

        if (headerHtml) {
          const header = appContainer.querySelector("#app-page-title");

          if (header) {
            initializeDropdowns(header);
          }
        }

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
  }

  function initializeDropdowns(container = document) {
    console.log("[DropdownDebug] =======================================");

    console.log("[DropdownDebug] initializeDropdowns() START");

    console.log("[DropdownDebug] container:", container);

    console.log("[DropdownDebug] container type:", typeof container);

    console.log("[DropdownDebug] container connected:", container?.isConnected);

    /*
     * ------------------------------------------------
     * Bootstrap availability
     * ------------------------------------------------
     */

    console.log(
      "[DropdownDebug] bootstrap:",
      typeof bootstrap !== "undefined" ? bootstrap : "UNDEFINED",
    );

    console.log(
      "[DropdownDebug] bootstrap.Dropdown:",
      typeof bootstrap !== "undefined" ? bootstrap.Dropdown : "UNAVAILABLE",
    );

    if (typeof bootstrap === "undefined" || !bootstrap.Dropdown) {
      console.warn("[DropdownDebug] Bootstrap Dropdown unavailable");

      return;
    }

    /*
     * ------------------------------------------------
     * Validate container
     * ------------------------------------------------
     */

    if (!container || typeof container.querySelectorAll !== "function") {
      console.error("[DropdownDebug] INVALID CONTAINER:", container);

      return;
    }

    /*
     * ------------------------------------------------
     * Find dropdowns
     * ------------------------------------------------
     */

    const elements = container.querySelectorAll('[data-bs-toggle="dropdown"]');

    console.log("[DropdownDebug] Found dropdown toggles:", elements.length);

    /*
     * ------------------------------------------------
     * Process each dropdown
     * ------------------------------------------------
     */

    elements.forEach((element, index) => {
      console.log(`[DropdownDebug] #${index} START`);

      console.log(`[DropdownDebug] #${index} element:`, element);

      console.log(`[DropdownDebug] #${index} connected:`, element.isConnected);

      console.log(`[DropdownDebug] #${index} parent:`, element.parentNode);

      console.log(
        `[DropdownDebug] #${index} parent element:`,
        element.parentElement,
      );

      console.log(
        `[DropdownDebug] #${index} parent connected:`,
        element.parentElement?.isConnected,
      );

      console.log(
        `[DropdownDebug] #${index} aria-expanded BEFORE:`,
        element.getAttribute("aria-expanded"),
      );

      console.log(
        `[DropdownDebug] #${index} classes BEFORE:`,
        element.className,
      );

      /*
       * Find dropdown parent.
       */

      const dropdownParent =
        element.closest(".dropdown") || element.closest(".btn-group");

      console.log(`[DropdownDebug] #${index} dropdown parent:`, dropdownParent);

      console.log(
        `[DropdownDebug] #${index} dropdown parent connected:`,
        dropdownParent?.isConnected,
      );

      /*
       * Find menu.
       */

      const menu = dropdownParent?.querySelector(".dropdown-menu");

      console.log(`[DropdownDebug] #${index} menu:`, menu);

      console.log(
        `[DropdownDebug] #${index} menu connected:`,
        menu?.isConnected,
      );

      console.log(`[DropdownDebug] #${index} menu classes:`, menu?.className);

      /*
       * ------------------------------------------------
       * Existing Bootstrap instance
       * ------------------------------------------------
       */

      let instance = bootstrap.Dropdown.getInstance(element);

      console.log(`[DropdownDebug] #${index} existing instance:`, instance);

      if (instance) {
        console.log(
          `[DropdownDebug] #${index} instance parent:`,
          instance._parent,
        );

        console.log(`[DropdownDebug] #${index} instance menu:`, instance._menu);

        console.log(
          `[DropdownDebug] #${index} instance config:`,
          instance._config,
        );

        console.log(
          `[DropdownDebug] #${index} instance element connected:`,
          instance._element?.isConnected,
        );

        console.log(
          `[DropdownDebug] #${index} instance menu connected:`,
          instance._menu?.isConnected,
        );

        console.log(
          `[DropdownDebug] #${index} instance parent connected:`,
          instance._parent?.isConnected,
        );

        console.log(`[DropdownDebug] #${index} END - already initialized`);

        return;
      }

      /*
       * ------------------------------------------------
       * Safety checks
       * ------------------------------------------------
       */

      if (!element.isConnected) {
        console.warn(
          `[DropdownDebug] #${index} SKIPPED - element disconnected`,
        );

        return;
      }

      if (!element.parentNode) {
        console.warn(`[DropdownDebug] #${index} SKIPPED - no parentNode`);

        return;
      }

      if (!dropdownParent) {
        console.warn(
          `[DropdownDebug] #${index} SKIPPED - no .dropdown/.btn-group parent`,
        );

        return;
      }

      if (!menu) {
        console.warn(`[DropdownDebug] #${index} SKIPPED - no .dropdown-menu`);

        return;
      }

      /*
       * ------------------------------------------------
       * Create instance
       * ------------------------------------------------
       */

      try {
        console.log(`[DropdownDebug] #${index} Creating Bootstrap instance...`);

        instance = bootstrap.Dropdown.getOrCreateInstance(element);

        console.log(`[DropdownDebug] #${index} CREATED instance:`, instance);

        console.log(
          `[DropdownDebug] #${index} created _element:`,
          instance?._element,
        );

        console.log(
          `[DropdownDebug] #${index} created _parent:`,
          instance?._parent,
        );

        console.log(
          `[DropdownDebug] #${index} created _menu:`,
          instance?._menu,
        );

        console.log(
          `[DropdownDebug] #${index} aria-expanded AFTER CREATE:`,
          element.getAttribute("aria-expanded"),
        );
      } catch (error) {
        console.error(`[DropdownDebug] #${index} FAILED TO CREATE INSTANCE`, {
          element,
          parent: element.parentNode,
          dropdownParent,
          menu,
          error,
        });

        return;
      }

      /*
       * ------------------------------------------------
       * Final state
       * ------------------------------------------------
       */

      console.log(
        `[DropdownDebug] #${index} FINAL INSTANCE:`,
        bootstrap.Dropdown.getInstance(element),
      );

      console.log(`[DropdownDebug] #${index} END`);
    });

    console.log("[DropdownDebug] initializeDropdowns() END");

    console.log("[DropdownDebug] =======================================");

    document.addEventListener("shown.bs.dropdown", (e) => {
      console.log("[DropdownDebug] SHOWN:", e.target);
    });

    document.addEventListener("hidden.bs.dropdown", (e) => {
      console.log("[DropdownDebug] HIDDEN:", e.target);
    });

    const btn = document.querySelector(
      '.d-inline-block.dropdown [data-bs-toggle="dropdown"]',
    );

    console.log("[DropdownDebug] TEST BUTTON:", btn);

    const dd = bootstrap.Dropdown.getOrCreateInstance(btn);

    console.log("[DropdownDebug] TEST INSTANCE:", dd);

    console.log("[DropdownDebug] TEST MENU:", dd._menu);

    console.log("[DropdownDebug] TEST PARENT:", dd._parent);
  }

  function initializeSidebar() {
    const CloseSideBar = document.querySelectorAll(".close-sidebar-btn");

    if (!CloseSideBar) {
      return;
    }

    CloseSideBar.forEach((button) => {
      if (button.dataset.shellBound === "true") {
        return;
      }

      button.dataset.shellBound = "true";

      button.addEventListener("click", () => {
        const className = button.dataset.class;

        if (!className) {
          return;
        }

        document.querySelector(".app-container")?.classList.toggle(className);

        button.classList.toggle("is-active");
      });
    });
  }

  return {
    init,
    waitForElement,
    initializeDropdowns,
  };
})();

export { AppShellModule };
