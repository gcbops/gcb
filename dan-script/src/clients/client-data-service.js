import { AppUtils } from "../utils";
import { TableModule } from "../tables/tables";

const ClientDataService = (() => {
  function renderClientDataByStatus(
    sourceSheet,
    title,
    category,
    debug = false,
  ) {
    const log = (...args) => debug && console.log(...args);

    const cacheKey = getCacheKey(category);

    log("[renderClientDataByStatus] start", {
      sourceSheet,
      title,
      category,
      cacheKey,
    });

    AppUtils.cachedGScriptCall(
      cacheKey,
      "getClientDataByStatus",
      [category, sourceSheet],
      (data) => {
        handleClientDataResponse(data, sourceSheet, title, category, log);
      },
    );
  }

  function handleClientDataResponse(data, sourceSheet, title, category, log) {
    log("[renderClientDataByStatus] callback data:", data);

    if (!Array.isArray(data)) {
      log("[renderClientDataByStatus] invalid data", data);
      AppUtils.showError("⚠️ invalid dialog data");
      return;
    }

    log("[renderClientDataByStatus] rendering table");

    TableModule.renderClientData(data, title);
  }

  function getCacheKey(category) {
    return `cache_${category.replace(/\s+/g, "")}`;
  }

  return {
    renderClientDataByStatus,
  };
})();

export { ClientDataService };

