import { RequestManager } from "./request-manager.js";

const RequestWidget = (() => {
  let unsubscribe = null;
  let expanded = false;

  function init() {
    if (document.getElementById("gcb-request-widget")) {
      return;
    }

    const root = document.createElement("div");
    root.id = "gcb-request-widget";

    root.innerHTML = `
      <button
        type="button"
        id="gcb-request-toggle"
        class="gcb-request-toggle"
        aria-expanded="false"
        aria-controls="gcb-request-panel"
      >
        <span class="gcb-request-icon">↻</span>
        <span>Requests</span>
        <span id="gcb-request-count" class="gcb-request-count">0</span>
      </button>

      <section
        id="gcb-request-panel"
        class="gcb-request-panel"
        hidden
        aria-label="GCB requests"
      >
        <header class="gcb-request-header">
            <div>
                <strong>Request Manager</strong>
                <div class="gcb-request-subtitle">
                Track your background requests
                </div>
            </div>

            <div class="gcb-request-header-actions">
                <button
                type="button"
                id="gcb-request-archive-all"
                title="Clear completed request history"
                >Clear history</button>

                <button
                type="button"
                id="gcb-request-close"
                aria-label="Close request manager"
                >×</button>
            </div>
        </header>

        <div id="gcb-request-projection" class="gcb-request-projection"></div>
        <div id="gcb-request-list" class="gcb-request-list"></div>
      </section>
    `;

    document.body.appendChild(root);

    root.addEventListener("click", (event) => {
      if (event.target.closest("#gcb-request-toggle")) {
        setExpanded(!expanded);
        return;
      }

      if (event.target.closest("#gcb-request-close")) {
        setExpanded(false);
        return;
      }

      if (event.target.closest("#gcb-request-archive-all")) {
        RequestManager.archiveHistory();
        return;
      }

      const retryButton = event.target.closest("[data-request-retry]");
      if (retryButton) {
        const confirmed = window.confirm(
          "This request may already have been saved. Verify the server record before retrying to avoid duplicate hours. Retry anyway?",
        );

        if (confirmed) {
          RequestManager.retryRequest(retryButton.dataset.requestRetry);
        }

        return;
      }

      const dismissButton = event.target.closest("[data-request-dismiss]");
      if (dismissButton) {
        RequestManager.dismissRequest(dismissButton.dataset.requestDismiss);
        return;
      }

      const dismissHistoryButton = event.target.closest(
        "[data-request-dismiss-history]",
      );

      if (dismissHistoryButton) {
        RequestManager.dismissHistoryItem(
          dismissHistoryButton.dataset.requestDismissHistory,
        );
      }
    });

    unsubscribe = RequestManager.subscribe(render);
  }

  function setExpanded(value) {
    expanded = value;

    const panel = document.getElementById("gcb-request-panel");
    const toggle = document.getElementById("gcb-request-toggle");

    if (panel) {
      panel.hidden = !expanded;
    }

    toggle?.setAttribute("aria-expanded", String(expanded));
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[character],
    );
  }

  function render(state) {
    const list = document.getElementById("gcb-request-list");
    const count = document.getElementById("gcb-request-count");
    const projection = document.getElementById("gcb-request-projection");

    if (!list || !count || !projection) {
      return;
    }

    count.textContent = String(state.queue.length);

    const projected = RequestManager.getProjectedHours();

    const clientLines = Object.entries(projected.byClient)
      .map(
        ([client, hours]) => `
      <div class="gcb-request-projection-row">
        <span>${escapeHTML(client)}</span>
        <strong>+${hours.toFixed(2)} h</strong>
      </div>
    `,
      )
      .join("");

    projection.innerHTML = `
    <div class="gcb-request-projection-total">
      <span>Projected queued hours</span>
      <strong>+${projected.total.toFixed(2)} h</strong>
    </div>
    ${clientLines}
    <div class="gcb-request-projection-note">
      Not yet confirmed by the server
    </div>
  `;

    const requests = [...state.queue, ...state.history.slice(0, 10)];

    if (!requests.length) {
      list.innerHTML = `
      <div class="gcb-request-empty">No requests yet.</div>
    `;
      return;
    }

    list.innerHTML = requests
      .map((request) => {
        const isRetryable = ["interrupted", "failed"].includes(request.status);
        const isHistory = state.history.some((item) => item.id === request.id);

        let actions = "";

        if (isRetryable) {
          actions = `
            <button
              type="button"
              data-request-retry="${escapeHTML(request.id)}"
            >Retry</button>
            ${
              isHistory
                ? `
                  <button
                    type="button"
                    data-request-dismiss-history="${escapeHTML(request.id)}"
                  >Remove</button>
                `
                : `
                  <button
                    type="button"
                    data-request-dismiss="${escapeHTML(request.id)}"
                  >Remove</button>
                `
            }
          `;
        } else if (isHistory) {
                  actions = `
            <button
              type="button"
              data-request-dismiss-history="${escapeHTML(request.id)}"
            >Remove</button>
          `;
        }

        return `
          <article class="gcb-request-item">
            <div class="gcb-request-item-top">
              <strong>${escapeHTML(request.title)}</strong>
              <span class="gcb-request-status status-${escapeHTML(request.status)}">
                ${escapeHTML(request.status)}
              </span>
            </div>

            <div class="gcb-request-message">
              ${escapeHTML(request.message)}
            </div>

            <div class="gcb-request-time">
              ${escapeHTML(new Date(request.createdAt).toLocaleTimeString())}
            </div>

            ${actions ? `<div class="gcb-request-actions">${actions}</div>` : ""}
          </article>
        `;
      })
      .join("");
  }

  function destroy() {
    unsubscribe?.();
    unsubscribe = null;

    document.getElementById("gcb-request-widget")?.remove();
  }

  return { init, destroy };
})();

export { RequestWidget };
