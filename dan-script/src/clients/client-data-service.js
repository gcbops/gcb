import { AppUtils } from "../utils";
import { TableModule } from "../tables/tables";
import { DataTableModule } from "../tables/data-table";

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
        handleClientDataResponse(data, title, log);
      },
    );
  }

  function handleClientDataResponse(data, title, log) {
    log("[renderClientDataByStatus] callback data:", data);

    if (!Array.isArray(data)) {
      log("[renderClientDataByStatus] invalid data", data);
      AppUtils.showError("⚠️ invalid dialog data");
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

    log("[renderActivePaidOwedClients] loading");

    AppUtils.cachedGScriptCall(
      cacheKey,
      "getActiveClientsPaidOwed",
      [],
      (data) => {
        log("[renderActivePaidOwedClients] callback:", data);

        if (!Array.isArray(data)) {
          log("[renderActivePaidOwedClients] invalid data:", data);

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
    const $table = $("#active-clients");

    if (!$table.length) {
      return;
    }

    const $tbody = $table.find("tbody");

    $tbody.empty();

    data.forEach((row, index) => {
      $tbody.append(`
        <tr>
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
            ${row.today}
          </td>
        </tr>
      `);
    });

    DataTableModule.init("Active Clients", "#active-clients");
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
