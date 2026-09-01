import { DataTableModule } from "../tables/data-table";
import { AppUtils } from "../utils";

const ClientDirectory = (() => {
  let initialized = false;

  const TABLE_ID = "#clientsTable";
  const TABLE_TITLE = "Clients";
  const TABLE_BODY_ID = "dataBody";
  const CACHE_KEY = "allClientsData";

  function init(source = CACHE_KEY) {
    if (initialized) {
      return;
    }

    initialized = true;

    bindClientDirectoryEvents();
    loadClientDirectory(source);
  }

  function destroy() {
    if (!initialized) {
      return;
    }

    initialized = false;

    unbindClientDirectoryEvents();
  }

  function loadClientDirectory(source = CACHE_KEY) {
    const cached = AppUtils.cacheGet(source);

    /*
     * Render cached data immediately when available.
     * Then refresh in the background.
     */
    if (Array.isArray(cached) && cached.length > 0) {
      renderClientDirectory(cached);

      refreshClientDirectoryInBackground(source, cached);

      return;
    }

    /*
     * No usable cache.
     * Show the table loader while fetching fresh data.
     */
    DataTableModule.showLoader(TABLE_ID);

    fetchClientDirectory(source);
  }

  function fetchClientDirectory(source, callback = null) {
    AppUtils.cachedGScriptCall(
      source,
      "getClientDataWithNickname",
      [source],
      (data) => {
        if (!Array.isArray(data)) {
          AppUtils.showDashboardToast(
            "Something went wrong loading clients!",
            "error",
          );

          return;
        }

        renderClientDirectory(data, callback);
      },
    );
  }

  /*
   * Explicitly refresh the client directory.
   *
   * This is used by the manual Sync/Refresh action.
   */
  function refreshClientDirectory(source = CACHE_KEY, callback = null) {
    DataTableModule.showLoader(TABLE_ID);

    $("#sync-clients-list i").addClass("fa-spin");

    /*
     * Clear the client cache so the next request
     * cannot use stale client data.
     */
    AppUtils.cacheClear(source);

    AppUtils.cachedGScriptCall(
      source,
      "getClientDataWithNickname",
      [source],
      (data) => {
        $("#sync-clients-list i").removeClass("fa-spin");

        if (!Array.isArray(data)) {
          AppUtils.showDashboardToast(
            "Something went wrong refreshing clients!",
            "error",
          );

          return;
        }

        renderClientDirectory(data, () => {
          if (typeof callback === "function") {
            callback();
          }
        });
      },
      false,
      true,
    );
  }

  /*
   * Refresh the client directory in the background.
   *
   * Used after cached data has already been rendered.
   * Does not show a loader or toast.
   */
  function refreshClientDirectoryInBackground(source, cached) {
    AppUtils.cachedGScriptCall(
      source,
      "getClientDataWithNickname",
      [source],
      (fresh) => {
        if (!Array.isArray(fresh)) {
          return;
        }

        /*
         * Avoid rebuilding the DataTable when
         * the server data has not changed.
         */
        if (JSON.stringify(fresh) === JSON.stringify(cached)) {
          return;
        }

        renderClientDirectory(fresh);
      },
      false,
      true,
    );
  }

  function renderClientDirectory(data, callback = null) {
    const tbody = document.getElementById(TABLE_BODY_ID);

    if (!tbody) {
      return;
    }

    if (!Array.isArray(data) || data.length === 0) {
      DataTableModule.destroy(TABLE_ID);
      DataTableModule.showEmpty(TABLE_ID, "No clients found.");

      return;
    }

    /*
     * Destroy the existing instance before replacing its rows.
     */
    DataTableModule.destroy(TABLE_ID);

    tbody.innerHTML = "";

    data.forEach((client, index) => {
      tbody.appendChild(createClientDirectoryRow(client, index));
    });

    /*
     * Initialize DataTable only after all rows exist.
     */
    DataTableModule.init(TABLE_TITLE, TABLE_ID, false, callback);
  }

  function createClientDirectoryRow(client, index) {
    const row = document.createElement("tr");

    const name = String(client?.name || "").trim();
    const role = String(client?.role || "").trim();
    const projects = String(client?.projects ?? "").trim();
    const paid = String(client?.paid ?? "").trim();
    const owed = String(client?.owed ?? "").trim();
    const status = String(client?.status || "").trim();

    const initials = AppUtils.getInitials(name);

    const isInactive = status.toLowerCase() === "inactive";

    const statusHtml = isInactive
      ? `
        <span class="badge bg-danger text-center">
          Inactive
        </span>
      `
      : `
        <span class="badge bg-success text-center">
          ${AppUtils.escapeHtml(status || "Active")}
        </span>
      `;

    row.innerHTML = `

      <td>
        <div class="widget-content p-0">
          <div class="widget-content-wrapper">
            <div class="widget-content-left me-2 me-lg-3">
              <div
                class="avatar-circle bg-malibu-beach text-white rounded-circle d-flex align-items-center justify-content-center"
              >
                ${AppUtils.escapeHtml(initials)}
              </div>
            </div>

            <div class="widget-content-left flex2">
              <div class="widget-heading">
                ${AppUtils.escapeHtml(name)}
              </div>

              <div class="widget-subheading opacity-7">
                ${AppUtils.escapeHtml(role)}
              </div>
            </div>
          </div>
        </div>
      </td>

      <td class="text-center text-muted">
        ${AppUtils.escapeHtml(projects)}
      </td>

      <td class="text-center text-muted">
        ${AppUtils.escapeHtml(paid)}
      </td>

      <td class="text-center text-muted">
        ${AppUtils.escapeHtml(owed)}
      </td>

      <td class="text-center">
        ${statusHtml}
      </td>

      <td class="text-center action-btn-group">
        <button
          type="button"
          class="btn action-btn open-client-btn"
          title="Open Client Sheet"
          aria-label="Open ${AppUtils.escapeHtml(name)} sheet"
        >
          <i class="pe-7s-note"></i>
        </button>
      </td>
    `;

    return row;
  }

  function bindClientDirectoryEvents() {
    const tbody = document.getElementById(TABLE_BODY_ID);

    if (!tbody) {
      return;
    }

    /*
     * Remove first so repeated initialization never
     * accumulates duplicate handlers.
     */
    tbody.removeEventListener("click", handleClientDirectoryClick);

    tbody.addEventListener("click", handleClientDirectoryClick);
  }

  function unbindClientDirectoryEvents() {
    const tbody = document.getElementById(TABLE_BODY_ID);

    if (!tbody) {
      return;
    }

    tbody.removeEventListener("click", handleClientDirectoryClick);
  }

  function handleClientDirectoryClick(event) {
    const button = event.target.closest(".open-client-btn");

    if (!button) {
      return;
    }

    const row = button.closest("tr");

    if (!row) {
      return;
    }

    const clientName = row
      .querySelector(".widget-heading")
      ?.textContent?.trim();

    if (!clientName) {
      return;
    }

    AppUtils.showDashboardToast("Redirecting to sheet!", "info");

    google.script.run
      .withSuccessHandler((url) => {
        const clientUrl = String(url || "").trim();

        if (clientUrl.startsWith("http")) {
          window.open(clientUrl, "_blank");
          return;
        }

        AppUtils.showError(url);
      })
      .withFailureHandler((error) => {
        console.error("[ClientDirectory] Failed to open client sheet:", error);

        AppUtils.showError(error);
      })
      .goToPresentClient(clientName);
  }

  return {
    init,
    destroy,
    refreshClientDirectory,
  };
})();

export { ClientDirectory };
