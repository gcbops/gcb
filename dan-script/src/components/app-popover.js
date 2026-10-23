const AppPopoverModule = (() => {
  const POPOVER_CLASS = "app-popover";
  const TRIGGER_SELECTOR = "[data-popover]";
  const SHOW_DELAY = 120;

  let popover = null;
  let activeTrigger = null;
  let activeOptions = null;
  let showTimer = null;
  let hideTimer = null;
  const registered = new Map();

  function init() {
    if (document.documentElement.dataset.appPopoverInitialized) {
      return;
    }

    document.documentElement.dataset.appPopoverInitialized = "true";

    document.addEventListener("click", handleClick);
    document.addEventListener("mouseover", handleMouseOver);
    document.addEventListener("mouseout", handleMouseOut);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("keydown", handleKeydown);

    window.addEventListener("resize", positionActive);
    window.addEventListener("scroll", positionActive, true);
  }

  function register(id, options = {}) {
    if (!id) {
      return;
    }

    registered.set(String(id), { ...options });
  }

  function unregister(id) {
    registered.delete(String(id));
  }

  function handleClick(event) {
    const tab = event.target.closest("[data-app-popover-tab]");

    if (tab && popover?.contains(tab)) {
      event.preventDefault();
      activateTab(tab.dataset.appPopoverTab);
      return;
    }

    const closeButton = event.target.closest("[data-app-popover-close]");

    if (closeButton && popover?.contains(closeButton)) {
      close();
      return;
    }

    const trigger = event.target.closest(TRIGGER_SELECTOR);

    if (trigger) {
      const id = trigger.dataset.popover;
      const options = registered.get(id);

      if (!options) {
        return;
      }

      event.preventDefault();

      if (activeTrigger === trigger && isVisible()) {
        close();
      } else {
        open(trigger, options);
      }

      return;
    }

    if (popover?.contains(event.target)) {
      return;
    }

    if (activeOptions?.closeOnOutsideClick !== false) {
      close();
    }
  }

  function handleMouseOver(event) {
    const trigger = event.target.closest(TRIGGER_SELECTOR);

    if (!trigger || trigger.dataset.popoverTrigger !== "hover") {
      return;
    }

    if (event.relatedTarget && trigger.contains(event.relatedTarget)) {
      return;
    }

    const options = registered.get(trigger.dataset.popover);

    if (!options) {
      return;
    }

    clearTimers();

    showTimer = setTimeout(() => {
      open(trigger, options);
    }, SHOW_DELAY);
  }

  function handleMouseOut(event) {
    const trigger = event.target.closest(TRIGGER_SELECTOR);

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

    if (trigger?.dataset.popoverTrigger === "hover") {
      scheduleClose();
    } else if (popover?.contains(event.target)) {
      scheduleClose();
    }
  }

  function handleFocusIn(event) {
    const trigger = event.target.closest(TRIGGER_SELECTOR);

    if (!trigger) {
      return;
    }

    // Click-triggered popovers remain click-triggered.
    if (trigger.dataset.popoverTrigger !== "hover") {
      return;
    }

    const options = registered.get(trigger.dataset.popover);

    if (options) {
      open(trigger, options);
    }
  }

  function handleKeydown(event) {
    if (event.key === "Escape" && isVisible()) {
      close();
      activeTrigger?.focus();
    }
  }

  function open(trigger, options = {}) {
    if (!trigger || !(trigger instanceof Element)) {
      return;
    }

    clearTimers();

    // Reset the previously active trigger when switching popovers.
    if (activeTrigger && activeTrigger !== trigger) {
      activeTrigger.setAttribute("aria-expanded", "false");
    }

    activeTrigger = trigger;

    activeOptions = {
      placement: "auto",
      width: 360,
      maxHeight: "min(70vh, 560px)",
      closeOnOutsideClick: true,
      ...options,
    };

    ensurePopover();

    popover.style.width = `${Number(activeOptions.width) || 360}px`;
    popover.style.maxHeight = activeOptions.maxHeight;
    popover.style.setProperty("--app-popover-max-width", "calc(100vw - 24px)");

    popover.innerHTML = createMarkup(activeOptions);
    popover.hidden = false;

    activateInitialTab();
    positionActive();

    requestAnimationFrame(() => {
      if (popover && activeTrigger === trigger) {
        popover.classList.add("is-visible");
        popover.setAttribute("aria-hidden", "false");
        trigger.setAttribute("aria-expanded", "true");
      }
    });
  }

  function openContent(trigger, content, options = {}) {
    open(trigger, { ...options, content });
  }

  function close() {
    clearTimers();

    // Reset every popover trigger, not just the active one.
    document
      .querySelectorAll("[data-popover][aria-expanded]")
      .forEach((trigger) => {
        trigger.setAttribute("aria-expanded", "false");
      });

    if (!popover) {
      activeTrigger = null;
      activeOptions = null;
      return;
    }

    popover.classList.remove("is-visible");
    popover.setAttribute("aria-hidden", "true");

    activeTrigger = null;
    activeOptions = null;
  }

  function destroy() {
    close();

    if (popover) {
      popover.remove();
      popover = null;
    }

    registered.clear();
  }

  function ensurePopover() {
    if (popover) {
      return;
    }

    popover = document.createElement("section");
    popover.className = POPOVER_CLASS;
    popover.hidden = true;
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-hidden", "true");

    popover.addEventListener("mouseenter", clearHideTimer);
    popover.addEventListener("mouseleave", scheduleClose);

    document.body.appendChild(popover);
  }

  function createMarkup(options) {
    const title = escapeHtml(options.title || "");
    const subtitle = escapeHtml(options.subtitle || "");
    const icon = options.icon || "";
    const tabs = Array.isArray(options.tabs) ? options.tabs : [];

    const header =
      options.header === false
        ? ""
        : `
        <header class="app-popover-header">
          <div class="app-popover-heading">
            ${
              icon
                ? `
              <span class="app-popover-icon" aria-hidden="true">
                ${icon}
              </span>
            `
                : ""
            }

            <div class="app-popover-heading-text">
              ${title ? `<h3 class="app-popover-title">${title}</h3>` : ""}
              ${subtitle ? `<p class="app-popover-subtitle">${subtitle}</p>` : ""}
            </div>
          </div>

          <button
            type="button"
            class="app-popover-close"
            data-app-popover-close
            aria-label="Close popover"
          >
            &times;
          </button>
        </header>
      `;

    const tabMarkup = tabs.length
      ? `
        <div class="app-popover-tabs" role="tablist">
          ${tabs
            .map(
              (tab, index) => `
            <button
              type="button"
              class="app-popover-tab ${index === 0 ? "is-active" : ""}"
              id="app-popover-tab-${escapeHtml(tab.id)}"
              role="tab"
              aria-selected="${index === 0 ? "true" : "false"}"
              aria-controls="app-popover-panel-${escapeHtml(tab.id)}"
              data-app-popover-tab="${escapeHtml(tab.id)}"
            >
              ${escapeHtml(tab.label || tab.id)}
            </button>
          `,
            )
            .join("")}
        </div>
      `
      : "";

    const body = tabs.length
      ? `
        <div class="app-popover-tab-panels">
          ${tabs
            .map(
              (tab, index) => `
            <div
              class="app-popover-tab-panel ${index === 0 ? "is-active" : ""}"
              id="app-popover-panel-${escapeHtml(tab.id)}"
              role="tabpanel"
              aria-labelledby="app-popover-tab-${escapeHtml(tab.id)}"
              data-app-popover-panel="${escapeHtml(tab.id)}"
              ${index === 0 ? "" : "hidden"}
            >
              ${tab.content || ""}
            </div>
          `,
            )
            .join("")}
        </div>
      `
      : `
        <div class="app-popover-body">
          ${options.content || ""}
        </div>
      `;

    const footer = options.footer
      ? `<footer class="app-popover-footer">${options.footer}</footer>`
      : "";

    return `
      ${header}
      ${tabMarkup}
      ${body}
      ${footer}
    `;
  }

  function activateInitialTab() {
    const firstTab = popover?.querySelector("[data-app-popover-tab]");

    if (firstTab) {
      activateTab(firstTab.dataset.appPopoverTab);
    }
  }

  function activateTab(id) {
    if (!popover || !id) {
      return;
    }

    popover.querySelectorAll("[data-app-popover-tab]").forEach((tab) => {
      const active = tab.dataset.appPopoverTab === id;

      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });

    popover.querySelectorAll("[data-app-popover-panel]").forEach((panel) => {
      const active = panel.dataset.appPopoverPanel === id;

      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
    });
  }

  function positionActive() {
    if (!popover || !activeTrigger || !activeOptions) {
      return;
    }

    const rect = activeTrigger.getBoundingClientRect();
    const gap = 10;
    const padding = 12;
    const popoverRect = popover.getBoundingClientRect();

    let left = rect.left + rect.width / 2 - popoverRect.width / 2;
    let top = rect.bottom + gap;

    left = Math.max(
      padding,
      Math.min(left, window.innerWidth - popoverRect.width - padding),
    );

    const fitsBelow = top + popoverRect.height <= window.innerHeight - padding;

    const fitsAbove = rect.top - popoverRect.height - gap >= padding;

    const placement = activeOptions.placement;

    if (
      placement === "top" ||
      (placement === "auto" && !fitsBelow && fitsAbove)
    ) {
      top = rect.top - popoverRect.height - gap;
    } else if (placement === "bottom" || placement === "auto") {
      top = Math.min(top, window.innerHeight - popoverRect.height - padding);
    }

    top = Math.max(
      padding,
      Math.min(top, window.innerHeight - popoverRect.height - padding),
    );

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  function scheduleClose() {
    clearHideTimer();

    hideTimer = setTimeout(() => {
      close();
    }, 160);
  }

  function clearHideTimer() {
    clearTimeout(hideTimer);
    hideTimer = null;
  }

  function clearTimers() {
    clearTimeout(showTimer);
    clearHideTimer();
    showTimer = null;
  }

  function isVisible() {
    return Boolean(popover?.classList.contains("is-visible"));
  }

  function escapeHtml(value) {
    const element = document.createElement("span");
    element.textContent = String(value ?? "");
    return element.innerHTML;
  }

  return {
    init,
    register,
    unregister,
    open,
    openContent,
    close,
    destroy,
  };
})();

export { AppPopoverModule };

// Example A — A popover with tabs, cards, and actions

// AppPopoverModule.register("dashboard-tools", {
//   title: "Dashboard tools",
//   subtitle: "Shortcuts and workspace settings",
//   icon: '<i class="fa-solid fa-layer-group"></i>',
//   width: 380,
//   placement: "auto",

//   tabs: [
//     {
//       id: "overview",
//       label: "Overview",
//       content: `
//         <div class="card border-0 bg-light mb-3">
//           <div class="card-body p-3">
//             <div class="small text-muted mb-1">
//               Workspace status
//             </div>
//             <div class="fw-semibold">
//               All systems ready
//             </div>
//           </div>
//         </div>

//         <p class="small text-muted mb-0">
//           Use the tabs to explore available tools.
//         </p>
//       `,
//     },

//     {
//       id: "settings",
//       label: "Settings",
//       content: `
//         <form id="popover-settings-form">
//           <div class="mb-3">
//             <label class="form-label" for="popover-display-name">
//               Display name
//             </label>

//             <input
//               id="popover-display-name"
//               name="displayName"
//               class="form-control form-control-sm"
//               placeholder="Enter display name"
//               required
//             >
//           </div>

//           <div class="form-check mb-3">
//             <input
//               class="form-check-input"
//               type="checkbox"
//               id="popover-notifications"
//               name="notifications"
//               checked
//             >

//             <label
//               class="form-check-label small"
//               for="popover-notifications"
//             >
//               Enable notifications
//             </label>
//           </div>

//           <button type="submit" class="btn btn-sm btn-primary">
//             Save settings
//           </button>
//         </form>
//       `,
//     },

//     {
//       id: "activity",
//       label: "Activity",
//       content: `
//         <div class="d-flex justify-content-between py-2 border-bottom">
//           <span class="small">Last refresh</span>
//           <span class="small fw-semibold">Just now</span>
//         </div>

//         <div class="d-flex justify-content-between py-2">
//           <span class="small">Status</span>
//           <span class="badge bg-success">Active</span>
//         </div>
//       `,
//     },
//   ],

//   footer: `
//     <button
//       type="button"
//       class="btn btn-sm btn-outline-secondary"
//       data-app-popover-close
//     >
//       Close
//     </button>
//   `,
// });

// Add a trigger anywhere in your HTML:

// <button
//   type="button"
//   class="btn btn-outline-secondary"
//   data-popover="dashboard-tools"
//   aria-expanded="false"
// >
//   <i class="fa-solid fa-sliders me-1"></i>
//   Dashboard tools
// </button>

// JS

// AppPopoverModule.init();


// Clicking the button opens the registered popover. Tabs are handled by the reusable module; you don't need to write tab-switching code for each feature.


// Example B — A simple card or form without tabs

// AppPopoverModule.register("quick-note", {
//   title: "Add a quick note",
//   subtitle: "Save a note for this workspace",
//   icon: '<i class="fa-regular fa-note-sticky"></i>',
//   width: 320,

//   content: `
//     <form id="quick-note-form">
//       <label for="quick-note-text" class="form-label">
//         Note
//       </label>

//       <textarea
//         id="quick-note-text"
//         name="note"
//         class="form-control form-control-sm mb-3"
//         rows="4"
//         placeholder="Write your note..."
//         required
//       ></textarea>

//       <button type="submit" class="btn btn-primary btn-sm w-100">
//         Save note
//       </button>
//     </form>
//   `,
// });

// <button
//   type="button"
//   class="btn btn-light"
//   data-popover="quick-note"
// >
//   Add note
// </button>


// NOTE: Individual popovers can opt out of outside-click dismissal:

// AppPopoverModule.register("persistent-tools", {
//   title: "Workspace tools",
//   content: "<p>Click Close when you're finished.</p>",
//   closeOnOutsideClick: false,
// });