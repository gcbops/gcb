/* eslint-disable eqeqeq */
import { AppUtils } from "../utils.js";
import { RequestManager } from "./request-manager.js";

const RequestWidget = (() => {
  let unsubscribe = null;
  let expanded = false;
  let activeCategory = "all";
  let latestState = null;

  const expandedDetails = new Set();

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
        <span class="gcb-request-icon"><i class="fa fa-puzzle-piece"></i></span>
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
                id="gcb-request-close"
                aria-label="Close request manager"
                >×</button>
            </div>
        </header>

        <nav
          id="gcb-request-tabs"
          class="gcb-request-tabs"
          aria-label="Filter requests by category"
        >
          <button
            type="button"
            class="gcb-request-tab"
            data-request-category="all"
            aria-pressed="true"
          >
            <i class="pe-7s-layers" aria-hidden="true"></i>
            <span>All</span>
          </button>

          <button
            type="button"
            class="gcb-request-tab"
            data-request-category="hours"
            aria-pressed="false"
          >
            <i class="pe-7s-clock" aria-hidden="true"></i>
            <span>Hours</span>
          </button>

          <button
            type="button"
            class="gcb-request-tab"
            data-request-category="reports"
            aria-pressed="false"
          >
            <i class="pe-7s-note2" aria-hidden="true"></i>
            <span>Reports</span>
          </button>

          <button
            type="button"
            class="gcb-request-tab"
            data-request-category="other"
            aria-pressed="false"
          >
            <span>Other</span>
          </button>
        </nav>

        <div
          id="gcb-request-projection"
          class="gcb-request-projection"
        ></div>

        <div
          id="gcb-request-category-actions"
          class="gcb-request-category-actions"
        ></div>

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

      const clearHistoryButton = event.target.closest(
        "[data-request-clear-history]",
      );

      if (clearHistoryButton) {
        if (!latestState) {
          return;
        }

        const category = clearHistoryButton.dataset.requestClearHistory;

        const historyIds = latestState.history
          .filter(
            (request) =>
              category === "all" || getRequestCategory(request) === category,
          )
          .map((request) => request.id);

        if (historyIds.length) {
          RequestManager.archiveHistoryByIds(historyIds);
        }

        return;
      }

      const pauseAllButton = event.target.closest("[data-request-pause-all]");

      if (pauseAllButton) {
        const category = pauseAllButton.dataset.requestPauseAll;

        const requestIds = (latestState?.queue || [])
          .filter(
            (request) =>
              request.status === "pending" &&
              (category === "all" || getRequestCategory(request) === category),
          )
          .map((request) => request.id);

        const pausedCount = RequestManager.pauseRequests(requestIds);

        if (pausedCount > 0) {
          AppUtils.showDashboardToast?.(
            `${pausedCount} pending request(s) paused.`,
          );
        }

        return;
      }

      const resumeAllButton = event.target.closest("[data-request-resume-all]");

      if (resumeAllButton) {
        const category = resumeAllButton.dataset.requestResumeAll;

        const requestIds = (latestState?.queue || [])
          .filter(
            (request) =>
              request.status === "paused" &&
              (category === "all" || getRequestCategory(request) === category),
          )
          .map((request) => request.id);

        const resumedCount = RequestManager.resumeRequests(requestIds);

        if (resumedCount > 0) {
          AppUtils.showDashboardToast?.(
            `${resumedCount} pending request(s) resumed.`,
          );
        }

        return;
      }

      const pauseButton = event.target.closest("[data-request-pause]");

      if (pauseButton) {
        RequestManager.pauseRequest(pauseButton.dataset.requestPause);
        return;
      }

      const resumeButton = event.target.closest("[data-request-resume]");

      if (resumeButton) {
        RequestManager.resumeRequest(resumeButton.dataset.requestResume);
        return;
      }

      const retryAllButton = event.target.closest("[data-request-retry-all]");

      if (retryAllButton) {
        const category = retryAllButton.dataset.requestRetryAll;

        const retryableRequests = RequestManager.getRetryableRequests().filter(
          (request) =>
            category === "all" || getRequestCategory(request) === category,
        );

        if (!retryableRequests.length) {
          return;
        }

        // Capture IDs for this confirmation.
        const requestIds = retryableRequests.map((request) => request.id);
        const hasInterrupted = retryableRequests.some(
          (request) => request.status === "interrupted",
        );

        AppUtils.openConfirmationModal({
          ns: "retryAllRequests",
          title: `Retry ${requestIds.length} Requests?`,
          message: `
            <p>
              You are about to retry <strong>${requestIds.length}</strong>
              failed or interrupted request(s).
            </p>
            <p>
              Some requests may already have been saved by the server.
              Verify their results before retrying to avoid duplicate operations.
            </p>
            ${
              hasInterrupted
                ? `<p class="mb-0">
                    <strong>Warning:</strong> Some requests were interrupted
                    while processing. Their final server-side result may be unknown.
                  </p>`
                : ""
            }
          `,
          onProceed: () => {
            AppUtils.closeModal("#app-modal");

            const retriedCount = RequestManager.retryRequests(requestIds);

            AppUtils.showDashboardToast?.(
              `${retriedCount} request(s) queued for retry.`,
            );
          },
          onBack: () => {
            AppUtils.closeModal("#app-modal");
          },
        });

        return;
      }

      const categoryButton = event.target.closest("[data-request-category]");

      if (categoryButton) {
        activeCategory = categoryButton.dataset.requestCategory;

        if (latestState) {
          render(latestState);
        }

        return;
      }

      const detailsButton = event.target.closest("[data-request-details]");

      if (detailsButton) {
        const requestId = detailsButton.dataset.requestDetails;
        const details = root.querySelector(
          `[data-request-details-panel="${CSS.escape(requestId)}"]`,
        );

        if (details) {
          const isExpanded = !expandedDetails.has(requestId);

          if (isExpanded) {
            expandedDetails.add(requestId);
          } else {
            expandedDetails.delete(requestId);
          }

          details.hidden = !isExpanded;
          detailsButton.setAttribute("aria-expanded", String(isExpanded));
          detailsButton.textContent = isExpanded
            ? "Hide details"
            : "Show details";
        }

        return;
      }

      const cancelButton = event.target.closest("[data-request-cancel]");

      if (cancelButton) {
        const requestId = cancelButton.dataset.requestCancel;

        AppUtils.openConfirmationModal({
          ns: "cancelRequest",
          title: "Cancel Pending Request?",
          message: `
      <p>This request has not started processing yet.</p>
      <p class="mb-0">Cancel it and remove its hours from the projected queue?</p>
    `,
          onProceed: () => {
            AppUtils.closeModal("#app-modal");
            RequestManager.cancelRequest(requestId);
          },
          onBack: () => {
            AppUtils.closeModal("#app-modal");
          },
        });

        return;
      }

      const retryButton = event.target.closest("[data-request-retry]");
      if (retryButton) {
        const requestId = retryButton.dataset.requestRetry;

        AppUtils.openConfirmationModal({
          ns: "retryRequest",

          title: "Retry This Request?",

          message: `
            <p>
              This request may already have been saved by the server.
            </p>
            <p class="mb-0">
              Verify the server record before retrying to avoid duplicate hours.
              Do you want to retry anyway?
            </p>
          `,

          onProceed: ($modal, $btn) => {
            AppUtils.closeModal("#app-modal");

            RequestManager.retryRequest(requestId);
          },

          onBack: () => {
            AppUtils.closeModal("#app-modal");
          },
        });

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

  function getRequestCategory(request) {
    const type = String(request.type || "").toLowerCase();

    if (
      type === "record-hours" ||
      type === "edit-today-hours" ||
      /hour|hrstracking/.test(type)
    ) {
      return "hours";
    }

    if (/report|billing|monthly|yearly|csv|pdf/.test(type)) {
      return "reports";
    }

    return "other";
  }

  function render(state) {
    latestState = state;

    const list = document.getElementById("gcb-request-list");
    const count = document.getElementById("gcb-request-count");
    const projection = document.getElementById("gcb-request-projection");

    if (!list || !count || !projection) {
      return;
    }

    count.textContent = String(state.queue.length);

    const projected = RequestManager.getProjectedHours();

    projection.hidden = activeCategory !== "hours";

    if (activeCategory === "hours") {
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
      `;
    } else {
      projection.innerHTML = "";
    }

    const allRequests = [...state.queue, ...state.history.slice(0, 10)];

    document
      .querySelectorAll("#gcb-request-tabs [data-request-category]")
      .forEach((button) => {
        const isActive = button.dataset.requestCategory === activeCategory;

        button.classList.toggle("active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
      });

    const categoryActions = document.getElementById(
      "gcb-request-category-actions",
    );

    if (categoryActions) {
      const categoryLabels = {
        all: "Clear all history",
        hours: "Clear hours history",
        reports: "Clear reports history",
        other: "Clear other history",
      };

      const hasHistory = state.history.some(
        (request) =>
          activeCategory === "all" ||
          getRequestCategory(request) === activeCategory,
      );

      const retryableRequests = RequestManager.getRetryableRequests().filter(
        (request) =>
          activeCategory === "all" ||
          getRequestCategory(request) === activeCategory,
      );

      const pendingRequests = state.queue.filter(
        (request) =>
          request.status === "pending" &&
          (activeCategory === "all" ||
            getRequestCategory(request) === activeCategory),
      );

      const pausedRequests = state.queue.filter(
        (request) =>
          request.status === "paused" &&
          (activeCategory === "all" ||
            getRequestCategory(request) === activeCategory),
      );

      categoryActions.innerHTML = `
        <button
          type="button"
          class="gcb-request-pause-all"
          data-request-pause-all="${activeCategory}"
          ${pendingRequests.length ? "" : "disabled"}
        >
          <i class="pe-7s-pause" aria-hidden="true"></i>
          <span>Pause all (${pendingRequests.length})</span>
        </button>

        <button
          type="button"
          class="gcb-request-resume-all"
          data-request-resume-all="${activeCategory}"
          ${pausedRequests.length ? "" : "disabled"}
        >
          <i class="pe-7s-play" aria-hidden="true"></i>
          <span>Resume all (${pausedRequests.length})</span>
        </button>

        <button
          type="button"
          class="gcb-request-retry-all"
          data-request-retry-all="${activeCategory}"
          ${retryableRequests.length ? "" : "disabled"}
        >
          <i class="pe-7s-refresh-2" aria-hidden="true"></i>
          <span>Retry all (${retryableRequests.length})</span>
        </button>

        <button
          type="button"
          class="gcb-request-clear-history"
          data-request-clear-history="${activeCategory}"
          ${hasHistory ? "" : "disabled"}
        >
          <i class="pe-7s-trash" aria-hidden="true"></i>
          <span>${categoryLabels[activeCategory]}</span>
        </button>
      `;
    }

    const requests =
      activeCategory === "all"
        ? allRequests
        : allRequests.filter(
            (request) => getRequestCategory(request) === activeCategory,
          );

    if (!requests.length) {
      const hasAnyRequests = allRequests.length > 0;

      list.innerHTML = `
        <div class="gcb-request-empty">
          ${
            hasAnyRequests
              ? `No ${escapeHTML(activeCategory)} requests yet.`
              : "No requests yet."
          }
        </div>
      `;

      return;
    }

    list.innerHTML = requests
      .map((request) => {
        const isRetryable = ["interrupted", "failed"].includes(request.status);
        const isHistory = state.history.some((item) => item.id === request.id);
        const isPending = request.status === "pending";
        const isPaused = request.status === "paused";

        const isRecordHours = request.type === "record-hours";
        const isEditHours = request.type === "edit-today-hours";
        const isDeleteHours = /delete|remove/i.test(request.type);

        const hasHourDetails = isRecordHours || isEditHours || isDeleteHours;

        const rawRecords = Array.isArray(request.payload?.records)
          ? request.payload.records
          : request.payload &&
              (request.payload.task ||
                request.payload.project ||
                request.payload.type ||
                request.payload.hour != null ||
                request.payload.hours != null)
            ? [request.payload]
            : [];

        const records = rawRecords.filter((record) => {
          if (!record || typeof record !== "object") {
            return false;
          }

          return Boolean(
            record.task ||
            record.project ||
            record.type ||
            record.hour != null ||
            record.hours != null ||
            record.action === "delete" ||
            record.originalTask ||
            record.originalType ||
            record.originalHours != null,
          );
        });

        const allDeleted =
          records.length > 0 &&
          records.every((record) => record.action === "delete");

        const hasDeletions = records.some(
          (record) => record.action === "delete",
        );

        const actionLabel = isRecordHours
          ? "Add hours"
          : isDeleteHours || (isEditHours && allDeleted)
            ? "Delete hours"
            : isEditHours && hasDeletions
              ? "Update / delete hours"
              : isEditHours
                ? "Edit hours"
                : "Request";

        let actions = "";

        if (isPending || isPaused) {
          actions = `
            ${
              isPaused
                ? `
                  <button
                    type="button"
                    data-request-resume="${escapeHTML(request.id)}"
                  >Resume</button>
                `
                : `
                  <button
                    type="button"
                    data-request-pause="${escapeHTML(request.id)}"
                  >Pause</button>
                `
            }

            <button
              type="button"
              data-request-cancel="${escapeHTML(request.id)}"
            >Cancel</button>
          `;
        } else if (isRetryable) {
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

        const detailsHTML = hasHourDetails
          ? `
            <button
              type="button"
              class="gcb-request-details-toggle"
              data-request-details="${escapeHTML(request.id)}"
              aria-expanded="${expandedDetails.has(request.id)}"
            >${expandedDetails.has(request.id) ? "Hide details" : "Show details"}</button>

            <div
              class="gcb-request-details"
              data-request-details-panel="${escapeHTML(request.id)}"
              ${expandedDetails.has(request.id) ? "" : "hidden"}
            >

              <div class="gcb-request-detail-client">
                Action:
                <strong>${escapeHTML(actionLabel)}</strong>
              </div>

              ${records
                .map((record) => {
                  const isDeleted = record.action === "delete";

                  const task =
                    record.task || record.project || record.originalTask || "Unknown project";

                  const type = record.type || record.originalType || "Unknown type";

                  const previousHours =
                    record.originalHours ??
                    record.previousHours ??
                    record.oldHours ??
                    record.existingHours;

                  const currentHours = isDeleted
                    ? previousHours
                    : (record.updatedHours ?? record.newHours ?? record.hours ?? record.hour);

                  const hoursClass = isDeleted
                    ? "gcb-request-hours-delete"
                    : isRecordHours
                      ? "gcb-request-hours-add"
                      : "gcb-request-hours-edit";

                  let hoursDisplay = "—";

                  if (currentHours != null && currentHours !== "") {
                    if (
                      isEditHours &&
                      !isDeleted &&
                      previousHours != null &&
                      previousHours !== ""
                    ) {
                      hoursDisplay = `
                        <span class="gcb-request-hours-edit">
                          ${escapeHTML(previousHours)} → ${escapeHTML(currentHours)} h
                        </span>
                      `;
                    } else {
                      const prefix = isDeleted ? "−" : isRecordHours ? "+" : "";

                      hoursDisplay = `
                        <span class="${hoursClass}">
                          ${prefix}${escapeHTML(currentHours)} h
                        </span>
                      `;
                    }
                  }

                  return `
                    <div class="gcb-request-detail-row">
                      <div>
                        <strong>${escapeHTML(task)}</strong>
                        <span>${escapeHTML(type)}</span>
                      </div>
                      <strong>${hoursDisplay}</strong>
                    </div>
                  `;
                })
                .join("")}
              </div>
            `
          : "";

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

            ${detailsHTML}

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
