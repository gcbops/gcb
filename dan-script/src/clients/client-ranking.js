import { AppUtils } from "../utils";

const clientRankings = (() => {
  const CACHE_KEY = "clientRankings";

  let initialized = false;

  function init() {
    if (initialized) {
      return;
    }

    initialized = true;

    load();
  }

  function destroy() {
    initialized = false;
  }

  function load(reset = false) {

    AppUtils.cachedGScriptCall(
      CACHE_KEY,
      "getClientRankings",
      [],
      (data) => {
        if (!data || typeof data !== "object") {
          showError();
          return;
        }

        renderOverview(data.overview || {});
        renderRankings(data.rankings || {});
      },
      false,
      reset,
    );

  }

  function refresh() {
    load(true);
  }

  function renderOverview(overview) {
    setText(
      '[data-metric="total-clients"]',
      formatNumber(overview.totalClients),
    );

    setText('[data-metric="total-hours"]', formatHours(overview.totalHours));

    setText(
      '[data-metric="collection-rate"]',
      formatPercent(overview.collectionRate),
    );
  }

  function renderRankings(rankings) {
    renderRanking('[data-ranking="top-clients"]', rankings.topClients, {
      valueKey: "netPaid",
      valueLabel: "Net Paid",
      valueType: "amount",
      icon: "fa-trophy",
      iconClass: "client-icon-primary",
    });

    renderRanking('[data-ranking="top-paid"]', rankings.topPaid, {
      valueKey: "paid",
      valueLabel: "Paid",
      valueType: "amount",
      icon: "fa-money-bill-wave",
      iconClass: "client-icon-success",
    });

    renderRanking('[data-ranking="highest-hours"]', rankings.highestHours, {
      valueKey: "hours",
      valueLabel: "Hours",
      valueType: "hours",
      icon: "fa-clock",
      iconClass: "client-icon-info",
    });

    renderRanking('[data-ranking="highest-owed"]', rankings.highestOwed, {
      valueKey: "owed",
      valueLabel: "Owed",
      valueType: "amount",
      icon: "fa-credit-card",
      iconClass: "client-icon-warning",
    });

    renderRanking('[data-ranking="best-collection"]', rankings.bestCollection, {
      valueKey: "collectionRate",
      valueLabel: "Collection",
      valueType: "percent",
      icon: "fa-chart-line",
      iconClass: "client-icon-success",
    });

    renderRanking(
      '[data-ranking="highest-debt-exposure"]',
      rankings.highestDebtExposure,
      {
        valueKey: "debtExposure",
        valueLabel: "Debt Exposure",
        valueType: "percent",
        icon: "fa-triangle-exclamation",
        iconClass: "client-icon-danger",
      },
    );
  }

  function renderRanking(selector, clients, config) {
    const container = document.querySelector(selector);

    if (!container) {
      return;
    }

    container.innerHTML = "";

    if (!Array.isArray(clients) || !clients.length) {
      container.innerHTML = `
        <div class="client-loading text-muted">
          No ranking data available.
        </div>
      `;

      return;
    }

    clients.forEach((client, index) => {
      container.appendChild(createRankingItem(client, index, config));
    });
  }

  function renderTopPaidClients() {
    renderLegacyRanking("#top-paid-clients", "topPaid", {
      valueKey: "paid",
      valueLabel: "Paid",
      valueType: "amount",
      iconClass: "client-icon-success",
      icon: "fa-money-bill-wave",
    });
  }

  function renderLegacyRanking(listSelector, rankingKey, config) {
    AppUtils.cachedGScriptCall(CACHE_KEY, "getClientRankings", [], (data) => {
      const list = document.querySelector(listSelector);

      if (!list) {
        return;
      }

      const clients = data?.rankings?.[rankingKey];

      list.innerHTML = "";

      if (!Array.isArray(clients) || !clients.length) {
        list.innerHTML = `
            <div class="client-loading text-muted">
              No ranking data available.
            </div>
          `;
        return;
      }

      clients.forEach((client, index) => {
        list.appendChild(createLegacyRankingItem(client, index, config));
      });
    });
  }

  function createRankingItem(client, index, config) {
    const item = document.createElement("div");

    item.className = "client-item";

    const name = AppUtils.escapeHtml(String(client.client ?? ""));

    const value = formatValue(client[config.valueKey], config.valueType);

    item.innerHTML = `
      <div class="client-position">
        ${index + 1}
      </div>

      <div class="client-avatar">
        ${AppUtils.getInitials(client.client ?? "")}
      </div>

      <div class="client-client">
        <div class="client-client-name">
          ${name}
        </div>

        <div class="client-client-meta">
          ${config.valueLabel}
        </div>
      </div>

      <div class="client-value">
        ${value}
      </div>
    `;

    return item;
  }

  function createLegacyRankingItem(client, index, config) {
    const item = document.createElement("div");

    item.className = "client-item";

    const name = AppUtils.escapeHtml(String(client?.client ?? ""));

    const value = formatValue(client?.[config.valueKey], config.valueType);

    item.innerHTML = `

      <div class="client-client">
        <div class="client-client-name">
          ${name}
        </div>

        <div class="client-client-meta">
          ${AppUtils.escapeHtml(config.valueLabel)}
        </div>
      </div>

      <div class="client-value">
        ${value}
      </div>
    `;

    // item.innerHTML = `
    //   <div class="client-position">
    //     ${index + 1}
    //   </div>

    //   <div class="client-avatar ${config.iconClass || ""}">
    //     ${
    //       config.icon
    //         ? `<i class="fa ${config.icon}"></i>`
    //         : AppUtils.escapeHtml(initials)
    //     }
    //   </div>

    //   <div class="client-client">
    //     <div class="client-client-name">
    //       ${name}
    //     </div>

    //     <div class="client-client-meta">
    //       ${AppUtils.escapeHtml(config.valueLabel)}
    //     </div>
    //   </div>

    //   <div class="client-value">
    //     ${value}
    //   </div>
    // `;

    return item;
  }

  function formatValue(value, type) {
    const number = Number(value) || 0;

    if (type === "percent") {
      return formatPercent(number);
    }

    if (type === "hours") {
      return formatHours(number);
    }

    return number.toLocaleString("en-PH", {
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

  function formatNumber(value) {
    return (Number(value) || 0).toLocaleString("en-PH");
  }

  function setText(selector, value) {
    const element = document.querySelector(selector);

    if (element) {
      element.textContent = value;
    }
  }

  function showError() {
    AppUtils.showError("⚠️ Unable to load client rankings.");
  }

  return {
    init,
    destroy,
    refresh,

    // Legacy widgets still used by existing pages
    renderTopPaidClients
  };
})();

export { clientRankings };
