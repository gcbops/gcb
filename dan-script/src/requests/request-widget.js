/* eslint-disable eqeqeq */
import { RouterModule } from "../routers.js";
import { AppUtils } from "../utils/utils.js";
import { RequestManager } from "./request-manager.js";

const RequestWidget = (() => {
  let unsubscribe = null;
  let expanded = false;
  let activeCategory = "all";
  let latestState = null;

  const AUTO_SHOW_DELAY = 10_000;

  let knownQueuedIds = null;
  let inactivityTimer = null;
  let mediaQuery = null;

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

    initAutoVisibility(root);

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

      const moveButton = event.target.closest("[data-request-move]");

      if (moveButton) {
        const requestId = moveButton.dataset.requestId;
        const direction = moveButton.dataset.requestMove;

        const moved = RequestManager.movePendingRequest(requestId, direction);

        if (!moved) {
          AppUtils.showDashboardToast?.(
            "This request can no longer be reordered.",
          );
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

        const hasReportGeneration = retryableRequests.some((request) =>
          ["generate-report", "generate-billing-csv"].includes(request.type),
        );

        const hasDelivery = retryableRequests.some((request) =>
          /email|discord/i.test(request.type || ""),
        );

        const warnings = [
          hasInterrupted
            ? `
              <p>
                <strong>Interrupted requests:</strong>
                The server may have completed these operations even though
                the browser did not receive confirmation.
              </p>
            `
                    : "",
                  hasReportGeneration
                    ? `
              <p>
                <strong>Report generation:</strong>
                A PDF or CSV may already exist. Retrying could create another file.
              </p>
            `
                    : "",
                  hasDelivery
                    ? `
              <p class="mb-0">
                <strong>Message delivery:</strong>
                An email or Discord message may already have been sent.
                Retrying could send it again.
              </p>
            `
            : "",
          ]
          .filter(Boolean)
          .join("");

        const message = `
          <p>
            You are about to retry
            <strong>${requestIds.length}</strong>
            failed or interrupted request(s).
          </p>
          ${warnings}
          <p class="mb-0">
            Continue only after reviewing the affected operations.
          </p>
        `;

        AppUtils.openConfirmationModal({
          ns: "retryAllRequests",
          title: `Retry ${requestIds.length} Requests?`,
          message: message,
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

      const clientDetailsButton = event.target.closest(
        "[data-request-client-details]",
      );

      if (clientDetailsButton) {
        const requestId = clientDetailsButton.dataset.requestClientDetails;

        const request = [
          ...(latestState?.queue || []),
          ...(latestState?.history || []),
        ].find((item) => item.id === requestId);

        if (!request || request.status !== "completed") {
          AppUtils.showDashboardToast?.(
            "Client details are available after the request completes.",
          );
          return;
        }

        const clientName = RequestManager.getRequestClientName(request);

        if (!clientName) {
          AppUtils.showError(
            "The client name is unavailable for this request.",
          );
          return;
        }

        sessionStorage.setItem("clientDetailsName", clientName);

        RouterModule.go("clientDetails", true, {
          client: clientName,
        });

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

        const request = [
          ...(latestState?.queue || []),
          ...(latestState?.history || []),
        ].find((item) => item.id === requestId);

        if (!request) {
          AppUtils.showError(
            "The request could not be found. Please refresh and try again.",
          );
          return;
        }

        const isInterrupted = request.status === "interrupted";

        const retryMessages = {
          hours: {
            title: "Retry Hour Request?",
            message: `
        <p>This hour request did not finish normally.</p>
        <p class="mb-0">
          ${
            isInterrupted
              ? "The server may already have recorded these hours before the connection was interrupted."
              : "Confirm that the original hour operation was not saved before retrying."
          }
          Verify the relevant sheet records first to avoid duplicate hours.
          Do you want to retry anyway?
        </p>
      `,
          },

          report: {
            title: "Retry Report Generation?",
            message: `
        <p>The report generation request did not finish normally.</p>
        <p class="mb-0">
          ${
            isInterrupted
              ? "The PDF may already have been generated or saved in Google Drive."
              : "Check the report history and Google Drive before retrying."
          }
          Retrying may generate another report or overwrite existing report state.
          Verify the outcome first.
        </p>
      `,
          },

          csv: {
            title: "Retry CSV Export?",
            message: `
        <p>The Billing Records CSV export did not finish normally.</p>
        <p class="mb-0">
          ${
            isInterrupted
              ? "The CSV may already have been created in Google Drive."
              : "Check Google Drive for the CSV generated for this date range."
          }
          Retrying may create a duplicate file. Verify the outcome before proceeding.
        </p>
      `,
          },

          email: {
            title: "Retry Email Delivery?",
            message: `
        <p>The email delivery request did not finish normally.</p>
        <p class="mb-0">
          ${
            isInterrupted
              ? "The email may already have been sent even though confirmation was not received."
              : "Check the delivery result and available operation logs before retrying."
          }
          Retrying may send a duplicate email.
        </p>
      `,
          },

          discord: {
            title: "Retry Discord Delivery?",
            message: `
        <p>The Discord delivery request did not finish normally.</p>
        <p class="mb-0">
          ${
            isInterrupted
              ? "Discord may already have received the message before the connection was interrupted."
              : "Check the delivery result and available operation logs before retrying."
          }
          Retrying may post a duplicate notification.
        </p>
      `,
          },

          other: {
            title: "Retry This Request?",
            message: `
        <p>This request did not finish normally.</p>
        <p class="mb-0">
          Verify whether the original operation succeeded before retrying,
          to avoid unintended duplicate actions.
        </p>
      `,
          },
        };

        const type = String(request.type || "").toLowerCase();

        let category = "other";

        if (
          ["record-hours", "edit-today-hours"].includes(type) ||
          /hour|hours/i.test(type)
        ) {
          category = "hours";
        } else if (type === "generate-report") {
          category = "report";
        } else if (type === "generate-billing-csv") {
          category = "csv";
        } else if (/email/i.test(type)) {
          category = "email";
        } else if (/discord/i.test(type)) {
          category = "discord";
        }

        const { title, message } = retryMessages[category];

        AppUtils.openConfirmationModal({
          ns: "retryRequest",
          title,
          message,

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

      const pdfEmailButton = event.target.closest("[data-request-pdf-email]");
      const pdfDiscordButton = event.target.closest(
        "[data-request-pdf-discord]",
      );

      if (pdfEmailButton) {
        event.preventDefault();

        const reportId = pdfEmailButton.dataset.requestPdfEmail;

        RequestManager.enqueue(
          "send-report-email",
          {
            reportId,
            reportType: "PDF Report",
            isDataExport: false,
          },
          "Email PDF report",
        );

        return;
      }

      if (pdfDiscordButton) {
        event.preventDefault();

        const reportId = pdfDiscordButton.dataset.requestPdfDiscord;

        RequestManager.enqueue(
          "send-report-discord",
          {
            reportId,
            reportType: "PDF Report",
            isDataExport: false,
          },
          "Send PDF report to Discord",
        );

        return;
      }
  
      const reportDownloadButton = event.target.closest(
        "[data-request-report-download]",
      );

      const reportViewButton = event.target.closest(
        "[data-request-report-view]",
      );

      if (reportDownloadButton || reportViewButton) {
        const requestId =
          (reportDownloadButton || reportViewButton).dataset
            .requestReportDownload ||
          (reportDownloadButton || reportViewButton).dataset.requestReportView;

        const reportRequest = latestState?.history.find(
          (request) =>
            request.id === requestId &&
            ["generate-report", "generate-billing-csv"].includes(
              request.type,
            ) &&
            request.status === "completed",
        );

        const reportUrl =
          reportRequest?.result?.reportUrl || reportRequest?.result?.url;

        if (!reportUrl) {
          AppUtils.showError("The saved report link is unavailable.");
          return;
        }

        let url;

        try {
          url = new URL(reportUrl);

          if (
            url.protocol !== "https:" ||
            !["drive.google.com", "docs.google.com"].includes(
              url.hostname.toLowerCase(),
            ) ||
            url.username ||
            url.password
          ) {
            throw new Error("Invalid report URL");
          }
        } catch {
          AppUtils.showError("The saved report link is invalid.");
          return;
        }

        if (reportDownloadButton) {
          const fileId =
            url.pathname.match(
              /\/(?:file|document|spreadsheets|presentation)\/d\/([^/]+)/,
            )?.[1] || url.searchParams.get("id");

          if (!fileId) {
            AppUtils.showError(
              "Unable to determine the report file ID for downloading.",
            );
            return;
          }

          const downloadUrl = new URL("https://drive.google.com/uc");
          downloadUrl.searchParams.set("export", "download");
          downloadUrl.searchParams.set("id", fileId);

          window.open(downloadUrl.href, "_blank", "noopener,noreferrer");
        } else {
          window.open(url.href, "_blank", "noopener,noreferrer");
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
    const root = document.getElementById("gcb-request-widget");

    if (panel) {
      panel.hidden = !expanded;
    }

    toggle?.setAttribute("aria-expanded", String(expanded));

    if (expanded) {
      clearInactivityTimer();
      setAutoHidden(root, false);
    } else if (isMobile()) {
      // Start a fresh 10-second inactivity period after closing.
      scheduleAutoShow(root);
    }
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
    const queuedIds = new Set(state.queue.map((request) => request.id));

    const hasNewRequest =
      knownQueuedIds !== null &&
      [...queuedIds].some((id) => !knownQueuedIds.has(id));

    knownQueuedIds = queuedIds;
    latestState = state;

    const root = document.getElementById("gcb-request-widget");

    if (hasNewRequest) {
      showRequestWidget(root, true);
    }

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

    const historyByCategory = {
      hours: [],
      reports: [],
      other: [],
    };

    Object.keys(historyByCategory).forEach((category) => {
      historyByCategory[category] = state.history
        .filter((request) => getRequestCategory(request) === category)
        .sort(
          (a, b) =>
            new Date(b.updatedAt || b.createdAt).getTime() -
            new Date(a.updatedAt || a.createdAt).getTime(),
        )
        .slice(0, 10);
    });

    const recentHistory =
      activeCategory === "all"
        ? Object.values(historyByCategory)
            .flat()
            .sort(
              (a, b) =>
                new Date(b.updatedAt || b.createdAt).getTime() -
                new Date(a.updatedAt || a.createdAt).getTime(),
            )
        : historyByCategory[activeCategory] || [];

    const allRequests = [...state.queue, ...recentHistory];

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
        hours: "Clear history",
        reports: "Clear history",
        other: "Clear history",
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
          <i class="fa fa-pause" aria-hidden="true"></i>
          <span>Pause(${pendingRequests.length})</span>
        </button>

        <button
          type="button"
          class="gcb-request-resume-all"
          data-request-resume-all="${activeCategory}"
          ${pausedRequests.length ? "" : "disabled"}
        >
          <i class="fa fa-play" aria-hidden="true"></i>
          <span>Resume(${pausedRequests.length})</span>
        </button>

        <button
          type="button"
          class="gcb-request-retry-all"
          data-request-retry-all="${activeCategory}"
          ${retryableRequests.length ? "" : "disabled"}
        >
          <i class="fa fa-refresh" aria-hidden="true"></i>
          <span>Retry(${retryableRequests.length})</span>
        </button>

        <button
          type="button"
          class="gcb-request-clear-history"
          data-request-clear-history="${activeCategory}"
          ${hasHistory ? "" : "disabled"}
        >
          <i class="fa fa-trash" aria-hidden="true"></i>
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
        const isCompletedReport =
          isHistory &&
          ["generate-report", "generate-billing-csv"].includes(request.type) &&
          request.status === "completed" &&
          Boolean(request.result?.reportUrl || request.result?.url);
        const isCompletedCsv =
          isHistory &&
          request.type === "generate-billing-csv" &&
          request.status === "completed" &&
          Boolean(request.result?.fileId);
        const isCompletedPdf =
          isHistory &&
          request.type === "generate-report" &&
          request.status === "completed" &&
          Boolean(request.result?.reportId);
        const isPending = request.status === "pending";
        const clientName = RequestManager.getRequestClientName(request);
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
          const hasReportActions = isCompletedReport;
          const hasDeliveryActions = isCompletedCsv || isCompletedPdf;

          actions = `
            ${
              hasReportActions
                ? `
                  <button
                    type="button"
                    data-request-report-download="${escapeHTML(request.id)}"
                  >Download</button>

                  <button
                    type="button"
                    data-request-report-view="${escapeHTML(request.id)}"
                  >View</button>
                `
                : ""
            }

            ${
              hasDeliveryActions
                ? `
                  <div class="dropdown d-inline-block">
                    <button
                      type="button"
                      class="dropdown-toggle"
                      data-bs-toggle="dropdown"
                      aria-expanded="false"
                      aria-label="More report actions"
                    >
                      More
                    </button>

                    <div class="dropdown-menu dropright">
                      ${
                        isCompletedCsv
                          ? `
                            <button
                              type="button"
                              class="dropdown-item"
                              data-request-csv-email="${escapeHTML(request.id)}"
                            >Email CSV</button>

                            <button
                              type="button"
                              class="dropdown-item"
                              data-request-csv-discord="${escapeHTML(request.id)}"
                            >Send CSV to Discord</button>
                          `
                          : ""
                      }

                      ${
                        isCompletedPdf
                          ? `
                            <button
                              type="button"
                              class="dropdown-item"
                              data-request-pdf-email="${escapeHTML(request.result.reportId)}"
                            >Email PDF</button>

                            <button
                              type="button"
                              class="dropdown-item"
                              data-request-pdf-discord="${escapeHTML(request.result.reportId)}"
                            >Send PDF to Discord</button>
                          `
                          : ""
                      }
                    </div>
                  </div>
                `
                : ""
            }

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

        const canOpenClientDetails =
          Boolean(clientName) && isHistory && request.status === "completed";

        const clientDetailsHTML = canOpenClientDetails
          ? `
            <button
              type="button"
              class="gcb-request-client-details"
              data-request-client-details="${escapeHTML(request.id)}"
            >Details</button>
          `
          : "";

        const pendingRequests = state.queue.filter(
          (item) => item.status === "pending",
        );

        const pendingIndex = pendingRequests.findIndex(
          (item) => item.id === request.id,
        );

        const priorityActions =
          isPending && pendingIndex !== -1
            ? `
              <div class="gcb-request-priority-actions">
                <button
                  type="button"
                  data-request-id="${escapeHTML(request.id)}"
                  data-request-move="top"
                  aria-label="Move request to top"
                  title="Move to top"
                  ${pendingIndex === 0 ? "disabled" : ""}
                >
                  <i class="fa fa-angle-double-up" aria-hidden="true"></i>
                </button>

                <button
                  type="button"
                  data-request-id="${escapeHTML(request.id)}"
                  data-request-move="up"
                  aria-label="Move request up"
                  title="Move up"
                  ${pendingIndex === 0 ? "disabled" : ""}
                >
                  <i class="fa fa-angle-up" aria-hidden="true"></i>
                </button>

                <button
                  type="button"
                  data-request-id="${escapeHTML(request.id)}"
                  data-request-move="down"
                  aria-label="Move request down"
                  title="Move down"
                  ${pendingIndex === pendingRequests.length - 1 ? "disabled" : ""}
                >
                  <i class="fa fa-angle-down" aria-hidden="true"></i>
                </button>

                <button
                  type="button"
                  data-request-id="${escapeHTML(request.id)}"
                  data-request-move="bottom"
                  aria-label="Move request to bottom"
                  title="Move to bottom"
                  ${pendingIndex === pendingRequests.length - 1 ? "disabled" : ""}
                >
                  <i class="fa fa-angle-double-down" aria-hidden="true"></i>
                </button>
              </div>
            `
          : "";

        return `
          <article class="gcb-request-item">
            <div class="gcb-request-item-top">
              <strong>${escapeHTML(request.title)}</strong>

              <div class="gcb-request-item-header-actions">
                ${priorityActions}

                <span class="gcb-request-status status-${escapeHTML(request.status)}">
                  ${escapeHTML(request.status)}
                </span>
              </div>
            </div>

            <div class="gcb-request-message">
              ${escapeHTML(request.message)}
            </div>

            ${detailsHTML}

            <div class="gcb-request-time">
              ${escapeHTML(new Date(request.createdAt).toLocaleTimeString())}
            </div>

            ${
              actions || clientDetailsHTML
                ? `
                    <div class="gcb-request-actions">
                      ${clientDetailsHTML}
                      ${actions}
                    </div>
                  `
                : ""
            }
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

  function isMobile() {
    return mediaQuery?.matches ?? window.innerWidth <= 768;
  }

  function setAutoHidden(root, hidden) {
    if (!root) {return;}

    root.classList.toggle("gcb-request-auto-hidden", Boolean(hidden));
  }

  function clearInactivityTimer() {
    if (inactivityTimer !== null) {
      clearTimeout(inactivityTimer);
      inactivityTimer = null;
    }
  }

  function showRequestWidget(root, pulse = false) {
    if (!root) {return;}

    clearInactivityTimer();
    setAutoHidden(root, false);

    if (pulse) {
      pulseRequestToggle(root);
    }
  }

  function pulseRequestToggle(root) {
    const toggle = root?.querySelector("#gcb-request-toggle");

    if (!toggle || root.classList.contains("gcb-request-auto-hidden")) {
      return;
    }

    toggle.classList.remove("gcb-request-pulse");

    // Restart the animation when multiple requests arrive quickly.
    void toggle.offsetWidth;

    toggle.classList.add("gcb-request-pulse");
  }

  function scheduleAutoShow(root) {
    clearInactivityTimer();

    inactivityTimer = setTimeout(() => {
      inactivityTimer = null;

      if (!isMobile() || expanded) {return;}

      setAutoHidden(root, false);
    }, AUTO_SHOW_DELAY);
  }

  function handleUserActivity(event, root) {
    if (!isMobile()) {
      setAutoHidden(root, false);
      clearInactivityTimer();
      return;
    }

    // Keep the Request Manager visible while the user interacts with it.
    if (event?.target instanceof Node && root?.contains(event.target)) {
      clearInactivityTimer();
      setAutoHidden(root, false);
      return;
    }

    if (expanded) {
      setAutoHidden(root, false);
      clearInactivityTimer();
      return;
    }

    // Outside interaction: hide now and show again after inactivity.
    setAutoHidden(root, true);
    scheduleAutoShow(root);
  }

  function initAutoVisibility(root) {
    mediaQuery = window.matchMedia("(max-width: 768px)");

    const onActivity = (event) => handleUserActivity(event, root);

    document.addEventListener("pointerdown", onActivity, { passive: true });
    document.addEventListener("touchstart", onActivity, { passive: true });
    document.addEventListener("keydown", onActivity);
    document.addEventListener("wheel", onActivity, { passive: true });
    document.addEventListener("scroll", onActivity, { passive: true });

    mediaQuery.addEventListener("change", (event) => {
      clearInactivityTimer();

      if (!event.matches) {
        setAutoHidden(root, false);
      } else if (!expanded) {
        scheduleAutoShow(root);
      }
    });

    setAutoHidden(root, false);
  }

  return { init, destroy };
})();

export { RequestWidget };
