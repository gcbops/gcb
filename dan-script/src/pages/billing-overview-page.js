import { DataTableModule } from "../tables/data-table";
import { AppUtils } from "../utils";

const billingOverviewPage = (() => {
  let initialized = false;
  let eventsBound = false;

  const TABLE_ID = "#billing-analytics-table";
  const TABLE_TITLE = "Monthly Billing Analytics";
  const CACHE_KEY = "billingAnalytics";

  function init() {
    if (initialized) {
      return;
    }

    initialized = true;

    bindEvents();
    loadBillingAnalytics();
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
  }

  function handleClick(event) {
    const button = event.target.closest(
      '[data-action="refresh-billing-analytics"]',
    );

    if (!button) {
      return;
    }

    event.preventDefault();

    AppUtils.confirmAction(
      "refreshBillingOverview",
      "Refresh Monthly Billing?",
      "This will pull the latest spreadsheet logging updates and sync the monthly billing records. Proceed?",
      () => {
        refreshBillingAnalytics(button);
      },
    );

  }

  function loadBillingAnalytics(log = false, refresh = false, loading) {
    const logMessage = (...args) => {
      if (log) {
        console.log(...args);
      }
    };

    DataTableModule.showLoader(TABLE_ID);

    AppUtils.cachedGScriptCall(
      CACHE_KEY,
      "getBillingAnalytics",
      [],
      (data) => {

        if (!Array.isArray(data)) {
          DataTableModule.showError(
            TABLE_ID,
            "Unable to load billing analytics.",
          );

          return;
        }

        renderBillingAnalytics(data, logMessage, refresh, loading);
      },
      true,
      refresh,
    );
  }

  function renderBillingAnalytics(data, log, refresh = false, loading) {
    if (!Array.isArray(data)) {
      DataTableModule.showError(TABLE_ID, "Unable to load billing analytics.");
      return;
    }

    if (!data.length) {
      DataTableModule.showEmpty(TABLE_ID, "No billing analytics found.");
      return;
    }

    renderBillingOverviewSummary(data);

    DataTableModule.renderRows(TABLE_ID, data, createBillingAnalyticsRow);

    DataTableModule.init(TABLE_TITLE, TABLE_ID, false);

    if (typeof log === "function") {
      log("[BillingOverview] Rendered", data.length, "monthly records");
    }

    if (refresh && loading) {
      AppUtils.showDashboardToast(
        "Billing analytics refreshed successfully.",
        "success",
      );
      loading.restore();
    }
  }

  function renderBillingOverviewSummary(data) {
    const latest = data[data.length - 1];

    if (!latest) {
      return;
    }

    const setMetric = (name, value) => {
      const element = document.querySelector(`[data-billing-metric="${name}"]`);

      if (element) {
        element.textContent = value;
      }
    };

    setMetric("month-label", latest?.[0] ?? "—");

    setMetric("total-hours", AppUtils.formatHours(latest?.[1] ?? 0));

    setMetric("paid-hours", AppUtils.formatHours(latest?.[2] ?? 0));

    setMetric("unpaid-hours", AppUtils.formatHours(latest?.[3] ?? 0));

    setMetric("invoiced-hours", AppUtils.formatHours(latest?.[4] ?? 0));

    setMetric("outstanding-hours", AppUtils.formatHours(latest?.[5] ?? 0));

    setMetric("collection-rate", AppUtils.formatPercent(latest?.[6] ?? 0));

    setMetric("unpaid-rate", AppUtils.formatPercent(latest?.[7] ?? 0));

    setMetric("invoiced-rate", AppUtils.formatPercent(latest?.[8] ?? 0));
  }

  function createBillingAnalyticsRow(row) {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>
        ${AppUtils.escapeHtml(row?.[0] ?? "")}
      </td>

      <td class="text-center">
        ${AppUtils.formatHours(row?.[1] ?? 0)}
      </td>

      <td class="text-center">
        ${AppUtils.formatHours(row?.[2] ?? 0)}
      </td>

      <td class="text-center">
        ${AppUtils.formatHours(row?.[3] ?? 0)}
      </td>

      <td class="text-center">
        ${AppUtils.formatHours(row?.[4] ?? 0)}
      </td>

      <td class="text-center">
        ${AppUtils.formatHours(row?.[5] ?? 0)}
      </td>

      <td class="text-center">
        ${AppUtils.formatPercent(row?.[6] ?? 0)}
      </td>

      <td class="text-center">
        ${AppUtils.formatPercent(row?.[7] ?? 0)}
      </td>

      <td class="text-center">
        ${AppUtils.formatPercent(row?.[8] ?? 0)}
      </td>
    `;

    return tr;
  }

  function refreshBillingAnalytics(button) {
    AppUtils.cacheClear(CACHE_KEY);

    const loading = AppUtils.setButtonLoading(button, false, true);
    loadBillingAnalytics(false, true, loading);
  }

  return {
    init,
    destroy,
    loadBillingAnalytics,
    refreshBillingAnalytics,
  };
})();

export { billingOverviewPage };
