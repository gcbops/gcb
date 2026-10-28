import { handleInvalidSessionError } from "../auth/auth-error-handler.js";
import { TableModule } from "./tables.js";
import { AppUtils } from "../utils/utils.js";
import { GcbAuthModule } from "../auth/auth.js";

const TableClientSelector = (() => {
  const CLIENTS_CACHE_KEY = "clientDirectoryData";
  const CLIENTS_SERVER_FUNCTION = "getClientDirectoryData";

  let initialized = false;
  let currentSelectId = "#client";

  function init(selectId = "#client", isForProject = false) {
    if (initialized) {
      return;
    }

    initialized = true;

    currentSelectId = selectId;

    initClientSelector(selectId, isForProject);
  }

  function destroy() {
    if (!initialized) {
      return;
    }

    initialized = false;

    const $select = $(currentSelectId);

    if ($select.length) {
      $select.off(".clientSelector");
    }

    currentSelectId = "#client";
  }

  async function initClientSelector(
    selectId = "#client",
    isForProject = false,
  ) {
    const $select = $(selectId);

    if (!$select.length) {
      return;
    }

    const cached = AppUtils.cacheGet(CLIENTS_CACHE_KEY);

    /*
     * Render cached client options immediately.
     */
    if (Array.isArray(cached) && cached.length > 0) {
      renderClientOptions($select, cached);

      if (isForProject !== "forRecords") {
        bindClientChange($select, isForProject);
      }

      refreshClientSelectorInBackground($select, cached, isForProject);

      return;
    }

    /*
     * No usable cache: fetch fresh client data.
     */
    try {
      const [sessionId, signature] = await GcbAuthModule.getAuthArgs();

      return AppUtils.cachedGScriptCall(
        CLIENTS_CACHE_KEY,
        CLIENTS_SERVER_FUNCTION,
        [sessionId, signature],
        (data) => {
          if (!Array.isArray(data)) {
            AppUtils.showError("Client data missing or invalid");

            return;
          }

          renderClientOptions($select, data);

          if (isForProject !== "forRecords") {
            bindClientChange($select, isForProject);
          }
        },
      );
    } catch (error) {
      console.error("[TableClientSelector] Failed to load clients:", error);

      AppUtils.showError(error?.message || "Unable to load client data.");

      throw error;
    }
  }

  /*
   * Refresh client options in the background.
   *
   * Rebuilds the Select2 only when the fresh data
   * differs from the cached data.
   */
  async function refreshClientSelectorInBackground(
    $select,
    cached,
    isForProject = false,
  ) {
    try {
      const [sessionId, signature] = await GcbAuthModule.getAuthArgs();

      AppUtils.cachedGScriptCall(
        CLIENTS_CACHE_KEY,
        CLIENTS_SERVER_FUNCTION,
        [sessionId, signature],
        (fresh) => {
          if (!Array.isArray(fresh)) {
            return;
          }

          if (JSON.stringify(fresh) === JSON.stringify(cached)) {
            return;
          }

          renderClientOptions($select, fresh);

          if (isForProject !== "forRecords") {
            bindClientChange($select, isForProject);
          }
        },
        false,
        true,
      );
    } catch (error) {
      if (handleInvalidSessionError(error)) {
        return;
      }

      console.error("[TableClientSelector] Background refresh failed:", error);
    }
  }

  /*
   * Hard refresh: bypass cache, fetch fresh data,
   * then rebuild the client Select2.
   */
  async function refreshClientSelector(
    selectId = currentSelectId,
    isForProject = false,
  ) {
    const $select = $(selectId);

    if (!$select.length) {
      return;
    }

    AppUtils.cacheClear(CLIENTS_CACHE_KEY);

    try {
      const [sessionId, signature] = await GcbAuthModule.getAuthArgs();

      return AppUtils.cachedGScriptCall(
        CLIENTS_CACHE_KEY,
        CLIENTS_SERVER_FUNCTION,
        [sessionId, signature],
        (data) => {
          if (!Array.isArray(data)) {
            AppUtils.showError("Client data missing or invalid");

            return;
          }

          renderClientOptions($select, data);

          if (isForProject !== "forRecords") {
            bindClientChange($select, isForProject);
          }
        },
        false,
        true,
      );
    } catch (error) {
      console.error("[TableClientSelector] Failed to refresh clients:", error);

      AppUtils.showError(error?.message || "Unable to refresh client data.");

      throw error;
    }
  }

  function renderClientOptions($select, clients) {
    const options = clients
      .filter((client) => client?.name)
      .map((client) => ({
        id: client.name,
        text: client.name,
      }));

    if ($select.hasClass("select2-hidden-accessible")) {
      $select.select2("destroy");
    }

    $select.empty();

    $select.append(new Option("Select Client", "", true, true));

    $select.select2({
      data: options,
      width: "100%",
      placeholder: "Select Client",
      allowClear: true,
    });
  }

  function bindClientChange($select, isForProject) {
    $select
      .off("change.clientSelector")
      .on("change.clientSelector", function () {
        const selectedName = $select.val();

        if (!selectedName) {
          return;
        }

        resetTaskSelectForLoading();

        TableModule.addClientHours(selectedName, true, isForProject);
      });
  }

  function resetTaskSelectForLoading() {
    const $taskSelect = $("#task");

    if (!$taskSelect.length) {
      return;
    }

    $taskSelect.empty().val("");

    if (
      window.jQuery &&
      $.fn.select2 &&
      $taskSelect.hasClass("select2-hidden-accessible")
    ) {
      $taskSelect.select2("destroy");
    }

    $taskSelect.append(new Option("", ""));

    if ($.fn.select2) {
      $taskSelect.select2({
        width: "100%",
        placeholder: "Loading...",
        allowClear: false,
        closeOnSelect: true,
        dropdownParent: $taskSelect.closest(".drawer"),
      });
    }

    $taskSelect.val(null).trigger("change");
  }

  return {
    init,
    destroy,
    initClientSelector,
    refreshClientSelector,
  };
})();

export { TableClientSelector };