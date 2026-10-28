import {
  getAuthArgs,
  handleInvalidSessionError,
} from "../auth/auth-error-handler.js";
import { ProfilePopoverModule } from "./profile-popover.js";
import { TableClientSelector } from "../tables/client-selector";
import { DataTableModule } from "../components/data-table.js";
import { AppUtils } from "../utils/utils.js";

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

    ProfilePopoverModule.init();
    ProfilePopoverModule.setProfileBuilder(getClientProfilePopoverOptions);

    loadClientDirectory(source);
    TableClientSelector.init();
  }

  function destroy() {
    if (!initialized) {
      return;
    }

    initialized = false;
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

  async function fetchClientDirectory(source, callback = null) {
    try {
      const [sessionId, signature] = await getAuthArgs();

      AppUtils.cachedGScriptCall(
        source,
        SERVER_FUNCTION,
        [sessionId, signature],
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
    } catch (error) {
      if (handleInvalidSessionError(error)) {
        return;
      }

      AppUtils.showError(error?.message || "Failed to load client directory.");
    }
  }

  /*
   * Explicitly refresh the client directory.
   *
   * This is used by the manual Sync/Refresh action.
   */
  async function refreshClientDirectory(
    button = false, 
    source = CACHE_KEY,
    callback = null,
  ) {
    DataTableModule.showLoader(TABLE_ID);

    let loading = false;

    if(button) {
      loading = AppUtils.setButtonLoading(button, false, true);
    }

    /*
     * Clear the client cache so the next request
     * cannot use stale client data.
     */
    AppUtils.cacheClear(source);

    try {
      const [sessionId, signature] = await getAuthArgs();

      AppUtils.cachedGScriptCall(
        source,
        SERVER_FUNCTION,
        [sessionId, signature],
        (data) => {
          if(loading) {
            loading.restore();
          }

          if (!Array.isArray(data)) {
            AppUtils.showDashboardToast(
              "Something went wrong refreshing clients!",
              "error",
            );

            return;
          }

          renderClientDirectory(data, callback, loading);
        },
        false,
        true,
      );
    } catch (error) {
      loading.restore();

      if (handleInvalidSessionError(error)) {
        return;
      }

      AppUtils.showError(
        error?.message || "Failed to refresh client directory.",
      );
    }
  }

  /*
   * Refresh the client directory in the background.
   *
   * Used after cached data has already been rendered.
   * Does not show a loader or toast.
   */
  async function refreshClientDirectoryInBackground(source, cached) {
    try {
      const [sessionId, signature] = await getAuthArgs();

      AppUtils.cachedGScriptCall(
        source,
        SERVER_FUNCTION,
        [sessionId, signature],
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
    } catch (error) {
      if (handleInvalidSessionError(error)) {
        return;
      }

      console.error("[ClientDirectory] Background refresh failed:", error);
    }
  }

  function renderClientDirectory(data, callback = null, loading = false) {
    ProfilePopoverModule.setClientData(data);

    const tbody = document.getElementById(TABLE_BODY_ID);

    if (!tbody) {
      return;
    }

    DataTableModule.hideTableOverlay(TABLE_ID);

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

    DataTableModule.init(TABLE_TITLE, TABLE_ID, false, {
      paging: false,
      scrollY: "420px",
      layout: {
        topStart: null,
        topEnd: null,
        bottomStart: ["info"],
        bottomEnd: ["search"],
      },
    });

    if (typeof callback === "function") {
      callback();
    }
    
    if(loading) {
      loading.restore();
    }
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

    const projects = Number(client?.projects) || 0;
    const hours = Number(client?.hours) || 0;
    const paid = Number(client?.paid) || 0;
    const owed = Number(client?.owed) || 0;
    const collectionRate = Number(client?.collectionRate) || 0;
    const debtExposure = Number(client?.debtExposure) || 0;

    const safeName = AppUtils.escapeHtml(name);

    row.innerHTML = `
    <td class="client-name-cell">
      <span
        class="client-action-name client-profile-trigger"
        role="button"
        tabindex="0"
        data-profile-popover
        data-client-name="${safeName}"
      >
        ${safeName}
      </span>
    </td>

    <td class="text-center">
      ${projects}
    </td>

    <td class="text-center">
      ${formatHours(hours)}
    </td>

    <td class="text-center">
      ${formatAmount(paid)}
    </td>

    <td class="text-center">
      ${formatAmount(owed)}
    </td>

    <td class="text-center">
      ${formatPercent(collectionRate)}
    </td>

    <td class="text-center">
      ${formatPercent(debtExposure)}
    </td>
  `;

    return row;
  }

  function getClientProfilePopoverOptions(client) {
    return {
      profileButton: true,

      actions: `
      <button
        type="button"
        class="app-profile-popover-action btn-transition btn btn-outline-link"
        data-required-role="manager"
        data-profile-client-action="add-hours"
        data-client-name="${AppUtils.escapeHtml(client.name)}"
      >
        <i class="pe-7s-magic-wand"></i>
        <span>Add Hours</span>
      </button>

      <button
        type="button"
        class="app-profile-popover-action btn-transition btn btn-outline-link"
        data-required-capability="clients.edit"
        data-profile-client-action="open-sheet"
        data-client-name="${AppUtils.escapeHtml(client.name)}"
      >
        <i class="pe-7s-edit"></i>
        <span>Open Sheet</span>
      </button>
    `,
    };
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
