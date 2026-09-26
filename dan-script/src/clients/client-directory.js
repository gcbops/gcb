import { ProfilePopoverModule } from "../profile/profile-popover";
import { TableClientSelector } from "../tables/client-selector";
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

    ProfilePopoverModule.init();
    ProfilePopoverModule.setProfileBuilder(
      getClientProfilePopoverOptions,
    );

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
    ProfilePopoverModule.setClientData(data);

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
        data-profile-client-action="add-hours"
        data-client-name="${AppUtils.escapeHtml(client.name)}"
      >
        <i class="pe-7s-magic-wand"></i>
        <span>Add Hours</span>
      </button>

      <button
        type="button"
        class="app-profile-popover-action btn-transition btn btn-outline-link"
        data-profile-client-action="open-sheet"
        data-client-name="${AppUtils.escapeHtml(client.name)}"
      >
        <i class="pe-7s-edit"></i>
        <span>Open Sheet</span>
      </button>
    `,
    };
  }

  //   function getClientProfilePopoverOptions(client) {
  //   return {
  //     content: `
  //     <div class="small text-muted mb-2">
  //       Collection Rate
  //     </div>

  //     <div class="fw-semibold">
  //       ${formatPercent(client.collectionRate)}
  //     </div>
  //   `,

  //     actions: `
  //     <button
  //       type="button"
  //       class="btn btn-gc btn-sm"
  //       data-profile-client-action="details"
  //       data-client-name="${AppUtils.escapeHtml(client.name)}"
  //     >
  //       View Client
  //     </button>

  //     <button
  //       type="button"
  //       class="btn btn-outline-gc btn-sm"
  //       data-profile-client-action="open-sheet"
  //       data-client-name="${AppUtils.escapeHtml(client.name)}"
  //     >
  //       Open Sheet
  //     </button>
  //   `,
  //   };
  // }

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
