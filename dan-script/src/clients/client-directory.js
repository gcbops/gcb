import { DataTableModule } from "../tables/data-table";
import { AppUtils } from "../utils";

const ClientDirectory = (() => {
  let initialized = false;

  const TABLE_ID = "#clientsTable";
  const TABLE_TITLE = "Clients";
  const TABLE_BODY_ID = "dataBody";
  const CACHE_KEY = "clientDirectoryData";
  const SERVER_FUNCTION = "getClientDirectoryData";

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
    AppUtils.cachedGScriptCall(source, SERVER_FUNCTION, [], (data) => {
      if (!Array.isArray(data)) {
        AppUtils.showDashboardToast(
          "Something went wrong loading clients!",
          "error",
        );

        return;
      }

      renderClientDirectory(data, callback);
    });
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
      SERVER_FUNCTION,
      [],
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
      SERVER_FUNCTION,
      [],
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

    renderSummary(data);

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

    data.forEach((client) => {
      tbody.appendChild(createClientDirectoryRow(client));
    });

    DataTableModule.init(TABLE_TITLE, TABLE_ID, false, callback);
  }

  function renderSummary(data) {
    if (!Array.isArray(data) || !data.length) {
      setMetric("total-clients", 0);
      setMetric("total-hours", 0, "h");
      setMetric("total-paid", 0);
      setMetric("total-owed", 0);

      return;
    }

    const totalClients = data.length;

    const totalHours = data.reduce(
      (total, client) => total + (Number(client?.hours) || 0),
      0,
    );

    const totalPaid = data.reduce(
      (total, client) => total + (Number(client?.paid) || 0),
      0,
    );

    const totalOwed = data.reduce(
      (total, client) => total + (Number(client?.owed) || 0),
      0,
    );

    setMetric("total-clients", totalClients);
    setMetric("total-hours", totalHours, "h");
    setMetric("total-paid", totalPaid);
    setMetric("total-owed", totalOwed);
  }

  function setMetric(name, value, suffix = "") {
    const element = document.querySelector(`[data-metric="${name}"]`);

    if (!element) {
      return;
    }

    const number = Number(value) || 0;

    element.textContent = `${number.toLocaleString("en-PH", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}${suffix}`;
  }

  function createClientDirectoryRow(client) {
    const row = document.createElement("tr");

    const name = String(client?.name || "").trim();
    const role = String(client?.role || "").trim();

    const projects = Number(client?.projects) || 0;
    const hours = Number(client?.hours) || 0;
    const paid = Number(client?.paid) || 0;
    const owed = Number(client?.owed) || 0;
    const collectionRate = Number(client?.collectionRate) || 0;
    const debtExposure = Number(client?.debtExposure) || 0;

    const externalUrl = String(client?.externalUrl || "").trim();

    const initials = AppUtils.getInitials(name);
    const safeName = AppUtils.escapeHtml(name);
    const safeRole = AppUtils.escapeHtml(role);
    const safeExternalUrl = AppUtils.escapeHtml(externalUrl);

    row.innerHTML = `
    <td class="client-name-cell">
      <!-- Desktop version -->
      <div class="client-name-desktop">
        <div class="widget-content p-0">
          <div class="widget-content-wrapper">
            <div class="widget-content-left me-2 me-lg-3">
              <div
                class="avatar-circle bg-light text-info rounded-circle
                       d-flex align-items-center justify-content-center"
                aria-hidden="true"
              >
                ${AppUtils.escapeHtml(initials)}
              </div>
            </div>

            <div class="widget-content-left flex2">
              <div class="widget-heading">
                ${safeName}
              </div>

              <div class="widget-subheading opacity-7">
                ${safeRole}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Mobile version -->
      <span class="client-name-mobile">
        ${safeName}
      </span>
    </td>

    <td class="text-center text-muted">
      ${projects}
    </td>

    <td class="text-center text-muted">
      ${formatHours(hours)}
    </td>

    <td class="text-center text-muted">
      ${formatAmount(paid)}
    </td>

    <td class="text-center text-muted">
      ${formatAmount(owed)}
    </td>

    <td class="text-center text-muted">
      ${formatPercent(collectionRate)}
    </td>

    <td class="text-center text-muted">
      ${formatPercent(debtExposure)}
    </td>

    <td class="text-center action-btn-group">
      <button
        type="button"
        class="btn action-btn open-client-btn"
        title="Open Client Sheet"
        aria-label="Open ${safeName} sheet"
        data-external-url="${safeExternalUrl}"
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

    // Get the <tr> that directly contains the button (could be child row or main row)
    const immediateRow = button.closest("tr");

    if (!immediateRow) {
      return;
    }

    const table = $(immediateRow).closest("table")[0];
    const api = $(table).DataTable();

    let rowNode;

    // If the row is a Responsive child row, get its parent data row
    if (immediateRow.classList.contains("child")) {
      // The previous <tr> is the parent data row
      rowNode = immediateRow.previousElementSibling;
    } else {
      rowNode = immediateRow;
    }

    if (!rowNode) {
      return;
    }

    // Get DataTables row data using the row node
    const rowData = api.row(rowNode).data();

    // Prefer data from rowData if your object has clientName there
    let clientName = rowData?.clientName || rowData?.name || rowData?.Client;

    // Fallback to DOM if needed
    if (!clientName) {
      clientName = rowNode
        .querySelector(".widget-heading")
        ?.textContent?.trim();
    }

    if (!clientName) {
      console.warn("[ClientDirectory] Could not determine client name");
      return;
    }

    const externalUrl = button.dataset.externalUrl?.trim();

    if (externalUrl) {
      AppUtils.showDashboardToast(
        "Redirecting to external client sheet!",
        "info",
      );

      window.open(externalUrl, "_blank");

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

  function formatAmount(value) {
    return (Number(value) || 0).toLocaleString("en-PH", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  }

  function formatHours(value) {
    return `${(Number(value) || 0).toLocaleString("en-PH", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}h`;
  }

  function formatPercent(value) {
    return `${((Number(value) || 0) * 100).toFixed(2)}%`;
  }

  return {
    init,
    destroy,
    refreshClientDirectory,
  };
})();

export { ClientDirectory };
