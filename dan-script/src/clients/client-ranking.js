import { AppUtils } from "../utils";

const ClientRanking = (() => {
  function renderTopPaidClients() {
    renderClientRanking({
      cacheKey: "topPaidClients",
      listSelector: "#top-paid-clients",
      avatarClass: "bg-malibu-beach",
      sortFn: sortTopPaid,
      rightContentFn: getTopPaidRightContent,
    });
  }

  function renderLowestPaidClients() {
    renderClientRanking({
      cacheKey: "lowestPaidClients",
      listSelector: "#lowest-paid-clients",
      avatarClass: "bg-love-kiss",
      sortFn: sortLowestPaid,
      rightContentFn: getLowestPaidRightContent,
    });
  }

  function renderClientRanking(config) {
    AppUtils.cachedGScriptCall(
      config.cacheKey,
      "getTopPaidClients",
      [],
      (data) => {
        if (!Array.isArray(data) || !data.length) {
          return;
        }

        const ul = document.querySelector(config.listSelector);

        if (!ul) {
          return;
        }

        ul.innerHTML = "";

        const sorted = config.sortFn([...data]);

        renderRankingList(ul, sorted, config);
      },
    );
  }

  function renderRankingList(ul, clients, config) {
    clients.forEach((client) => {
      createRankingItem(ul, client, config);
    });
  }

  function createRankingItem(ul, client, config) {
    const [name, paid, owed] = client;

    AppUtils.cachedGScriptCall(
      `role_${name}`,
      "getRoleFromSheet",
      [name],
      (role) => {
        role = role || "";

        const li = document.createElement("li");
        li.className = "list-group-item";

        li.innerHTML = `
          <div class="widget-content p-0">
            <div class="widget-content-wrapper">

              <div class="widget-content-left mr-3">
                <div
                  class="avatar-circle swatch-holder swatch-holder-lg ${config.avatarClass}
                  text-white rounded-circle d-flex align-items-center justify-content-center"
                  style="width:42px;height:42px;font-weight:600;">
                  ${AppUtils.getInitials(name)}
                </div>
              </div>

              <div class="widget-content-left">
                <div class="widget-heading">${name}</div>
                <div class="widget-subheading">${role}</div>
              </div>

              <div class="widget-content-right font-weight-bold">
                ${config.rightContentFn(paid, owed)}
              </div>

            </div>
          </div>
        `;

        ul.appendChild(li);
      },
    );
  }

  function sortTopPaid(data) {
    return data.sort((a, b) => (b[1] || 0) - (a[1] || 0)).slice(0, 10);
  }

  function sortLowestPaid(data) {
    return data
      .sort((a, b) => {
        const paidDiff = (a[1] || 0) - (b[1] || 0);

        if (paidDiff !== 0) {
          return paidDiff;
        }

        return (b[2] || 0) - (a[2] || 0);
      })
      .slice(0, 10);
  }

  function getTopPaidRightContent(paid, owed) {
    if (owed === 0) {
      return `
        <div class="font-size-xs text-muted">
          <small class="opacity-5 pr-1">$</small>
          <span>${paid}</span>
          <small class="text-warning pl-2">
            <i class="fa fa-dot-circle"></i>
          </small>
        </div>
      `;
    }

    return `
      <div class="font-size-xs text-muted">
        <span>${paid}</span>
        <small class="text-success pl-2">
          <i class="fa fa-angle-up"></i>
        </small>
      </div>

      <div class="font-size-xs text-muted">
        <span>${owed}</span>
        <small class="text-danger pl-2">
          <i class="fa fa-angle-down"></i>
        </small>
      </div>
    `;
  }

  function getLowestPaidRightContent(paid, owed) {
    let html = `
      <div class="font-size-xs text-muted">
        <span>${paid}</span>
        <small class="text-danger pl-2">
          <i class="fa fa-angle-down"></i>
        </small>
      </div>
    `;

    if (owed > 0) {
      html += `
        <div class="font-size-xs text-muted">
          <span>${owed}</span>
          <small class="text-warning pl-2">
            <i class="fa fa-exclamation-circle"></i>
          </small>
        </div>
      `;
    }

    return html;
  }

  return {
    renderTopPaidClients,
    renderLowestPaidClients,
  };
})();

export { ClientRanking };
