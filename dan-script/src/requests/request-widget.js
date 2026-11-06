/* eslint-disable eqeqeq */
import { Select2Module } from "../components/select2.js";
import { RouterModule } from "../routers.js";
import { AppUtils } from "../utils/utils.js";
import { RequestManager } from "./request-manager.js";
import {
  getAuthArgs,
  handleInvalidSessionError,
} from "../auth/auth-error-handler.js";

const RequestWidget = (() => {
  let unsubscribe = null;
  let expanded = false;

  let activeCategory = "all";
  let activeBulkAction = "pause";
  let activeStatusFilter = "all";
  let isBulkActionsOpen = false;
  let isViewFilterOpen = false;

  let latestState = null;

  const AUTO_SHOW_DELAY = 10_000;

  let knownQueuedIds = null;
  let inactivityTimer = null;
  let mediaQuery = null;

  const expandedDetails = new Set();
  const expandedActions = new Set();
  const expandedClientGroups = new Set();

  const operationLogsByRequestId = new Map();
  const loadedOperationLogIds = new Set();
  const fetchingOperationLogIds = new Set();

  const OPERATION_LOG_BATCH_SIZE = 50;

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

      const bulkApplyButton = event.target.closest("[data-request-bulk-apply]");

      if (bulkApplyButton) {
        if (!latestState) {
          return;
        }

        const category = activeCategory;

        const matchesCategory = (request) =>
          category === "all" || getRequestCategory(request) === category;

        if (activeBulkAction === "pause") {
          const requestIds = latestState.queue
            .filter(
              (request) =>
                request.status === "pending" && matchesCategory(request),
            )
            .map((request) => request.id);

          const count = RequestManager.pauseRequests(requestIds);

          if (count > 0) {
            AppUtils.showDashboardToast?.(
              `${count} pending request(s) paused.`,
            );
          } else {
            AppUtils.showDashboardToast?.("No pending requests to pause.");
          }

          return;
        }

        if (activeBulkAction === "resume") {
          const requestIds = latestState.queue
            .filter(
              (request) =>
                request.status === "paused" && matchesCategory(request),
            )
            .map((request) => request.id);

          const count = RequestManager.resumeRequests(requestIds);

          if (count > 0) {
            AppUtils.showDashboardToast?.(`${count} request(s) resumed.`);
          } else {
            AppUtils.showDashboardToast?.("No paused requests to resume.");
          }

          return;
        }

        if (activeBulkAction === "retry") {
          const retryableRequests =
            RequestManager.getRetryableRequests().filter(matchesCategory);

          if (!retryableRequests.length) {
            AppUtils.showDashboardToast?.(
              "No failed or interrupted requests to retry.",
            );
            return;
          }

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
              ? "<p><strong>Interrupted requests:</strong> The server may already have completed these operations.</p>"
              : "",
            hasReportGeneration
              ? "<p><strong>Reports:</strong> A PDF or CSV may already exist. Retrying could create another file.</p>"
              : "",
            hasDelivery
              ? "<p><strong>Delivery:</strong> An email or Discord message may already have been sent. Retrying could send it again.</p>"
              : "",
          ]
            .filter(Boolean)
            .join("");

          AppUtils.openConfirmationModal({
            ns: "retryAllRequests",
            title: `Retry ${requestIds.length} Requests?`,
            message: `
              <p>You are about to retry
                <strong>${requestIds.length}</strong>
                failed or interrupted request(s).
              </p>
              ${warnings}
              <p class="mb-0">
                Verify previous results where possible before retrying.
              </p>
            `,
            onProceed: () => {
              AppUtils.closeModal("#app-modal");

              const count = RequestManager.retryRequests(requestIds);

              AppUtils.showDashboardToast?.(
                `${count} request(s) queued for retry.`,
              );
            },
            onBack: () => {
              AppUtils.closeModal("#app-modal");
            },
          });

          return;
        }

        if (activeBulkAction === "clear-history") {
          const historyIds = latestState.history
            .filter(matchesCategory)
            .map((request) => request.id);

          if (historyIds.length) {
            RequestManager.archiveHistoryByIds(historyIds);
          } else {
            AppUtils.showDashboardToast?.("No history to clear.");
          }

          return;
        }
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

      const toolbarToggle = event.target.closest(
        "[data-request-toolbar-toggle]",
      );

      if (toolbarToggle) {
        const panel = toolbarToggle.dataset.requestToolbarToggle;

        if (panel === "bulk") {
          isBulkActionsOpen = !isBulkActionsOpen;
        } else if (panel === "filter") {
          isViewFilterOpen = !isViewFilterOpen;
        }

        if (latestState) {
          render(latestState);
        }

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

      const actionsButton = event.target.closest("[data-request-actions]");

      if (actionsButton) {
        const requestId = actionsButton.dataset.requestActions;
        const actions = root.querySelector(
          `[data-request-actions-panel="${CSS.escape(requestId)}"]`,
        );

        if (actions) {
          const isExpanded = !expandedActions.has(requestId);

          if (isExpanded) {
            expandedActions.add(requestId);
          } else {
            expandedActions.delete(requestId);
          }

          actions.hidden = !isExpanded;
          actionsButton.setAttribute("aria-expanded", String(isExpanded));
          actionsButton.textContent = isExpanded
            ? "Hide actions"
            : "Show actions";
        }

        return;
      }

      const clientGroupButton = event.target.closest(
        "[data-request-client-group]",
      );

      if (clientGroupButton) {
        const groupKey = clientGroupButton.dataset.requestClientGroup;
        const groupPanel = root.querySelector(
          `[data-request-client-group-panel="${CSS.escape(groupKey)}"]`,
        );

        if (groupPanel) {
          const isExpanded = !expandedClientGroups.has(groupKey);

          if (isExpanded) {
            expandedClientGroups.add(groupKey);
          } else {
            expandedClientGroups.delete(groupKey);
          }

          groupPanel.hidden = !isExpanded;

          clientGroupButton.setAttribute("aria-expanded", String(isExpanded));

          clientGroupButton.querySelector(
            ".gcb-request-client-group-toggle",
          ).textContent = isExpanded ? "Hide requests" : "Show requests";
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

    root.addEventListener("change", (event) => {
      if (event.target.matches("#gcb-request-bulk-action")) {
        activeBulkAction = event.target.value;
        return;
      }

      if (event.target.matches("#gcb-request-status-filter")) {
        activeStatusFilter = event.target.value;

        if (latestState) {
          render(latestState);
        }
      }
    });

    unsubscribe = RequestManager.subscribe(render);
  }

  function loadRequestOperationLogs(history) {
    const requestIds = history
      .filter(
        (request) =>
          ["completed", "failed"].includes(request.status) &&
          !loadedOperationLogIds.has(request.id) &&
          !fetchingOperationLogIds.has(request.id),
      )
      .map((request) => request.id);

    if (!requestIds.length) {
      return;
    }

    const batch = requestIds.slice(0, OPERATION_LOG_BATCH_SIZE);

    batch.forEach((id) => fetchingOperationLogIds.add(id));

    fetchRequestOperationLogs(batch);
  }

  async function fetchRequestOperationLogs(requestIds) {
    try {
      const [sessionId, signature] = await getAuthArgs();

      AppUtils.gScriptRun({
        gscriptFunc: "getRequestOperationLogs",
        args: [sessionId, signature, requestIds],

        onSuccess: (result) => {
          requestIds.forEach((id) => {
            fetchingOperationLogIds.delete(id);
            loadedOperationLogIds.add(id);
            operationLogsByRequestId.set(id, []);
          });

          const logs = Array.isArray(result?.logs) ? result.logs : [];

          logs.forEach((log) => {
            const requestId = String(log.requestId || "");

            if (!requestId || !requestIds.includes(requestId)) {
              return;
            }

            const existing = operationLogsByRequestId.get(requestId) || [];

            existing.push(log);

            operationLogsByRequestId.set(requestId, existing);
          });

          if (latestState) {
            render(latestState);
          }

          // Process additional batches if more history items need logs.
          if (latestState) {
            loadRequestOperationLogs(latestState.history);
          }
        },

        onError: (error) => {
          requestIds.forEach((id) => fetchingOperationLogIds.delete(id));

          if (handleInvalidSessionError(error)) {
            return;
          }

          console.error(
            "[RequestWidget] Failed to load operation logs:",
            error,
          );
        },
      });
    } catch (error) {
      requestIds.forEach((id) => fetchingOperationLogIds.delete(id));

      if (handleInvalidSessionError(error)) {
        return;
      }

      console.error(
        "[RequestWidget] Unable to retrieve operation logs:",
        error,
      );
    }
  }

  function formatOperationLogDate(value) {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? escapeHTML(value)
      : escapeHTML(date.toLocaleString());
  }

  function renderOperationLogs(logs) {
    if (!logs?.length) {
      return "";
    }

    return `
    <div class="gcb-request-operation-logs">
      ${logs
        .map(
          (log) => `
          ${
            log.error || log.message
              ? `
                <div class="gcb-request-operation-log">
                  <div class="gcb-request-delivery-message">
                    ${escapeHTML(log.error || log.message)}
                  </div>
                </div>
              `
              : ""
          }
        `,
        )
        .join("")}
    </div>
  `;
  }

  function renderRequestOperationSummary(request, logs = []) {
    const latestLog = logs.length ? logs[logs.length - 1] : null;

    const startedAt =
      latestLog?.startedAt || request.startedAt || request.createdAt;

    const completedAt =
      latestLog?.completedAt || request.completedAt || request.updatedAt;

    const durationMs =
      latestLog?.durationMs ??
      (startedAt && completedAt
        ? Math.max(
            0,
            new Date(completedAt).getTime() - new Date(startedAt).getTime(),
          )
        : null);

    const status = String(
      latestLog?.status || request.status || "unknown",
    ).toUpperCase();

    const formatDuration = (value) => {
      if (value == null || !Number.isFinite(Number(value))) {return "—";}

      const seconds = Math.floor(Number(value) / 1000);
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;

      return minutes
        ? `${minutes}m ${remainingSeconds}s`
        : `${remainingSeconds}s`;
    };

    return `
    <div class="gcb-request-operation-summary">
      <strong class="gcb-request-section-title">
        Operation summary
      </strong>

      <div class="gcb-request-detail-row">
        <span>Started</span>
        <strong>${escapeHTML(formatOperationLogDate(startedAt) || "—")}</strong>
      </div>

      <div class="gcb-request-detail-row">
        <span>Completed / Ended</span>
        <strong>${escapeHTML(formatOperationLogDate(completedAt) || "—")}</strong>
      </div>

      <div class="gcb-request-detail-row">
        <span>Duration</span>
        <strong>${escapeHTML(formatDuration(durationMs))}</strong>
      </div>

      <div class="gcb-request-detail-row">
        <span>Status</span>
        <strong class="gcb-request-summary-status status-${escapeHTML(status.toLowerCase())}">
          ${escapeHTML(status)}
        </strong>
      </div>
    </div>
  `;
  }

  function getFriendlyRequestProgress(message) {
    const normalized = String(message || "").toLowerCase();

    const progressMessages = [
      {
        match: ["checking for an existing report"],
        title: "Checking existing reports",
        message: "Checking whether this report has already been generated.",
      },
      {
        match: ["preparing report request"],
        title: "Preparing your report",
        message: "Validating the report request and preparing its data.",
      },
      {
        match: ["reading annual performance metrics"],
        title: "Reading annual performance",
        message: "Gathering the year's performance metrics.",
      },
      {
        match: ["reading monthly hours"],
        title: "Processing monthly hours",
        message: "Gathering and organizing monthly hours.",
      },
      {
        match: ["reading monthly billing"],
        title: "Processing billing data",
        message: "Gathering monthly billing information.",
      },
      {
        match: ["calculating top 10 client exposure"],
        title: "Analyzing client activity",
        message: "Calculating the top client activity and exposure.",
      },
      {
        match: ["calculating annual targets"],
        title: "Calculating annual targets",
        message: "Preparing annual target comparisons.",
      },
      {
        match: ["saving temporary slides presentation"],
        title: "Building report layout",
        message: "Preparing the report presentation.",
      },
      {
        match: ["rendering"],
        title: "Building report pages",
        message: "Arranging report charts, tables, and summaries.",
      },
      {
        match: ["saving pdf to drive"],
        title: "Saving your report",
        message: "The PDF is being saved to your reports folder.",
      },
    ];

    const matched = progressMessages.find((item) =>
      item.match.some((value) => normalized.includes(value)),
    );

    return (
      matched || {
        title: "Processing your request",
        message: "Your report is being generated. Please wait.",
      }
    );
  }

  function getClientGroupKey(request) {
    const clientName =
      RequestManager.getRequestClientName(request) ||
      request.payload?.clientName ||
      request.payload?.client ||
      request.payload?.client_name ||
      request.clientName ||
      request.client;

    // Fallback: extract the client from titles such as
    // "Add 1.5 hours — Toki Maru"
    const titleMatch = String(request.title || "").match(/[—–-]\s*(.+)$/);

    const resolvedClient = clientName || titleMatch?.[1]?.trim() || "";

    return resolvedClient
      ? `client:${String(resolvedClient).trim().toLowerCase()}`
      : `request:${request.id}`;
  }

  function groupRequestsByClient(requests) {
    const groups = new Map();

    requests.forEach((request) => {
      const key = getClientGroupKey(request);

      const clientName =
        RequestManager.getRequestClientName(request) ||
        request.payload?.clientName ||
        request.payload?.client ||
        request.payload?.client_name ||
        request.clientName ||
        request.client ||
        String(request.title || "")
          .match(/[—–-]\s*(.+)$/)?.[1]
          ?.trim();

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          clientName: clientName || request.title || "Other request",
          requests: [],
        });
      }

      groups.get(key).requests.push(request);
    });

    return [...groups.values()];
  }

  function renderRequestCard(request, state) {
    const isRetryable = ["interrupted", "failed"].includes(request.status);
    const isHistory = state.history.some((item) => item.id === request.id);
    const requestLogs = operationLogsByRequestId.get(request.id) || [];

    const hasOperationLogs =
      isHistory &&
      ["completed", "failed"].includes(request.status) &&
      requestLogs.length > 0;

    const operationLogsHTML = hasOperationLogs
      ? renderOperationLogs(requestLogs)
      : "";

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
    const isRunning = request.status === "running";

    const friendlyProgress = isRunning
      ? getFriendlyRequestProgress(request.message)
      : null;

    const clientName = RequestManager.getRequestClientName(request);
    const isPaused = request.status === "paused";

    const isRecordHours = request.type === "record-hours";
    const isEditHours = request.type === "edit-today-hours";
    const isDeleteHours = /delete|remove/i.test(request.type);

    const hasHourDetails =
      !hasOperationLogs && (isRecordHours || isEditHours || isDeleteHours);

    const isEmailDelivery = request.type === "send-report-email";
    const isDiscordDelivery = request.type === "send-report-discord";
    const isDeliveryRequest = isEmailDelivery || isDiscordDelivery;

    const deliveryResult =
      request.result && typeof request.result === "object" ? request.result : {};

    const hasDeliveryDetails =
      !hasOperationLogs &&
      isDeliveryRequest &&
      isHistory &&
      request.status === "completed" &&
      Boolean(
        deliveryResult.recipient ||
        deliveryResult.destination ||
        deliveryResult.subject ||
        deliveryResult.reportName ||
        deliveryResult.message ||
        deliveryResult.sentAt,
      );

    const genericPayload =
      request.payload != null ? JSON.stringify(request.payload, null, 2) : "";

    const rawError =
      request.error ||
      request.result?.error ||
      (["failed", "interrupted"].includes(request.status) ? request.message : "");

    const errorDetails =
      rawError && typeof rawError === "object"
        ? JSON.stringify(rawError, null, 2)
        : String(rawError || "");

    const genericDetailsHTML = `
      ${
        !errorDetails && !genericPayload && !hasOperationLogs
          ? `<div class="gcb-request-detail-client">No additional details available.</div>`
          : ""
      }
    `;

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
      if (!record || typeof record !== "object") {return false;}

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
      records.length > 0 && records.every((record) => record.action === "delete");

    const hasDeletions = records.some((record) => record.action === "delete");

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
            ? `<button type="button" data-request-resume="${escapeHTML(request.id)}">Resume</button>`
            : `<button type="button" data-request-pause="${escapeHTML(request.id)}">Pause</button>`
        }
        <button type="button" data-request-cancel="${escapeHTML(request.id)}">Cancel</button>
      `;
    } else if (isRetryable) {
      actions = `
        <button type="button" data-request-retry="${escapeHTML(request.id)}">Retry</button>
        ${
          isHistory
            ? `<button type="button" data-request-dismiss-history="${escapeHTML(request.id)}">Remove</button>`
            : `<button type="button" data-request-dismiss="${escapeHTML(request.id)}">Remove</button>`
        }
      `;
    } else if (isHistory) {
      actions = `
        ${
          isCompletedReport
            ? `
              <button type="button" data-request-report-download="${escapeHTML(request.id)}">Download</button>
              <button type="button" data-request-report-view="${escapeHTML(request.id)}">View</button>
            `
            : ""
        }

        ${
          isCompletedCsv || isCompletedPdf
            ? `
              <div class="dropdown d-inline-block">
                <button type="button" class="dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false" aria-label="More report actions">More</button>
                <div class="dropdown-menu dropright">
                  ${
                    isCompletedCsv
                      ? `
                        <button type="button" class="dropdown-item" data-request-csv-email="${escapeHTML(request.id)}">Email CSV</button>
                        <button type="button" class="dropdown-item" data-request-csv-discord="${escapeHTML(request.id)}">Send CSV to Discord</button>
                      `
                      : ""
                  }
                  ${
                    isCompletedPdf
                      ? `
                        <button type="button" class="dropdown-item" data-request-pdf-email="${escapeHTML(request.result.reportId)}">Email PDF</button>
                        <button type="button" class="dropdown-item" data-request-pdf-discord="${escapeHTML(request.result.reportId)}">Send PDF to Discord</button>
                      `
                      : ""
                  }
                </div>
              </div>
            `
            : ""
        }

        <button type="button" data-request-dismiss-history="${escapeHTML(request.id)}">Remove</button>
      `;
    }

    const hasRequestDetails =
      !isRunning &&
      (hasOperationLogs ||
        hasHourDetails ||
        hasDeliveryDetails ||
        Boolean(errorDetails) ||
        Boolean(genericPayload));

    const detailsHTML = hasRequestDetails
      ? `
        <div
          class="gcb-request-details"
          data-request-details-panel="${escapeHTML(request.id)}"
          ${expandedDetails.has(request.id) ? "" : "hidden"}
        >
          ${isHistory ? renderRequestOperationSummary(request, requestLogs) : ""}
          ${operationLogsHTML}

          ${
            hasHourDetails
              ? `
                <div class="gcb-request-detail-client">
                  Action: <strong>${escapeHTML(actionLabel)}</strong>
                </div>

                ${records
                  .map((record) => {
                    const isDeleted = record.action === "delete";
                    const task =
                      record.task ||
                      record.project ||
                      record.originalTask ||
                      "Unknown project";
                    const type =
                      record.type || record.originalType || "Unknown type";

                    const previousHours =
                      record.originalHours ??
                      record.previousHours ??
                      record.oldHours ??
                      record.existingHours;

                    const currentHours = isDeleted
                      ? previousHours
                      : (record.updatedHours ??
                        record.newHours ??
                        record.hours ??
                        record.hour);

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
                          ${escapeHTML(previousHours)} →
                          ${escapeHTML(currentHours)} h
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
              `
              : ""
          }

          ${
            hasDeliveryDetails
              ? `
                <div class="gcb-request-delivery-details">
                  ${
                    deliveryResult.recipient
                      ? `<div class="gcb-request-detail-row"><div><strong>Recipient</strong><span>${escapeHTML(deliveryResult.recipient)}</span></div></div>`
                      : ""
                  }
                  ${
                    deliveryResult.destination
                      ? `<div class="gcb-request-detail-row"><div><strong>Destination</strong><span>${escapeHTML(deliveryResult.destination)}</span></div></div>`
                      : ""
                  }
                  ${
                    deliveryResult.subject
                      ? `<div class="gcb-request-detail-row"><div><strong>Subject</strong><span>${escapeHTML(deliveryResult.subject)}</span></div></div>`
                      : ""
                  }
                  ${
                    deliveryResult.reportName
                      ? `<div class="gcb-request-detail-row"><div><strong>Report</strong><span>${escapeHTML(deliveryResult.reportName)}</span></div></div>`
                      : ""
                  }
                  ${
                    deliveryResult.sentAt
                      ? `<div class="gcb-request-detail-row"><div><strong>Sent at</strong><span>${escapeHTML(new Date(deliveryResult.sentAt).toLocaleString())}</span></div></div>`
                      : ""
                  }
                  ${
                    deliveryResult.message
                      ? `<div class="gcb-request-delivery-message">${escapeHTML(deliveryResult.message)}</div>`
                      : ""
                  }
                  ${
                    deliveryResult.reportLink
                      ? `<div class="gcb-request-delivery-link"><a href="${escapeHTML(deliveryResult.reportLink)}" target="_blank" rel="noopener noreferrer">View report</a></div>`
                      : ""
                  }
                </div>
              `
              : ""
          }

          ${genericDetailsHTML}
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

    const hasRequestActions = Boolean(actions || clientDetailsHTML);

    const controlsHTML =
      hasRequestDetails || hasRequestActions
        ? `
          <div class="gcb-request-card-controls">
            ${
              hasRequestDetails
                ? `
                  <button
                    type="button"
                    class="gcb-request-details-toggle"
                    data-request-details="${escapeHTML(request.id)}"
                    aria-expanded="${expandedDetails.has(request.id)}"
                  >${expandedDetails.has(request.id) ? "Hide details" : "Show details"}</button>
                `
                : ""
            }

            ${
              hasRequestDetails && hasRequestActions
                ? `<span class="gcb-request-control-divider" aria-hidden="true">|</span>`
                : ""
            }

            ${
              hasRequestActions
                ? `
                  <button
                    type="button"
                    class="gcb-request-actions-toggle"
                    data-request-actions="${escapeHTML(request.id)}"
                    aria-expanded="${expandedActions.has(request.id)}"
                  >${expandedActions.has(request.id) ? "Hide actions" : "Show actions"}</button>
                `
                : ""
            }
          </div>
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
            ${[
              [
                "top",
                "Move request to top",
                "Move to top",
                "fa-angle-double-up",
                pendingIndex === 0,
              ],
              [
                "up",
                "Move request up",
                "Move up",
                "fa-angle-up",
                pendingIndex === 0,
              ],
              [
                "down",
                "Move request down",
                "Move down",
                "fa-angle-down",
                pendingIndex === pendingRequests.length - 1,
              ],
              [
                "bottom",
                "Move request to bottom",
                "Move to bottom",
                "fa-angle-double-down",
                pendingIndex === pendingRequests.length - 1,
              ],
            ]
              .map(
                ([move, aria, title, icon, disabled]) => `
              <button
                type="button"
                data-request-id="${escapeHTML(request.id)}"
                data-request-move="${move}"
                aria-label="${aria}"
                title="${title}"
                ${disabled ? "disabled" : ""}
              >
                <i class="fa ${icon}" aria-hidden="true"></i>
              </button>
            `,
              )
              .join("")}
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
          ${
            isRunning && friendlyProgress
              ? `
                <div class="gcb-request-progress">
                  <strong>${escapeHTML(friendlyProgress.title)}</strong>
                  <p>${escapeHTML(friendlyProgress.message)}</p>
                </div>
              `
              : escapeHTML(request.message)
          }
        </div>

        ${controlsHTML}
        ${detailsHTML}

        <div class="gcb-request-time">
          ${escapeHTML(new Date(request.createdAt).toLocaleTimeString())}
        </div>

        ${
          actions || clientDetailsHTML
            ? `
              <div
                class="gcb-request-actions"
                data-request-actions-panel="${escapeHTML(request.id)}"
                ${expandedActions.has(request.id) ? "" : "hidden"}
              >
                ${clientDetailsHTML}
                ${actions}
              </div>
            `
            : ""
        }
      </article>
    `;
  }

  function render(state) {
    const queuedIds = new Set(state.queue.map((request) => request.id));

    const hasNewRequest =
      knownQueuedIds !== null &&
      [...queuedIds].some((id) => !knownQueuedIds.has(id));

    knownQueuedIds = queuedIds;
    latestState = state;
    loadRequestOperationLogs(state.history);

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
      const categoryRequests = (requests) =>
        requests.filter(
          (request) =>
            activeCategory === "all" ||
            getRequestCategory(request) === activeCategory,
        );

      const pendingRequests = categoryRequests(
        state.queue.filter((request) => request.status === "pending"),
      );

      const pausedRequests = categoryRequests(
        state.queue.filter((request) => request.status === "paused"),
      );

      const retryableRequests = categoryRequests(
        RequestManager.getRetryableRequests(),
      );

      const historyRequests = categoryRequests(state.history);

      const bulkActionOptions = [
        {
          value: "pause",
          label: `Pause pending (${pendingRequests.length})`,
        },
        {
          value: "resume",
          label: `Resume paused (${pausedRequests.length})`,
        },
        {
          value: "retry",
          label: `Retry failed/interrupted (${retryableRequests.length})`,
        },
        {
          value: "clear-history",
          label: `Clear history (${historyRequests.length})`,
        },
      ];

      const statusOptions = [
        { value: "all", label: "All statuses" },
        { value: "pending", label: "Pending" },
        { value: "running", label: "Running" },
        { value: "paused", label: "Paused" },
        { value: "completed", label: "Completed" },
        { value: "failed", label: "Failed" },
        { value: "interrupted", label: "Interrupted" },
        { value: "cancelled", label: "Cancelled" },
      ];

      categoryActions.innerHTML = `
        <div class="gcb-request-toolbar">

          <div class="gcb-request-toolbar-toggles">
            <button
              type="button"
              class="gcb-request-toolbar-toggle"
              data-request-toolbar-toggle="bulk"
              aria-expanded="${isBulkActionsOpen}"
              aria-controls="gcb-request-bulk-panel"
              title="Toggle bulk actions"
            >
              <i class="pe-7s-settings fs-6" aria-hidden="true"></i>
              <span class="gcb-request-toolbar-toggle-label">Bulk actions</span>
            </button>

            <button
              type="button"
              class="gcb-request-toolbar-toggle"
              data-request-toolbar-toggle="filter"
              aria-expanded="${isViewFilterOpen}"
              aria-controls="gcb-request-filter-panel"
              title="Toggle view filter"
            >
              <i class="pe-7s-filter fs-6" aria-hidden="true"></i>
              <span class="gcb-request-toolbar-toggle-label">View filter</span>
            </button>
          </div>

          ${
            isBulkActionsOpen
              ? `
                <div
                  id="gcb-request-bulk-panel"
                  class="gcb-request-toolbar-panel"
                >
                  <div class="gcb-request-toolbar-group">
                    <label for="gcb-request-bulk-action">
                      Bulk actions
                    </label>

                    <div class="gcb-request-toolbar-controls">
                      <select
                        id="gcb-request-bulk-action"
                        class="gcb-request-select custom-select js-select2"
                      >
                        ${bulkActionOptions
                          .map(
                            (option) => `
                              <option
                                value="${option.value}"
                                ${activeBulkAction === option.value ? "selected" : ""}
                              >${escapeHTML(option.label)}</option>
                            `,
                          )
                          .join("")}
                      </select>

                      <button
                        type="button"
                        class="gcb-request-apply-action"
                        data-request-bulk-apply
                      >Apply</button>
                    </div>
                  </div>
                </div>
              `
              : ""
          }

          ${
            isViewFilterOpen
              ? `
                <div
                  id="gcb-request-filter-panel"
                  class="gcb-request-toolbar-panel"
                >
                  <div class="gcb-request-toolbar-group">
                    <label for="gcb-request-status-filter">
                      View filter
                    </label>

                    <select
                      id="gcb-request-status-filter"
                      class="gcb-request-select custom-select js-select2"
                    >
                      ${statusOptions
                        .map(
                          (option) => `
                            <option
                              value="${option.value}"
                              ${activeStatusFilter === option.value ? "selected" : ""}
                            >${escapeHTML(option.label)}</option>
                          `,
                        )
                        .join("")}
                    </select>
                  </div>
                </div>
              `
              : ""
          }

        </div>
      `;

      initToolbarSelect2();
    }

    const categoryFilteredRequests =
      activeCategory === "all"
        ? allRequests
        : allRequests.filter(
            (request) => getRequestCategory(request) === activeCategory,
          );

    const requests =
      activeStatusFilter === "all"
        ? categoryFilteredRequests
        : categoryFilteredRequests.filter(
            (request) => request.status === activeStatusFilter,
          );

    if (!requests.length) {
      list.innerHTML = `
        <div class="gcb-request-empty">
          ${
            activeStatusFilter !== "all"
              ? `No ${escapeHTML(activeStatusFilter)} requests in this category.`
              : allRequests.length
                ? `No ${escapeHTML(activeCategory)} requests yet.`
                : "No requests yet."
          }
        </div>
      `;

      return;
    }

    const groupedRequests = groupRequestsByClient(requests);

    list.innerHTML = groupedRequests
      .map((group) => {
        const isExpanded = expandedClientGroups.has(group.key);

        const counts = {
          running: group.requests.filter((r) => r.status === "running").length,
          pending: group.requests.filter((r) =>
            ["pending", "paused"].includes(r.status),
          ).length,
          completed: group.requests.filter((r) => r.status === "completed")
            .length,
          failed: group.requests.filter((r) =>
            ["failed", "interrupted"].includes(r.status),
          ).length,
        };

        const countHTML = [
          counts.running && `${counts.running} running`,
          counts.pending && `${counts.pending} pending`,
          counts.completed && `${counts.completed} completed`,
          counts.failed && `${counts.failed} failed`,
        ]
          .filter(Boolean)
          .map((label) => `<span>${label}</span>`)
          .join("");

        return `
          <section class="gcb-request-client-group">
            <header class="gcb-request-client-group-header">
              <div class="gcb-request-client-group-info">
                <strong>${escapeHTML(group.clientName)}</strong>
                <div class="gcb-request-client-group-counts">
                  ${countHTML}
                </div>
              </div>

              <button
                type="button"
                class="gcb-request-client-group-button"
                data-request-client-group="${escapeHTML(group.key)}"
                aria-expanded="${isExpanded}"
              >
                <span class="gcb-request-client-group-toggle">
                  ${isExpanded ? "Hide requests" : "Show requests"}
                </span>
              </button>
            </header>

            <div
              class="gcb-request-client-group-panel"
              data-request-client-group-panel="${escapeHTML(group.key)}"
              ${isExpanded ? "" : "hidden"}
            >
              ${group.requests
                .map((request) => renderRequestCard(request, state))
                .join("")}
            </div>
          </section>
        `;
      })
      .join("");
  }

  function destroy() {
    unsubscribe?.();
    unsubscribe = null;

    document.getElementById("gcb-request-widget")?.remove();
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

  function initToolbarSelect2() {
    const categoryActions = document.getElementById(
      "gcb-request-category-actions",
    );

    if (!categoryActions) {return;}

    const bulkAction = categoryActions.querySelector(
      "#gcb-request-bulk-action",
    );

    const statusFilter = categoryActions.querySelector(
      "#gcb-request-status-filter",
    );

    // Initialize only when the controls are not already initialized.
    if (
      bulkAction &&
      !bulkAction.classList.contains("select2-hidden-accessible")
    ) {
      Select2Module.init(bulkAction);
    }

    if (
      statusFilter &&
      !statusFilter.classList.contains("select2-hidden-accessible")
    ) {
      Select2Module.init(statusFilter);
    }
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
