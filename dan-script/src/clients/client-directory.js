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

    /*
     * Destroy the DataTable instance so it does not
     * remain active after leaving the page.
     */
    DataTableModule.destroy(TABLE_ID);
  }

  function loadClientDirectory(source = CACHE_KEY) {
    const cached = AppUtils.cacheGet(source);

    /*
     * Render cached data immediately when available.
     */
    if (Array.isArray(cached) && cached.length) {
      renderClientDirectory(cached);

      /*
       * Check for fresh data in the background.
       */
      refreshClientDirectory(source, cached);

      return;
    }

    DataTableModule.showLoader(TABLE_ID, "Loading clients...");

    /*
     * No usable cache.
     * Fetch from Apps Script.
     */
    fetchClientDirectory(source);
  }

  function fetchClientDirectory(source) {
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

        renderClientDirectory(data);
      },
    );
  }

  function refreshClientDirectory(source, cached) {
    /*
     * Force a fresh Apps Script request.
     *
     * cachedGScriptCall() normally stops when valid
     * cache exists, so reset=true is required here.
     */
    AppUtils.cachedGScriptCall(
      source,
      "getClientDataWithNickname",
      [source],
      (fresh) => {
        if (!Array.isArray(fresh)) {
          return;
        }

        if (JSON.stringify(fresh) !== JSON.stringify(cached)) {
          renderClientDirectory(fresh);
        }
      },
      false,
      true,
    );
  }

  function renderClientDirectory(data) {
    const tbody = document.getElementById(TABLE_BODY_ID);

    if (!tbody) {
      return;
    }
    
    if (!Array.isArray(data) || data.length === 0) {
      DataTableModule.showEmpty(TABLE_ID, "No clients found.");
      return;
    }
    
    tbody.innerHTML = "";

    data.forEach((client, index) => {
      tbody.appendChild(createClientDirectoryRow(client, index));
    });

    /*
     * Initialize DataTable only after rows exist.
     */
    DataTableModule.init(TABLE_TITLE, TABLE_ID);
  }

  function createClientDirectoryRow(client, index) {
    const row = document.createElement("tr");

    const initials = AppUtils.getInitials(client.name);

    const status = String(client.status || "").trim();

    const statusHtml =
      status.toLowerCase() === "inactive"
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
      <td class="text-center text-muted font-weight-bold">
        ${index + 1}
      </td>

      <td>
        <div class="widget-content p-0">
          <div class="widget-content-wrapper">
            <div class="widget-content-left me-3">
              <div
                class="avatar-circle bg-malibu-beach text-white rounded-circle d-flex align-items-center justify-content-center"
                style="width:40px;height:40px;font-weight:600;"
              >
                ${AppUtils.escapeHtml(initials)}
              </div>
            </div>

            <div class="widget-content-left flex2">
              <div class="widget-heading">
                ${AppUtils.escapeHtml(client.name)}
              </div>

              <div class="widget-subheading opacity-7">
                ${AppUtils.escapeHtml(client.role)}
              </div>
            </div>
          </div>
        </div>
      </td>

      <td class="text-center text-muted">
        ${AppUtils.escapeHtml(client.projects)}
      </td>

      <td class="text-center text-muted">
        ${AppUtils.escapeHtml(client.paid)}
      </td>

      <td class="text-center text-muted">
        ${AppUtils.escapeHtml(client.owed)}
      </td>

      <td class="text-center">
        ${statusHtml}
      </td>

      <td class="text-center action-btn">
        <i class="pe-7s-note open-client-btn"></i>
      </td>
    `;

    return row;
  }

  function bindClientDirectoryEvents() {
    const tbody = document.getElementById(TABLE_BODY_ID);

    if (!tbody) {
      return;
    }

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

  function handleClientDirectoryClick(e) {
    const btn = e.target.closest(".open-client-btn");

    if (!btn) {
      return;
    }

    const row = btn.closest("tr");

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
        if (url && String(url).startsWith("http")) {
          window.open(url, "_blank");
        } else {
          AppUtils.showError(url);
        }
      })
      .withFailureHandler((err) => {
        AppUtils.showError(err);
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
