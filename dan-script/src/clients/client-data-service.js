import { AppUtils } from "../utils";
import { TableModule } from "../tables/tables";
import { DataTableModule } from "../tables/data-table";
import { ChartModule } from "../charts";
import { ClientTableService } from "./client-table-service";

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

    DataTableModule.showLoader(CLIENT_DATA_TABLE_ID);

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
  function renderActivePaidOwedClients(isSimple = false, debug = false, reset = false) {
    const log = (...args) => debug && console.log(...args);

    const cacheKey = "paidOwedClients";
    const tableId = "#active-clients";

    log("[renderActivePaidOwedClients] loading");

    DataTableModule.showLoader(tableId);

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

        renderPaidOwedTable(data, isSimple);
      },
      debug,
      reset,
    );
  }

  function renderPaidOwedTable(data, isSimple) {
    const tbody = document.querySelector(`${ACTIVE_CLIENTS_TABLE_ID} tbody`);

    if (!tbody) {
      return;
    }

    tbody.classList.add("simple");

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
     * Initialize DataTable after rows have been rendered.
     */
    DataTableModule.init(
      ACTIVE_CLIENTS_TITLE,
      ACTIVE_CLIENTS_TABLE_ID,
      false,
      null,
      isSimple,
    );

    /*
     * Initialize category filter only when the filter exists.
     */
    if (document.getElementById("categoryDtFilter")) {
      ClientTableService.initStatusFilter("categoryDtFilter", "active-clients");
    }
  }

  function createPaidOwedRow(row, index) {
    const tr = document.createElement("tr");

    const chartCanvasId = `clientHoursChart-${index}`;

    const status = String(row?.today || "").trim();
    const isIdle = status.toLowerCase() === "idle";

    const statusValue = isIdle ? "Idle" : "Online";

    const statusHtml = isIdle
        ? `
      <span class="badge bg-danger text-center">
        Idle
      </span>
    `
        : `
      <span class="badge bg-success text-center">
        Online
      </span>
    `;

    tr.innerHTML = `
      <td class="text-center align-middle">
        ${index + 1}
      </td>

      <td class="align-middle">
        ${AppUtils.escapeHtml(row?.client ?? "")}
      </td>

      <td class="align-middle datatable--chart-cell">
        <div class="datatable--row-chart">
          <canvas id="${chartCanvasId}"></canvas>
        </div>
      </td>

      <td class="text-center align-middle">
        ${formatAmount(row?.totalOwed)}
      </td>

      <td class="text-center align-middle">
        ${formatAmount(row?.currentMonthOwed)}
      </td>

      <td class="text-center align-middle">
        ${formatAmount(row?.totalPaid)}
      </td>

    <td
      class="text-center align-middle"
      data-search="${statusValue}"
    >
      ${statusHtml}
    </td>
  `;

    setTimeout(() => {
      const canvas = document.getElementById(chartCanvasId);

      if (!canvas) {
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }

      // Optional: destroy existing chart on this canvas
      const existing = Chart.getChart(canvas);
      if (existing) {
        existing.destroy();
      }

      ChartModule.drawClientPaidOwedHistoryChart(
        ctx,
        `client_paid_owed_history_${index}`, // unique type/key per row
        row?.paidOwedHistory || [],
        false, // animated
        {
          showLabel: false,
          showTooltip: true,
          showLegend: false,
          showXAxis: false,
          showYAxis: true,
          showGrid: false,
        },
      );
    }, 0);

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
