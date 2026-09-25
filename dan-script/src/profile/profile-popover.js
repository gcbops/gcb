import { RouterModule } from "../routers";
import { TableModule } from "../tables/tables";
import { AppUtils } from "../utils";

const ProfilePopoverModule = (() => {
  let popover = null;

  let showTimer = null;
  let hideTimer = null;

  let clientData = new Map();
  let profileBuilder = null;

  const SHOW_DELAY = 180;
  const HIDE_DELAY = 180;

  function init() {
    if (document.documentElement.dataset.profilePopoverInitialized) {
      return;
    }

    document.documentElement.dataset.profilePopoverInitialized = "true";

    document.addEventListener("mouseover", handleMouseOver);
    document.addEventListener("mouseout", handleMouseOut);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("keydown", handleKeydown);
    document.addEventListener("click", handleActionClick);
  }

  function handleActionClick(event) {
    const profileButton = event.target.closest("[data-profile-action]");

    if (profileButton) {
      handleProfileAction(profileButton);
      return;
    }

    const button = event.target.closest("[data-profile-client-action]");

    if (!button) {
      return;
    }

    const action = button.dataset.profileClientAction;
    const clientName = button.dataset.clientName?.trim();

    if (!clientName) {
      return;
    }

    if (action === "add-hours") {
      openAddHours(clientName);
      return;
    }

    if (action === "open-sheet") {
      openClientSheet(clientName);
    }
  }

  function handleProfileAction(button) {
    const clientName = button.dataset.clientName?.trim();

    if (!clientName) {
      return;
    }

    openClientDetails(clientName);
  }

  function openClientDetails(clientName) {
    sessionStorage.setItem("clientDetailsName", clientName);

    const container = document.getElementById("app-main-inner-container");

    if (container) {
      container.classList.add("opacity-0");
    }

    hide();

    RouterModule.go("clientDetails");
  }

  function openAddHours(clientName) {
    hide();

    const $taskForm = $("#taskForm");
    const $drawer = $taskForm.parents(".drawer-content");
    const $firstGroup = $taskForm.find(".form-group").first();
    if (!$drawer.hasClass("drawer-grid-5")) {
        $drawer.addClass("drawer-grid-5").removeClass("drawer-grid-4");
        $firstGroup.removeClass("element-hidden");
    }

    TableModule.addClientHours(clientName);
  }

  function openClientSheet(clientName) {
    const client = getClientData(clientName);

    const externalUrl = String(client?.externalUrl || "").trim();

    if (externalUrl) {
      AppUtils.showDashboardToast(
        "Redirecting to external client sheet!",
        "info",
      );

      window.open(externalUrl, "_blank");

      return;
    }

    AppUtils.showDashboardToast("Redirecting to sheet!", "info");

    google.script.run
      .withSuccessHandler((url) => {
        const clientUrl = String(url || "").trim();

        if (clientUrl.startsWith("http")) {
          window.open(clientUrl, "_blank");
          return;
        }

        AppUtils.showError(url);
      })
      .withFailureHandler((error) => {
        console.error("[ProfilePopover] Failed to open client sheet:", error);

        AppUtils.showError(error?.message || error);
      })
      .goToPresentClient(clientName);
  }

  function setClientData(data = []) {
    clientData = new Map();

    (data || []).forEach((client) => {
      const name = String(client?.name || "").trim();

      if (!name) {
        return;
      }

      clientData.set(name.toLowerCase(), client);
    });
  }

  function getClientData(name) {
    const key = String(name || "")
      .trim()
      .toLowerCase();

    if (!key) {
      return null;
    }

    return clientData.get(key) || null;
  }

  function setProfileBuilder(builder) {
    profileBuilder = typeof builder === "function" ? builder : null;
  }

  function handleMouseOver(event) {
    const trigger = event.target.closest("[data-profile-popover]");

    if (!trigger) {
      return;
    }

    if (event.relatedTarget && trigger.contains(event.relatedTarget)) {
      return;
    }

    show(trigger);
  }

  function handleMouseOut(event) {
    const trigger = event.target.closest("[data-profile-popover]");

    if (
      trigger &&
      event.relatedTarget &&
      trigger.contains(event.relatedTarget)
    ) {
      return;
    }

    if (
      popover &&
      event.relatedTarget &&
      popover.contains(event.relatedTarget)
    ) {
      return;
    }

    scheduleHide();
  }

  function handleFocusIn(event) {
    const trigger = event.target.closest("[data-profile-popover]");

    if (!trigger) {
      return;
    }

    show(trigger);
  }

  function handleKeydown(event) {
    if (event.key === "Escape") {
      hide();
    }
  }

  function show(trigger, options = {}) {
    clearTimers();

    showTimer = setTimeout(() => {
      render(trigger, options);
    }, SHOW_DELAY);
  }

  function render(trigger, options = {}) {
    const clientName = trigger.dataset.clientName?.trim();

    if (!clientName) {
      return;
    }

    const client = getClientData(clientName);

    if (!client && !options.name) {
      return;
    }

    const builderOptions =
      profileBuilder && client ? profileBuilder(client) : {};

    const data = {
      ...(client || {}),
      ...(builderOptions || {}),
      ...options,

      name: options.name || client?.name || clientName,

      showDetails: options.showDetails ?? false,
      profileButton: options.profileButton ?? true,
    };

    if (!popover) {
      createPopover();
    }

    popover.innerHTML = createMarkup(data);

    position(trigger);

    requestAnimationFrame(() => {
      popover.classList.add("is-visible");
    });
  }

  function createPopover() {
    popover = document.createElement("div");

    popover.className = "app-profile-popover";

    popover.addEventListener("mouseenter", clearHideTimer);

    popover.addEventListener("mouseleave", scheduleHide);

    document.body.appendChild(popover);
  }

  function createMarkup(data) {
    const initials = getInitials(data.name);

    return `
    <div class="app-profile-popover-banner bg-gc-gradient">

      <div class="app-profile-popover-banner-content">

        <div class="app-profile-popover-avatar bg-gc-gradient">
          ${escapeHtml(initials)}
        </div>

        ${
          data.profileButton
            ? `
              <button
                type="button"
                class="btn btn-gc app-profile-popover-profile-btn"
                data-profile-action="profile"
                data-client-name="${escapeHtml(data.name)}"
              >
                Profile
              </button>
            `
            : ""
        }

      </div>

    </div>

    <div class="app-profile-popover-body">

      <h6 class="app-profile-popover-name">
        ${escapeHtml(data.name)}
      </h6>

      <div class="app-profile-popover-role">
        ${escapeHtml(data.role || "—")}
      </div>

      ${
        data.showDetails
          ? `
            <div class="app-profile-popover-details">

              ${createDetail("Projects", data.projects)}

              ${createDetail("Hours", formatNumber(data.hours))}

              ${createDetail("Paid", formatNumber(data.paid))}

              ${createDetail("Owed", formatNumber(data.owed))}

            </div>
          `
          : ""
      }

      ${
        data.content
          ? `
            <div class="app-profile-popover-divider"></div>

            <div class="app-profile-popover-content">
              ${data.content}
            </div>
          `
          : ""
      }

    </div>

    ${
      data.actions
        ? `
          <div class="app-profile-popover-footer">

            <div class="app-profile-popover-actions">
              ${data.actions}
            </div>

          </div>
        `
        : ""
    }
  `;
  }

  function createDetail(label, value) {
    return `
      <div>

        <div class="app-profile-popover-detail-label">
          ${escapeHtml(label)}
        </div>

        <div class="app-profile-popover-detail-value">
          ${escapeHtml(String(value ?? "—"))}
        </div>

      </div>
    `;
  }

  function position(trigger) {
    if (!popover) {
      return;
    }

    const rect = trigger.getBoundingClientRect();

    const gap = 10;
    const padding = 12;

    let left = rect.left + rect.width / 2 - popover.offsetWidth / 2;

    let top = rect.bottom + gap;

    const maxLeft = window.innerWidth - popover.offsetWidth - padding;

    left = Math.max(padding, Math.min(left, maxLeft));

    if (top + popover.offsetHeight > window.innerHeight - padding) {
      top = rect.top - popover.offsetHeight - gap;
    }

    popover.style.left = `${left}px`;

    popover.style.top = `${top}px`;
  }

  function scheduleHide() {
    clearHideTimer();

    hideTimer = setTimeout(() => {
      hide();
    }, HIDE_DELAY);
  }

  function clearHideTimer() {
    clearTimeout(hideTimer);
  }

  function clearTimers() {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
  }

  function hide() {
    clearTimers();

    if (!popover) {
      return;
    }

    popover.classList.remove("is-visible");
  }

  function getInitials(name) {
    return String(name || "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join("")
      .toUpperCase();
  }

  function formatNumber(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "0";
    }

    return number.toLocaleString(undefined, {
      maximumFractionDigits: 2,
    });
  }

  function escapeHtml(value) {
    const div = document.createElement("div");

    div.textContent = value ?? "";

    return div.innerHTML;
  }

  return {
    init,
    show,
    hide,
    setClientData,
    getClientData,
    setProfileBuilder,
    openClientDetails,
  };
})();

export { ProfilePopoverModule };
