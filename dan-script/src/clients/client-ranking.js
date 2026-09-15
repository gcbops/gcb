import { AppUtils } from "../utils";

const ClientRanking = (() => {
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
    renderLegacyRanking(
      "#top-paid-clients",
      "topPaid",
      getTopPaidRightContent,
    );
  }

  function renderLowestPaidClients() {
    renderLegacyRanking(
      "#lowest-paid-clients",
      "highestOwed",
      getLowestPaidRightContent,
    );
  }

  function renderLegacyRanking(
    listSelector,
    rankingKey,
    rightContentFn,
  ) {
    AppUtils.cachedGScriptCall(CACHE_KEY, "getClientRankings", [], (data) => {
      const list = document.querySelector(listSelector);

      if (!list) {
        return;
      }

      const clients = data?.rankings?.[rankingKey];

      if (!Array.isArray(clients) || !clients.length) {
        return;
      }

      list.innerHTML = "";

      clients.forEach((client) => {
        const li = document.createElement("li");

        li.className = "list-group-item";

        li.innerHTML = `
          <div class="widget-content p-0">
            <div class="widget-content-wrapper">

              <div class="widget-content-left me-2 me-lg-3">
                <div
                  class="avatar-circle swatch-holder swatch-holder-lg bg-light
                  text-info rounded-circle d-flex align-items-center justify-content-center">
                  ${AppUtils.getInitials(client.client)}
                </div>
              </div>

              <div class="widget-content-left">
                <div class="widget-heading">
                  ${AppUtils.escapeHtml(client.client)}
                </div>
              </div>

              <div class="widget-content-right font-weight-bold">
                ${rightContentFn(client.paid, client.owed)}
              </div>

            </div>
          </div>
        `;

        list.appendChild(li);
      });
    });
  }

  function getTopPaidRightContent(paid, owed) {
    if (owed === 0) {
      return `
      <div class="font-size-xs text-muted">
        <small class="opacity-5 pe-1">$</small>
        <span>${paid}</span>
        <small class="text-warning ps-2">
          <i class="fa fa-dot-circle"></i>
        </small>
      </div>
    `;
    }

    return `
    <div class="font-size-xs text-muted">
      <span>${paid}</span>
      <small class="text-success ps-2">
        <i class="fa fa-angle-up"></i>
      </small>
    </div>

    <div class="font-size-xs text-muted">
      <span>${owed}</span>
      <small class="text-danger ps-2">
        <i class="fa fa-angle-down"></i>
      </small>
    </div>
  `;
  }

  function getLowestPaidRightContent(paid, owed) {
    let html = `
    <div class="font-size-xs text-muted">
      <span>${paid}</span>
      <small class="text-danger ps-2">
        <i class="fa fa-angle-down"></i>
      </small>
    </div>
  `;

    if (owed > 0) {
      html += `
      <div class="font-size-xs text-muted">
        <span>${owed}</span>
        <small class="text-warning ps-2">
          <i class="fa fa-exclamation-circle"></i>
        </small>
      </div>
    `;
    }

    return html;
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
    renderTopPaidClients,
    renderLowestPaidClients,
  };
})();

export { ClientRanking };
