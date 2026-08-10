import { AppUtils } from "../utils.js";

const settingsConfigurationPage = (() => {

  let initialized = false;

  function init() {
    if (initialized) {return;}
    initialized = true;

    document.addEventListener("click", (e) => {
      const btn = e.target.closest("#btnClearCache");
      if (!btn) {return;}

      e.preventDefault();

      AppUtils.clearEverything();
      AppUtils.showDashboardToast("Cache cleared!", "success");
    });
  }

  return { init };

})();

export { settingsConfigurationPage };