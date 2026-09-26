import { AppUtils } from "../utils";
import { TableModule } from "../tables/tables";
import { DataTableModule } from "../tables/data-table";
import { ChartModule } from "../charts";
import { TableFilterService } from "../tables/table-filter-service";

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
      TableFilterService.init(
        "categoryDtFilter",
        "active-clients",
        6,
        "client-status",
        "all",
      );
    }
  }

  function renderActiveClients(debug = false, reset = false) {
    const log = (...args) => debug && console.log(...args);

    const cacheKey = "paidOwedClients";

    AppUtils.cachedGScriptCall(
      cacheKey,
      "getActiveClientsPaidOwed",
      [],
      (data) => {
        log("[renderActiveClients] callback:", data);

        if (!Array.isArray(data)) {
          AppUtils.showError("⚠️ Invalid active client data.");
          return;
        }

        renderActiveClientList(data);
      },
      debug,
      reset,
    );
  }

  function renderActiveClientList(data) {
    const container = document.getElementById("active-clients-list");

    if (!container) {
      return;
    }

    const parent = container.parentElement;

    if (!parent) {
      return;
    }

    container.innerHTML = "";
    container.classList.remove("scrollable");

    parent.querySelector("#active-clients-count")?.remove();

    const summary = document.getElementById("today-hours-summary");

    if (summary) {
      summary.hidden = false;
      summary.classList.remove("is-collapsing");
    }

    if (!Array.isArray(data) || !data.length) {
      container.innerHTML = `
      <div class="text-muted text-center py-3">
        No active clients found.
      </div>
    `;

      return;
    }

    data.forEach((client) => {
      container.appendChild(createActiveClientItem(client));
    });

    const remaining = Math.max(data.length - 4, 0);

    if (remaining > 0) {
      const more = document.createElement("div");

      more.id = "active-clients-count";
      more.className = "active-clients-count text-center text-muted fs-7 mt-3";
      more.setAttribute("role", "button");
      more.setAttribute("tabindex", "0");
      more.setAttribute("aria-controls", "today-hours-summary");
      more.setAttribute("aria-expanded", "false");
      more.textContent = `+${remaining} more active clients`;

      parent.appendChild(more);

      setupActiveClientsToggle(container, more, remaining);
    }
  }

  function setupActiveClientsToggle(container, more, remaining) {
    const summary = document.getElementById("today-hours-summary");

    if (!summary) {
      return;
    }

    const toggleSummary = () => {
      const isHidden = summary.classList.contains("is-collapsing");

      if (isHidden) {
        showTodaySummary(summary, more, remaining, container);
      } else {
        hideTodaySummary(summary, more, container);
      }
    };

    more.addEventListener("click", toggleSummary);

    more.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleSummary();
      }
    });
  }

  function hideTodaySummary(summary, more, container) {
    summary.classList.add("is-collapsing");

    more.setAttribute("aria-expanded", "true");
    more.textContent = "Show today summary";

    summary.addEventListener(
      "transitionend",
      (e) => {
        if (e.propertyName !== "max-height") {
          container.classList.add("scrollable", "scrollbar-hover");
          return;
        }

        summary.hidden = true;
      },
      { once: true },
    );
  }

  function showTodaySummary(summary, more, remaining, container) {
    container.classList.remove("scrollable", "scrollbar-hover");

    summary.hidden = false;

    summary.offsetHeight;

    summary.classList.remove("is-collapsing");

    more.setAttribute("aria-expanded", "false");
    more.textContent = `+${remaining} more active clients`;
  }

  function createActiveClientItem(client) {
    const item = document.createElement("div");

    item.className =
      "client-activity-active-client d-flex align-items-center mb-4";

    const status = String(client?.today || "").trim();

    const isIdle = status.toLowerCase() === "idle";

    const statusClass = isIdle ? "bg-danger" : "bg-success";

    const name = AppUtils.escapeHtml(String(client?.client || "").trim());

    const initials = AppUtils.escapeHtml(
      AppUtils.getInitials(client?.client || ""),
    );

    item.innerHTML = `
    <div class="avatar-circle bg-light text-info rounded-circle
                d-flex align-items-center justify-content-center me-2">
      ${initials}
    </div>

    <div class="flex-grow-1 text-truncate">
      <div class="fw-normal text-truncate">
        ${name}
      </div>

      <div class="text-muted fs-8">
        ${formatAmount(client?.totalPaid)} paid
      </div>
    </div>

    <span
      class="rounded-circle ${statusClass} me-0 me-lg-2"
      style="width:8px;height:8px;"
      title="${isIdle ? "Idle" : "Online"}"
    ></span>
  `;

    return item;
  }

  function createPaidOwedRow(row, index) {
    const tr = document.createElement("tr");

    const chartCanvasId = `clientHoursChart-${index}`;

    const status = String(row?.today || "").trim();
    const isIdle = status.toLowerCase() === "idle";

    const statusValue = isIdle ? "Idle" : "Online";

    const safeName = AppUtils.escapeHtml(row?.client ?? "");

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

      <td 
        class="align-middle client-action-name"
        role="button"
        tabindex="0"
        data-client-details
        data-client-name="${safeName}"
      >
        ${safeName}
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
    renderActiveClients,
  };
})();

export { ClientDataService };
