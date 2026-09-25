import { DataTableModule } from "../tables/data-table";
import { AppUtils } from "../utils";

const billingPaidHoursPage = (() => {
  let initialized = false;
  let eventsBound = false;

  let paidHoursData = {
    records: [],
    summary: {},
  };

  const TABLE_ID = "#paid-hours-table";
  const TABLE_TITLE = "Paid Hours";
  const CACHE_KEY = "paidHours";

  function init() {
    if (initialized) {
      return;
    }

    initialized = true;

    bindEvents();
    loadPaidHours();
  }

  function destroy() {
    if (!initialized) {
      return;
    }

    initialized = false;

    DataTableModule.destroy(TABLE_ID);
  }

  function bindEvents() {
    if (eventsBound) {
      return;
    }

    eventsBound = true;

    document.addEventListener("click", handleClick);

    document.addEventListener("change", handleChange);
  }

  function handleClick(event) {
    const button = event.target.closest('[data-action="sync-billing-records"]');

    if (!button) {
      return;
    }

    event.preventDefault();

    AppUtils.confirmAction(
      "syncBillingRecords",
      "Sync Billing Records?",
      "This will scan the client sheets and rebuild the centralized Billing Records sheet. This may take a few moments. Proceed?",
      () => {
        syncBillingRecords(button);
      },
    );
  }

  function handleChange(event) {
    if (
      event.target.id === "paid-hours-year-filter" ||
      event.target.id === "paid-hours-month-filter"
    ) {
      applyFilters();
    }
  }

  function loadPaidHours(forceRefresh = false) {
    DataTableModule.showLoader(TABLE_ID);

    AppUtils.cachedGScriptCall(
      CACHE_KEY,
      "getBillingPaidHours",
      [],
      (data) => {
        if (!data || typeof data !== "object") {
          renderPaidHoursSummary({});
          DataTableModule.showError(TABLE_ID, "Unable to load paid hours.");

          return;
        }

        paidHoursData = {
          records: Array.isArray(data.records) ? data.records : [],
          summary: data.summary || {},
        };

        populateYearFilter();
        applyFilters();
      },
      false,
      forceRefresh,
    );
  }

  function populateYearFilter() {
    const select = document.querySelector("#paid-hours-year-filter");

    if (!select) {
      return;
    }

    const currentValue = select.value || "all";

    const years = new Set();

    paidHoursData.records.forEach((row) => {
      const date = parseRecordDate(row?.[4]);

      if (date) {
        years.add(date.getFullYear());
      }
    });

    const sortedYears = [...years].sort((a, b) => b - a);

    select.innerHTML = `
      <option value="all">
        All Years
      </option>

      ${sortedYears
        .map(
          (year) => `
            <option value="${year}">
              ${year}
            </option>
          `,
        )
        .join("")}
    `;

    if (currentValue === "all" || sortedYears.includes(Number(currentValue))) {
      select.value = currentValue;
    } else {
      select.value = "all";
    }

    AppUtils.initSelect2(".dt-table-filters");
  }

  function applyFilters() {
    const yearSelect = document.querySelector("#paid-hours-year-filter");

    const monthSelect = document.querySelector("#paid-hours-month-filter");

    const selectedYear = yearSelect?.value || "all";

    const selectedMonth = monthSelect?.value || "all";

    const filteredRecords = filterRecords(
      paidHoursData.records,
      selectedYear,
      selectedMonth,
    );

    renderPaidHoursSummaryForFilter(filteredRecords);

    renderPaidHours(filteredRecords);
  }

  function filterRecords(records, selectedYear, selectedMonth) {
    return records.filter((row) => {
      const date = parseRecordDate(row?.[4]);

      if (!date) {
        return false;
      }

      if (
        selectedYear !== "all" &&
        date.getFullYear() !== Number(selectedYear)
      ) {
        return false;
      }

      if (
        selectedMonth !== "all" &&
        date.getMonth() !== Number(selectedMonth)
      ) {
        return false;
      }

      return true;
    });
  }

  function parseRecordDate(value) {
    if (!value) {
      return null;
    }

    const parts = String(value).split("-");

    if (parts.length !== 3) {
      return null;
    }

    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);

    if (
      !Number.isInteger(year) ||
      !Number.isInteger(month) ||
      !Number.isInteger(day)
    ) {
      return null;
    }

    const date = new Date(year, month - 1, day);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  function renderPaidHoursSummaryForFilter(records) {
    let paidHours = 0;

    const clients = new Set();
    const projects = new Set();

    records.forEach((row) => {
      paidHours += Number(row?.[3]) || 0;

      const client = String(row?.[0] || "").trim();

      const project = String(row?.[2] || "").trim();

      if (client) {
        clients.add(client);
      }

      if (project) {
        projects.add(project);
      }
    });

    const totalHours = paidHoursData.records.reduce(
      (total, row) => total + (Number(row?.[3]) || 0),
      0,
    );

    const paidRate = totalHours > 0 ? paidHours / totalHours : 0;

    const setMetric = (name, value) => {
      const element = document.querySelector(`[data-paid-metric="${name}"]`);

      if (element) {
        element.textContent = value;
      }
    };

    setMetric("paid-hours", AppUtils.formatHours(paidHours));

    setMetric("paid-rate", AppUtils.formatPercent(paidRate));

    setMetric("paid-records", records.length.toLocaleString());

    setMetric("clients-paid", clients.size.toLocaleString());

    setMetric("projects-paid", projects.size.toLocaleString());
  }

  function renderPaidHours(data) {
    if (!Array.isArray(data)) {
      DataTableModule.showError(TABLE_ID, "Unable to load paid hours.");

      return;
    }

    if (!data.length) {
      DataTableModule.showEmpty(TABLE_ID, "No paid hour records found.");

      return;
    }

    DataTableModule.renderRows(TABLE_ID, data, createPaidHoursRow);

    DataTableModule.init(TABLE_TITLE, TABLE_ID, false);
  }

  function renderPaidHoursSummary(summary) {
    const metrics = summary || {};

    const setMetric = (name, value) => {
      const element = document.querySelector(`[data-paid-metric="${name}"]`);

      if (element) {
        element.textContent = value;
      }
    };

    setMetric("paid-hours", AppUtils.formatHours(metrics.paidHours ?? 0));

    setMetric("paid-rate", AppUtils.formatPercent(metrics.paidRate ?? 0));

    setMetric(
      "paid-records",
      Number(metrics.paidRecords ?? 0).toLocaleString(),
    );

    setMetric(
      "clients-paid",
      Number(metrics.clientsPaid ?? 0).toLocaleString(),
    );

    setMetric(
      "projects-paid",
      Number(metrics.projectsPaid ?? 0).toLocaleString(),
    );
  }

  function createPaidHoursRow(row) {
    const tr = document.createElement("tr");

    const status = String(row?.[5] ?? "")
      .toUpperCase()
      .replace(/[^A-Z]/g, "");

    tr.innerHTML = `
      <td>
        ${AppUtils.escapeHtml(row?.[0] ?? "")}
      </td>

      <td>
        ${AppUtils.escapeHtml(row?.[1] ?? "")}
      </td>

      <td>
        ${AppUtils.escapeHtml(row?.[2] ?? "")}
      </td>

      <td class="text-center">
        ${AppUtils.formatHours(row?.[3] ?? 0)}
      </td>

      <td>
        ${AppUtils.escapeHtml(formatRecordDate(row?.[4]))}
      </td>

      <td class="text-center">
        <span class="badge bg-success">
          ${AppUtils.escapeHtml(status)}
        </span>
      </td>
    `;

    return tr;
  }

  function formatRecordDate(value) {
    const date = parseRecordDate(value);

    if (!date) {
      return "—";
    }

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function syncBillingRecords(button) {
    const $button = $(button);

    const loading = AppUtils.setButtonLoading($button, false, true);

    google.script.run
      .withSuccessHandler((response) => {
        loading.restore();

        if (!response?.success) {
          AppUtils.showError("Unable to sync Billing Records.");

          return;
        }

        AppUtils.cacheClear(CACHE_KEY);

        loadPaidHours(true);

        AppUtils.showDashboardToast(
          `Billing Records synced: ${response.records} record(s).`,
          "success",
        );
      })
      .withFailureHandler((error) => {
        loading.restore();

        AppUtils.showError(error?.message || "Failed to sync Billing Records.");
      })
      .syncBillingRecords();
  }

  function refreshPaidHours() {
    AppUtils.cacheClear(CACHE_KEY);

    loadPaidHours(true);
  }

  return {
    init,
    destroy,
    loadPaidHours,
    refreshPaidHours,
  };
})();

export { billingPaidHoursPage };
