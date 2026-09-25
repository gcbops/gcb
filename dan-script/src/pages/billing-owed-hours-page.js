import { DataTableModule } from "../tables/data-table";
import { AppUtils } from "../utils";

const billingOwedHoursPage = (() => {
  let initialized = false;
  let eventsBound = false;

  let owedHoursData = {
    records: [],
    summary: {},
  };

  const TABLE_ID = "#owed-hours-table";
  const TABLE_TITLE = "Owed Hours";
  const CACHE_KEY = "owedHours";

  function init() {
    if (initialized) {
      return;
    }

    initialized = true;

    bindEvents();
    loadOwedHours();
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
      event.target.id === "owed-hours-year-filter" ||
      event.target.id === "owed-hours-month-filter"
    ) {
      applyFilters();
    }
  }

  function loadOwedHours(forceRefresh = false) {
    DataTableModule.showLoader(TABLE_ID);

    AppUtils.cachedGScriptCall(
      CACHE_KEY,
      "getBillingOwedHours",
      [],
      (data) => {
        if (!data || typeof data !== "object") {
          renderOwedHoursSummary({});

          DataTableModule.showError(TABLE_ID, "Unable to load owed hours.");

          return;
        }

        owedHoursData = {
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
    const select = document.querySelector("#owed-hours-year-filter");

    if (!select) {
      return;
    }

    const currentValue = select.value || "all";

    const years = new Set();

    owedHoursData.records.forEach((row) => {
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
    const yearSelect = document.querySelector("#owed-hours-year-filter");

    const monthSelect = document.querySelector("#owed-hours-month-filter");

    const selectedYear = yearSelect?.value || "all";

    const selectedMonth = monthSelect?.value || "all";

    const filteredRecords = filterRecords(
      owedHoursData.records,
      selectedYear,
      selectedMonth,
    );

    renderOwedHoursSummaryForFilter(filteredRecords);

    renderOwedHours(filteredRecords);
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

  function renderOwedHours(data) {
    if (!Array.isArray(data)) {
      DataTableModule.showError(TABLE_ID, "Unable to load owed hours.");

      return;
    }

    if (!data.length) {
      DataTableModule.showEmpty(TABLE_ID, "No outstanding hour records found.");

      return;
    }

    DataTableModule.renderRows(TABLE_ID, data, createOwedHoursRow);

    DataTableModule.init(TABLE_TITLE, TABLE_ID, false);
  }

  function renderOwedHoursSummary(summary) {
    const metrics = summary || {};

    const setMetric = (name, value) => {
      const element = document.querySelector(`[data-owed-metric="${name}"]`);

      if (element) {
        element.textContent = value;
      }
    };

    setMetric("owed-hours", AppUtils.formatHours(metrics.owedHours ?? 0));

    setMetric("owed-rate", AppUtils.formatPercent(metrics.owedRate ?? 0));

    setMetric(
      "owed-records",
      Number(metrics.owedRecords ?? 0).toLocaleString(),
    );

    setMetric(
      "clients-owed",
      Number(metrics.clientsOwed ?? 0).toLocaleString(),
    );

    setMetric(
      "projects-owed",
      Number(metrics.projectsOwed ?? 0).toLocaleString(),
    );
  }

  function renderOwedHoursSummaryForFilter(records) {
    let owedHours = 0;

    const clients = new Set();
    const projects = new Set();

    records.forEach((row) => {
      owedHours += Number(row?.[3]) || 0;

      const client = String(row?.[0] || "").trim();

      const project = String(row?.[2] || "").trim();

      if (client) {
        clients.add(client);
      }

      if (project) {
        projects.add(project);
      }
    });

    const totalHours = owedHoursData.records.reduce(
      (total, row) => total + (Number(row?.[3]) || 0),
      0,
    );

    const owedRate = totalHours > 0 ? owedHours / totalHours : 0;

    const setMetric = (name, value) => {
      const element = document.querySelector(`[data-owed-metric="${name}"]`);

      if (element) {
        element.textContent = value;
      }
    };

    setMetric("owed-hours", AppUtils.formatHours(owedHours));

    setMetric("owed-rate", AppUtils.formatPercent(owedRate));

    setMetric("owed-records", records.length.toLocaleString());

    setMetric("clients-owed", clients.size.toLocaleString());

    setMetric("projects-owed", projects.size.toLocaleString());
  }

  function createOwedHoursRow(row) {
    const tr = document.createElement("tr");

    function normalizeBillingStatus(value) {
      const status = String(value || "").toUpperCase();

      if (status.includes("DISPUTED")) {
        return "DISPUTED";
      }

      if (status.includes("OUTSTANDING")) {
        return "OUTSTANDING";
      }

      if (status.includes("UNPAID")) {
        return "UNPAID";
      }

      if (status.includes("INVOICED")) {
        return "INVOICED";
      }

      if (status.includes("PAID")) {
        return "PAID";
      }

      return status;
    }
    
    const status = normalizeBillingStatus(row?.[5]);

    const badgeClass = {
      PAID: "bg-success",
      UNPAID: "bg-danger",
      INVOICED: "bg-warning",
      OUTSTANDING: "bg-alternate",
      DISPUTED: "bg-dark",
    }[status] || "bg-secondary";

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
        <span class="badge ${badgeClass}">
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

        loadOwedHours(true);

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

  function refreshOwedHours() {
    AppUtils.cacheClear(CACHE_KEY);

    loadOwedHours(true);
  }

  return {
    init,
    destroy,
    loadOwedHours,
    refreshOwedHours,
  };
})();

export { billingOwedHoursPage };
