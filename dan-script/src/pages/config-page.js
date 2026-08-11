import { AppUtils } from "../utils.js";

const settingsConfigurationPage = (() => {
  let initialized = false;

  function init() {
    if (initialized) {
      return;
    }

    initialized = true;

    document.addEventListener("click", (e) => {
      const btn = e.target.closest("#btnClearCache");

      if (!btn) {
        return;
      }

      AppUtils.showDashboardToast(
        "Syncing data in progress!",
        "info",
      );

      e.preventDefault();

      AppUtils.clearAppCache();

      google.script.run
        .withSuccessHandler(() => {
          AppUtils.showDashboardToast(
            "Cache cleared and client sheet list synced!",
            "success",
          );
        })
        .withFailureHandler((err) => {
          console.error("syncClientSheetList failed:", err);

          AppUtils.showDashboardToast(
            "Cache cleared, but client sheet sync failed.",
            "error",
          );
        })
        .syncClientSheetList();
    });
  }

  return {
    init,
  };
})();

export { settingsConfigurationPage };
