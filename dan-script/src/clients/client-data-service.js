import { AppUtils } from "../utils";
import { TableModule } from "../tables/tables";
import { DataTableModule } from "../tables/data-table";

const ClientDataService = (() => {
  const ACTIVE_CLIENTS_TABLE_ID = "#active-clients";
  const ACTIVE_CLIENTS_TITLE = "Active Clients";
  const CLIENT_DATA_TABLE_ID = "#table";

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

    DataTableModule.showLoader(CLIENT_DATA_TABLE_ID, `Loading ${title.toLowerCase()}...`);

    AppUtils.cachedGScriptCall(
      cacheKey,
      "getClientDataByStatus",
      [category, sourceSheet],
      (data) => {
        handleClientDataResponse(data, title, log);
      },
      debug,
    );
  }

  function handleClientDataResponse(data, title, log) {
    log("[renderClientDataByStatus] callback data:", data);

    if (!Array.isArray(data)) {
      log("[renderClientDataByStatus] invalid data", data);

      AppUtils.showError("⚠️ Invalid client data.");

      return;
    }

    TableModule.renderClientData(data, title);
  }

  function getCacheKey(category) {
    return `cache_${category.replace(/\s+/g, "")}`;
  }

  /*
   * Load Paid & Owed client data.
   *
   * Source:
   * Paid & Owed Log!O:S
   */
  function renderActivePaidOwedClients(debug = false, reset = false) {
    const log = (...args) => debug && console.log(...args);

    const cacheKey = "paidOwedClients";
    const tableId = "#active-clients";

    log("[renderActivePaidOwedClients] loading");

    DataTableModule.showLoader(tableId, "Loading active clients...");

    AppUtils.cachedGScriptCall(
      cacheKey,
      "getActiveClientsPaidOwed",
      [],
      (data) => {
        log("[renderActivePaidOwedClients] callback:", data);

        if (!Array.isArray(data)) {
          AppUtils.showError("⚠️ Invalid paid & owed data.");
          return;
        }

        renderPaidOwedTable(data);
      },
      debug,
      reset,
    );
  }

  function renderPaidOwedTable(data) {
    const tbody = document.querySelector(`${ACTIVE_CLIENTS_TABLE_ID} tbody`);

    if (!tbody) {
      return;
    }

    /*
     * No data.
     */
    if (!data.length) {
      DataTableModule.showEmpty(
        ACTIVE_CLIENTS_TABLE_ID,
        "No active clients found.",
      );

      return;
    }

    tbody.innerHTML = "";

    data.forEach((row, index) => {
      tbody.appendChild(createPaidOwedRow(row, index));
    });

    /*
     * Initialize after rows have been rendered.
     */
    DataTableModule.init(ACTIVE_CLIENTS_TITLE, ACTIVE_CLIENTS_TABLE_ID);
  }

  function createPaidOwedRow(row, index) {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td class="text-center">
        ${index + 1}
      </td>

      <td>
        ${AppUtils.escapeHtml(row.client ?? "")}
      </td>

      <td class="text-center">
        ${formatAmount(row.totalOwed)}
      </td>

      <td class="text-center">
        ${formatAmount(row.currentMonthOwed)}
      </td>

      <td class="text-center">
        ${formatAmount(row.totalPaid)}
      </td>

      <td class="text-center">
        ${AppUtils.escapeHtml(row.today ?? "")}
      </td>
    `;

    return tr;
  }

  function formatAmount(value) {
    return (Number(value) || 0).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  return {
    renderClientDataByStatus,
    renderActivePaidOwedClients,
  };
})();

export { ClientDataService };
