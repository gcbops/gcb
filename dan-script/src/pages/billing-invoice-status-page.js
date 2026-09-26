import { DataTableModule } from "../tables/data-table";
import { AppUtils } from "../utils";

const billingInvoiceStatusPage = (() => {
  let initialized = false;
  let eventsBound = false;

  let invoiceData = {
    invoicedRecords: [],
    untrackedRecords: [],
    summary: {},
  };

  const INVOICED_TABLE_ID = "#invoice-status-table";
  const UNTRACKED_TABLE_ID = "#invoice-untracked-table";

  const INVOICED_TABLE_TITLE = "Invoiced Hours";
  const UNTRACKED_TABLE_TITLE = "Hours Without Status";

  const CACHE_KEY = "invoiceStatus";

  function init() {
    if (initialized) {
      return;
    }

    initialized = true;

    bindEvents();
    loadInvoiceStatus();
  }

  function destroy() {
    if (!initialized) {
      return;
    }

    initialized = false;

    DataTableModule.destroy(INVOICED_TABLE_ID);

    DataTableModule.destroy(UNTRACKED_TABLE_ID);
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
      event.target.id === "invoice-status-year-filter" ||
      event.target.id === "invoice-status-month-filter"
    ) {
      applyFilters();
    }
  }

  function loadInvoiceStatus(forceRefresh = false) {
    DataTableModule.showLoader(INVOICED_TABLE_ID);

    DataTableModule.showLoader(UNTRACKED_TABLE_ID);

    AppUtils.cachedGScriptCall(
      CACHE_KEY,
      "getInvoiceStatus",
      [],
      (data) => {
        if (!data || typeof data !== "object") {
          renderInvoiceSummary({});

          DataTableModule.showError(
            INVOICED_TABLE_ID,
            "Unable to load invoice status.",
          );

          DataTableModule.showError(
            UNTRACKED_TABLE_ID,
            "Unable to load hours without status.",
          );

          return;
        }

        invoiceData = {
          invoicedRecords: Array.isArray(data.invoicedRecords)
            ? data.invoicedRecords
            : [],

          untrackedRecords: Array.isArray(data.untrackedRecords)
            ? data.untrackedRecords
            : [],

          summary: data.summary || {},
        };

        renderInvoiceSummary(invoiceData.summary);

        populateYearFilter();

        applyFilters();
      },
      false,
      forceRefresh,
    );
  }

  function renderInvoiceSummary(summary) {
    const metrics = summary || {};

    const setMetric = (name, value) => {
      const element = document.querySelector(`[data-invoice-metric="${name}"]`);

      if (element) {
        element.textContent = value;
      }
    };

    setMetric(
      "invoiced-hours",
      AppUtils.formatHours(metrics.invoicedHours ?? 0),
    );

    setMetric(
      "invoiced-records",
      Number(metrics.invoicedRecords ?? 0).toLocaleString(),
    );

    setMetric(
      "clients-invoiced",
      Number(metrics.clientsInvoiced ?? 0).toLocaleString(),
    );

    setMetric(
      "projects-invoiced",
      Number(metrics.projectsInvoiced ?? 0).toLocaleString(),
    );
  }

  function populateYearFilter() {
    const select = document.querySelector("#invoice-status-year-filter");

    if (!select) {
      return;
    }

    const currentValue = select.value || "all";

    const dates = [
      ...invoiceData.invoicedRecords,
      ...invoiceData.untrackedRecords,
    ];

    const years = new Set();

    dates.forEach((row) => {
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
    const yearSelect = document.querySelector("#invoice-status-year-filter");

    const monthSelect = document.querySelector("#invoice-status-month-filter");

    const selectedYear = yearSelect?.value || "all";

    const selectedMonth = monthSelect?.value || "all";

    const invoicedRecords = filterRecords(
      invoiceData.invoicedRecords,
      selectedYear,
      selectedMonth,
    );

    const untrackedRecords = filterRecords(
      invoiceData.untrackedRecords,
      selectedYear,
      selectedMonth,
    );

    renderInvoiceSummaryForFilter(invoicedRecords);

    renderInvoicedRecords(invoicedRecords);

    renderUntrackedRecords(untrackedRecords);
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

  function renderInvoiceSummaryForFilter(records) {
    const clients = new Set();
    const projects = new Set();

    let hours = 0;

    records.forEach((row) => {
      hours += Number(row?.[3]) || 0;

      const client = String(row?.[0] || "").trim();

      const project = String(row?.[2] || "").trim();

      if (client) {
        clients.add(client);
      }

      if (project) {
        projects.add(project);
      }
    });

    const setMetric = (name, value) => {
      const element = document.querySelector(`[data-invoice-metric="${name}"]`);

      if (element) {
        element.textContent = value;
      }
    };

    setMetric("invoiced-hours", AppUtils.formatHours(hours));

    setMetric("invoiced-records", records.length.toLocaleString());

    setMetric("clients-invoiced", clients.size.toLocaleString());

    setMetric("projects-invoiced", projects.size.toLocaleString());
  }

  function renderInvoicedRecords(data) {
    if (!Array.isArray(data) || !data.length) {
      DataTableModule.showEmpty(
        INVOICED_TABLE_ID,
        "No invoiced hour records found.",
      );

      return;
    }

    DataTableModule.renderRows(INVOICED_TABLE_ID, data, createInvoiceRow);

    DataTableModule.init(INVOICED_TABLE_TITLE, INVOICED_TABLE_ID, false);
  }

  function renderUntrackedRecords(data) {
    if (!Array.isArray(data) || !data.length) {
      DataTableModule.showEmpty(
        UNTRACKED_TABLE_ID,
        "No hour records without a billing status found.",
      );

      return;
    }

    DataTableModule.renderRows(UNTRACKED_TABLE_ID, data, createUntrackedRow);

    DataTableModule.init(UNTRACKED_TABLE_TITLE, UNTRACKED_TABLE_ID, false);
  }

  function createInvoiceRow(row) {
    const tr = document.createElement("tr");

    const status = "INVOICED";

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
      <span class="badge bg-warning">
        ${status}
      </span>
    </td>
  `;

    return tr;
  }

  function createUntrackedRow(row) {
    const tr = document.createElement("tr");

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
  `;

    return tr;
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

        loadInvoiceStatus(true);

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

  function refreshInvoiceStatus() {
    AppUtils.cacheClear(CACHE_KEY);

    loadInvoiceStatus(true);
  }

  return {
    init,
    destroy,
    loadInvoiceStatus,
    refreshInvoiceStatus,
  };
})();

export { billingInvoiceStatusPage };
