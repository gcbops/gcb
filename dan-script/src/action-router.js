import { GcbAuthModule } from "./auth/auth.js";
import { LoaderModule } from "./loader.js";
import { RouterModule } from "./routers.js";
import { AppUtils } from "./utils.js";

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
      if (e.target.closest("#logout")) {
        
        AppUtils.openConfirmationModal({
          ns: "logout",
          title: "Sign Out & Clear Session?",
          message:
            "This will sign you out of GCB dashboard and clear temporary session data from your browser. You will need to sign in again to continue.",
          onProceed: ($modal, $btn) => {
            LoaderModule.show("logout");
          },
        });

        GcbAuthModule.logout().finally(() => {
          if (window.GCB_IS_GITHUB_EMBEDDED === true) {
            window.top.postMessage(
              {
                type: "GCB_RELOAD_REQUEST",
              },
              "https://gcbops.github.io",
            );
          } else {
            window.location.reload();
          }
        });

        return;
      }

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

    if (window.matchMedia("(min-width: 992px)").matches) {
      // Desktop / larger devices
      if (appContainer) {
        appContainer.classList.add("closed-sidebar");
      }
    } else {
      // Mobile / smaller devices
      if (appContainer) {
        appContainer.classList.remove("sidebar-mobile-open");
      }

      const hamburger = document.querySelector(
        ".app-header__mobile-menu .hamburger",
      );

      if (hamburger) {
        hamburger.classList.remove("is-active");
      }
    }

    const mainContainer = document.getElementById("app-main-inner-container");

    if (mainContainer) {
      mainContainer.classList.add("opacity-0");
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
