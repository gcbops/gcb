import { AppUtils } from "../utils";

const ClientDirectory = (() => {
  function loadClientDirectory(source = "allClientsData") {
    bindClientDirectoryEvents();

    const cached = fetchCachedClientDirectory(source);

    if (cached) {

      renderClientDirectory(cached);

      refreshClientDirectory(source, cached);

      return;
    }

    fetchClientDirectory(source);
  }

  function fetchCachedClientDirectory(source) {
    const cached = AppUtils.cacheGet(source);

    if (!Array.isArray(cached) || !cached.length) {
      return null;
    }

    return cached;
  }

  function fetchClientDirectory(source) {

    AppUtils.cachedGScriptCall(
      source,
      "getClientDataWithNickname",
      [source],
      (data) => {

        if (!Array.isArray(data)) {
          AppUtils.showDashboardToast(
            "Something went wrong loading clients!",
            "error",
          );
          return;
        }

        renderClientDirectory(data);
      },
      true,
    );
  }

  function refreshClientDirectory(source, cached) {

    AppUtils.cachedGScriptCall(
      source,
      "getClientDataWithNickname",
      [source],
      (fresh) => {
        if (!Array.isArray(fresh)) {
          return;
        }

        if (JSON.stringify(fresh) !== JSON.stringify(cached)) {
          renderClientDirectory(fresh);
        } 
      },
      true,
    );
  }

  function renderClientDirectory(data) {
    const tbody = document.getElementById("dataBody");
    if (!tbody) {
      return;
    }

    tbody.innerHTML = "";

    data.forEach((client, index) => {
      tbody.appendChild(createClientDirectoryRow(client, index));
    });
  }

  function createClientDirectoryRow(client, index) {
    const row = document.createElement("tr");
    const initials = AppUtils.getInitials(client.name);

    row.innerHTML = `
      <td class="text-center text-muted font-weight-bold">${index + 1}</td>

      <td>
        <div class="widget-content p-0">
          <div class="widget-content-wrapper">
            <div class="widget-content-left mr-3">
              <div
                class="avatar-circle bg-malibu-beach text-white rounded-circle d-flex align-items-center justify-content-center"
                style="width:40px;height:40px;font-weight:600;"
              >
                ${initials}
              </div>
            </div>

            <div class="widget-content-left flex2">
              <div class="widget-heading">${client.name}</div>
              <div class="widget-subheading opacity-7">${client.role || ""}</div>
            </div>
          </div>
        </div>
      </td>

      <td class="text-center text-muted">${client.id || ""}</td>

      <td class="text-center text-muted">${client.city || ""}</td>

      <td class="text-center">
        <div class="badge text-white ${getStatusColor(client.status)}">
          ${client.status || ""}
        </div>
      </td>

      <td class="text-center action-btn">
        <i class="pe-7s-note open-client-btn"></i>
      </td>
    `;

    return row;
  }

  function bindClientDirectoryEvents() {
    const tbody = document.getElementById("dataBody");

    if (!tbody || tbody.dataset.bound) {
      return;
    }

    tbody.dataset.bound = "true";

    tbody.addEventListener("click", handleClientDirectoryClick);
  }

  function handleClientDirectoryClick(e) {
    const btn = e.target.closest(".open-client-btn");
    if (!btn) {
      return;
    }

    const row = btn.closest("tr");
    if (!row) {
      return;
    }

    const clientName = row.querySelector(".widget-heading")?.textContent;

    AppUtils.showDashboardToast("Redirecting to sheet!", "info");

    google.script.run
      .withSuccessHandler((url) => {
        if (url && url.startsWith("http")) {
          window.open(url, "_blank");
        } else {
          AppUtils.showError(url);
        }
      })
      .withFailureHandler((err) => {
        AppUtils.showError(err);
      })
      .goToPresentClient(clientName);
  }

  function getStatusColor(status) {
    if (!status) {
      return "btn-secondary";
    }

    status = status.toLowerCase();

    if (status.includes("online") || status === "active") {
      return "bg-grow-early";
    }

    if (status.includes("idle")) {
      return "bg-sunny-morning";
    }

    if (status.includes("offline") || status === "inactive") {
      return "bg-love-kiss";
    }

    return "btn-secondary";
  }

  return {
    loadClientDirectory,
  };
})();

export { ClientDirectory };
