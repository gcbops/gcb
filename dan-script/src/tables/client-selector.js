import { TableModule } from "./tables.js";
import { AppUtils } from "../utils.js";
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

    try {
      const [sessionId, signature] = await GcbAuthModule.getAuthArgs();

      AppUtils.cachedGScriptCall(
        CLIENTS_CACHE_KEY,
        CLIENTS_SERVER_FUNCTION,
        [sessionId, signature],
        (data) => {
          if (!Array.isArray(data)) {
            AppUtils.showError("Client data missing or invalid");
            return;
          }

          renderClientOptions($select, data);

          bindClientChange($select, isForProject);
        },
      );
    } catch (error) {
      console.error("[TableClientSelector] Failed to load clients:", error);

      AppUtils.showError(error?.message || "Unable to load client data.");
    }
  }

  function renderClientOptions($select, clients) {
    const options = clients
      .filter((client) => client?.name)
      .map((client) => ({
        id: client.name,
        text: client.name,
      }));

    /*
     * Destroy existing Select2 instance before rebuilding it.
     */
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
        const selectedName = $(this).val();

        if (!selectedName) {
          return;
        }

        TableModule.addClientHours(selectedName, true, isForProject);
      });
  }

  return {
    init,
    destroy,
  };
})();

export { TableClientSelector };
