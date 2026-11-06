import { RouterModule } from "../routers.js";
import { AppUtils } from "../utils/utils.js";
import { ValidationModule } from "../utils/validations.js";
import {
  getAuthArgs,
  handleInvalidSessionError,
} from "../auth/auth-error-handler.js";
import { DataTableModule } from "../components/data-table.js";

const settingsConfigurationPage = (() => {
  let initialized = false;
  const MODAL_ID = "#app-modal";

  const BACKUP_HISTORY_CACHE_KEY = "backup_history";
  const BACKUP_HISTORY_TABLE_ID = "backup-history-table";
  const BACKUP_HISTORY_TABLE_BODY_ID = "backup-history-body";
  const BACKUP_HISTORY_TABLE_TITLE = "Backup History";

  const OPERATION_LOGS_CACHE_KEY = "operationLogs";
  const OPERATION_LOGS_TABLE_ID = "operation-logs-table";
  const OPERATION_LOGS_TABLE_TITLE = "Operation Logs";
  const OPERATION_LOGS_TABLE_BODY_ID = "operation-logs-body";
  const OPERATION_LOGS_LIMIT = 200;
  let operationLogsAllRecords = [];

  const SETTINGS_CLICK_SELECTOR = [
    "[data-settings-action]",
    "#btnClearCache",
    "#btnSyncClient",
    "#btnSyncProjectLists",
    "#btnBackupAllSheets",
    "#btnSyncExternalClients",
    "#btnRefreshOperationLogs",
    "#btnOpenFormulaInjection",
  ].join(", ");

  const tabHandlers = {
    "#backups-tab-content": loadBackupHistory,
    "#logs-tab-content": loadOperationLogs,
  };

  function handleClick(e) {
    if (RouterModule.getCurrentPage() !== "settingsConfiguration") {
      return;
    }
    
    const btn = e.target.closest(SETTINGS_CLICK_SELECTOR);

    if (!btn) {
      return;
    }

    e.preventDefault();

    const settingsAction = btn.dataset.settingsAction;
    let el_id = btn.id;

    if (settingsAction) {
      el_id = settingsAction;
    }

    switch (el_id) {
      //main tab click
      case "btnClearCache":
        AppUtils.openConfirmationModal({
          ns: "clearCache",
          title: "Clear Application Cache?",
          message:
            "This will clear all temporary data from your browser's local storage. You may need to log in or reload configurations again.",
          onProceed: ($modal, $btn) => {
            clearCache($btn);
          },
        });
        break;

      case "btnSyncClient":
        AppUtils.openConfirmationModal({
          ns: "syncClient",
          title: "Sync Client Sheets?",
          message:
            "This will refresh and synchronize the client names on the main sheet. This could take a few moments to pull the latest records.",
          onProceed: ($modal, $btn) => {
            syncClientSheets($btn);
          },
        });
        break;

      case "btnSyncExternalClients":
        AppUtils.openConfirmationModal({
          ns: "syncClient",
          title: "Sync External Client Sheets?",
          message:
            "This will refresh and synchronize the client names and records from the registered external client sheets. This could take a few moments to pull the latest records.",
          onProceed: ($modal, $btn) => {
            syncExternalClientSheets($btn);
          },
        });
        break;

      case "btnSyncProjectLists":
        AppUtils.openConfirmationModal({
          ns: "syncProject",
          title: "Update Project List?",
          message:
            "This will refresh and synchronize the overall project list with the latest project records. This could take a few moments.",
          onProceed: ($modal, $btn) => {
            syncClientProjectsFromMain($btn);
          },
        });

        break;

      case "btnOpenFormulaInjection":
        openFormulaInjectionModal();
        break;

      case "create-manual-backup":
      case "btnBackupAllSheets":
        AppUtils.openConfirmationModal({
          ns: "backupAllSheets",
          title: "Create Admin Combined Backup?",
          message:
            "This will export the Google Sheets belonging to all enabled managers into one ZIP archive in the Admin Combined Backups folder. This process may take a few moments.",
          onProceed: ($modal, $btn) => {
            BackupAllSheets($btn);
          },
        });
        break;

      case "btnRefreshOperationLogs":
        refreshOperationLogs($(btn));
        break;

      case "sync-backup-history":
        refreshBackupHistory($(btn));
        break;

      default:
        // Unknown button; ignore or log if needed
        break;
    }
  }

  function clearCache(btn) {
    const loading = AppUtils.setButtonLoading(btn, "Clearing cache");

    AppUtils.clearAppCache();

    AppUtils.showDashboardToast("App cache cleared successfully!", "success");

    AppUtils.closeModal(MODAL_ID);
    
    loading.setSuccess("Cleared Cache");
  }

  async function syncExternalClientSheets(btn) {
    const loading = AppUtils.setButtonLoading(btn, "Syncing sheets");

    try {
      const [sessionId, signature] = await getAuthArgs();

      AppUtils.gScriptRun({
        gscriptFunc: "reconcileExternalSheets",
        args: [sessionId, signature],

        onSuccess: (result) => {
          const count = Array.isArray(result) ? result.length : 0;

          AppUtils.showDashboardToast(
            count
              ? `${count} external sheet(s) synchronized successfully.`
              : "External sheets are already synchronized.",
            "success",
          );

          loading.setSuccess("Clients Synced");

          AppUtils.closeModal(MODAL_ID);
        },

        onError: (err) => {
          console.error("reconcileExternalSheets failed:", err);

          AppUtils.showDashboardToast(
            "Failed to synchronize external client sheets. Please try again.",
            "error",
          );

          loading.restore();
        },
      });
    } catch (error) {
      loading.restore();

      if (handleInvalidSessionError(error)) {
        return;
      }

      AppUtils.showDashboardToast(
        error?.message || "Failed to synchronize external sheets.",
        "error",
      );
    }
  }

  async function syncClientSheets(btn) {
    const loading = AppUtils.setButtonLoading(btn, "Syncing clients");

    try {
      const [sessionId, signature] = await getAuthArgs();

      AppUtils.gScriptRun({
        gscriptFunc: "syncClientSheetList",
        args: [sessionId, signature],

        onSuccess: () => {
          AppUtils.showDashboardToast(
            "Client list synced successfully!",
            "success",
          );

          loading.setSuccess("Clients Synced");

          AppUtils.closeModal(MODAL_ID);
        },

        onError: (err) => {
          console.error("syncClientSheetList failed:", err);

          AppUtils.showDashboardToast(
            "Client list sync failed. Please try again.",
            "error",
          );

          loading.restore();
        },
      });
    } catch (error) {
      loading.restore();

      if (handleInvalidSessionError(error)) {
        return;
      }

      AppUtils.showDashboardToast(
        error?.message || "Failed to synchronize client list.",
        "error",
      );
    }
  }

  async function syncClientProjectsFromMain(btn) {
    const loading = AppUtils.setButtonLoading(btn, "Updating projects");

    try {
      const [sessionId, signature] = await getAuthArgs();

      AppUtils.gScriptRun({
        gscriptFunc: "syncClientProjects",
        args: [sessionId, signature],

        onSuccess: () => {
          AppUtils.showDashboardToast(
            "Project data updated successfully.",
            "success",
          );

          loading.setSuccess("Projects Updated");

          AppUtils.closeModal(MODAL_ID);
        },

        onError: (err) => {
          console.error("syncClientProjects failed:", err);

          AppUtils.showDashboardToast(
            "Failed to update project data. Please try again.",
            "error",
          );

          loading.restore();
        },
      });
    } catch (error) {
      loading.restore();

      if (handleInvalidSessionError(error)) {
        return;
      }

      AppUtils.showDashboardToast(
        error?.message || "Failed to synchronize project list.",
        "error",
      );
    }
  }

  async function BackupAllSheets(btn) {
    const loading = AppUtils.setButtonLoading(btn, "Creating Backup");

    try {
      const [sessionId, signature] = await getAuthArgs();

      AppUtils.gScriptRun({
        gscriptFunc: "backupAllSheets",
        args: [sessionId, signature],

        onSuccess: (result) => {
          if (!result?.success) {
            AppUtils.showDashboardToast(
              "Backup failed. Please check the operation logs.",
              "error",
            );

            loading.restore();
            return;
          }

          if (result.status === "PARTIAL") {
            AppUtils.showDashboardToast(
              "Admin combined backup partially completed. Some spreadsheets may have failed.",
              "warning",
            );
          } else {
            AppUtils.showDashboardToast(
              "Admin combined backup completed.",
              "success",
            );
          }

          loading.setSuccess(
            result.status === "PARTIAL"
              ? "Backup Partially Completed"
              : "Backup Completed",
          );

          AppUtils.closeModal(MODAL_ID);

          refreshBackupHistory();
        },

        onError: (err) => {
          console.error("Backup failed:", err);

          AppUtils.showDashboardToast("Something went wrong", "error");

          loading.restore();
        },
      });
    } catch (error) {
      loading.restore();

      if (handleInvalidSessionError(error)) {
        return;
      }

      AppUtils.showDashboardToast(
        error?.message || "Unable to backup the sheets.",
        "error",
      );
    }
  }

  function loadBackupHistory() {
    const cached = AppUtils.cacheGet(BACKUP_HISTORY_CACHE_KEY);

    loadPropertyStatus(
      "ADMIN_COMBINED_BACKUP_FOLDER_ID",
      updateBackupDestinationStatus,
    );

    if (Array.isArray(cached) && cached.length > 0) {
      renderBackupHistory(cached);

      refreshBackupHistoryInBackground(cached);

      return;
    }

    DataTableModule.showLoader(BACKUP_HISTORY_TABLE_ID);

    fetchBackupHistory();
  }

  async function fetchBackupHistory(callback = null) {
    try {
      const [sessionId, signature] = await getAuthArgs();

      AppUtils.cachedGScriptCall(
        BACKUP_HISTORY_CACHE_KEY,
        "getBackupHistory",
        [sessionId, signature],
        (result) => {
          // console.log("[BackupHistory] Backend result:", result);
          // console.log("[BackupHistory] Result success:", result?.success);
          // console.log("[BackupHistory] Backups:", result?.backups?.length);

          if (!result?.success || !Array.isArray(result.backups)) {
            AppUtils.showDashboardToast(
              "Unable to load backup history.",
              "error",
            );
            return;
          }

          renderBackupHistory(result.backups, callback);
        },
      );
    } catch (error) {
      if (handleInvalidSessionError(error)) {
        return;
      }

      AppUtils.showError(error?.message || "Failed to load backup history.");
    }
  }

  function renderBackupHistory(backups, callback = null) {
    const tbody = document.getElementById(BACKUP_HISTORY_TABLE_BODY_ID);
    const message = document.getElementById("backup-history-message");

    if (!tbody || !message) {
      console.error("[BackupHistory] Required DOM elements missing:", {
        tbodyId: BACKUP_HISTORY_TABLE_BODY_ID,
        tbodyFound: Boolean(tbody),
        messageFound: Boolean(message),
        tableFound: Boolean(document.getElementById(BACKUP_HISTORY_TABLE_ID)),
      });
      return;
    }

    // console.log("[BackupHistory] Rendering", backups?.length, "records");

    DataTableModule.hideTableOverlay(BACKUP_HISTORY_TABLE_ID);

    updateBackupSummary(backups);

    // Destroy only if already initialized
    if ($.fn.DataTable.isDataTable("#" + BACKUP_HISTORY_TABLE_ID)) {
      DataTableModule.destroy(BACKUP_HISTORY_TABLE_ID);
    }

    tbody.innerHTML = "";

    if (!Array.isArray(backups) || backups.length === 0) {
      DataTableModule.showEmpty(
        BACKUP_HISTORY_TABLE_ID,
        "No backups have been created yet.",
      );
      message.textContent = "No backup records found.";
      return;
    }

    message.textContent = `${backups.length} backup archive(s) found.`;

    backups.forEach((backup) => {
      tbody.appendChild(createBackupHistoryRow(backup));
    });

    // Initialize the table with a small delay to ensure the tab is visible
    // and DataTables can properly calculate dimensions
    setTimeout(() => {
      DataTableModule.init(
        BACKUP_HISTORY_TABLE_TITLE,
        "#" + BACKUP_HISTORY_TABLE_ID,
        false,
        {
          paging: false,
          scrollY: "420px",
          layout: {
            topStart: null,
            topEnd: null,
            bottomStart: ["info"],
            bottomEnd: ["search"],
          },
          columnAlignments: {
            0: "left",
          },
        },
      );
    }, 50);
  }

  function createBackupHistoryRow(backup) {
    const row = document.createElement("tr");

    const dateCell = document.createElement("td");
    dateCell.textContent = backup.createdAtLabel || "—";

    const nameCell = document.createElement("td");
    nameCell.textContent = backup.name || "Unnamed backup";

    const filesCell = document.createElement("td");
    filesCell.textContent = String(backup.fileCount ?? 0);

    const actionsCell = document.createElement("td");
    actionsCell.className = "text-nowrap";

    actionsCell.appendChild(createBackupDownloadAction(backup));;

    row.append(dateCell, nameCell, filesCell, actionsCell);

    return row;
  }

  function createBackupDownloadAction(backup) {
    const link = document.createElement("a");
    const zipUrl = backup.zipDownloadUrl || backup.zipUrl;

    link.className = "btn btn-link p-0 border-0";
    link.title = "Download backup ZIP";
    link.setAttribute("aria-label", `Download ${backup.name || "backup ZIP"}`);

    if (zipUrl) {
      link.href = zipUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    } else {
      link.href = "#";
      link.classList.add("disabled");
      link.setAttribute("aria-disabled", "true");
      link.title = "Backup ZIP is not available";
    }

    const icon = document.createElement("i");
    icon.className = "pe-7s-download";
    icon.setAttribute("aria-hidden", "true");

    link.appendChild(icon);

    return link;
  }

  function updateBackupSummary(backups) {
    const totalCount = document.getElementById("backup-total-count");

    const latestDate = document.getElementById("backup-latest-date");

    if (totalCount) {
      totalCount.textContent = backups.length;
    }

    if (latestDate) {
      latestDate.textContent = backups[0]?.createdAtLabel || "No backups yet";
    }
  }

  async function loadPropertyStatus(propertyId, onSuccess) {
    try {
      const [sessionId, signature] = await getAuthArgs();

      AppUtils.gScriptRun({
        gscriptFunc: "getPropertyStatus",
        args: [sessionId, signature, propertyId],

        onSuccess: (result) => {
          if (typeof onSuccess === "function") {
            onSuccess(result);
          }
        },

        onError: (error) => {
          console.error(`Failed to load status for ${propertyId}:`, error);

          if (typeof onSuccess === "function") {
            onSuccess(null);
          }
        },
      });
    } catch (error) {
      if (handleInvalidSessionError(error)) {
        return;
      }

      console.error(`Failed to request status for ${propertyId}:`, error);

      if (typeof onSuccess === "function") {
        onSuccess(null);
      }
    }
  }

  function updateBackupDestinationStatus(destination) {
    const destinationStatus = document.getElementById(
      "backup-destination-status",
    );

    if (!destinationStatus) {
      return;
    }

    const configured = Boolean(destination?.configured);

    destinationStatus.textContent = configured
      ? "Configured"
      : "Not configured";

    destinationStatus.classList.toggle("text-success", configured);

    destinationStatus.classList.toggle("text-danger", !configured);
  }

  async function refreshBackupHistory(button = null, callback = null) {
    const loading = button?.length
      ? AppUtils.setButtonLoading(button[0], false, true)
      : null;

    DataTableModule.showLoader(BACKUP_HISTORY_TABLE_ID);
    AppUtils.cacheClear(BACKUP_HISTORY_CACHE_KEY);

    try {
      const [sessionId, signature] = await getAuthArgs();

      AppUtils.cachedGScriptCall(
        BACKUP_HISTORY_CACHE_KEY,
        "getBackupHistory",
        [sessionId, signature],
        (result) => {
          loading?.restore();

          if (!result?.success || !Array.isArray(result.backups)) {
            AppUtils.showDashboardToast(
              "Something went wrong refreshing backup history!",
              "error",
            );
            return;
          }

          renderBackupHistory(result.backups, callback);
        },
        false,
        true,
      );
    } catch (error) {
      loading?.restore();

      if (handleInvalidSessionError(error)) {
        return;
      }

      AppUtils.showError(error?.message || "Failed to refresh backup history.");
    }
  }

  async function refreshBackupHistoryInBackground(cached) {
    try {
      const [sessionId, signature] = await getAuthArgs();

      AppUtils.cachedGScriptCall(
        BACKUP_HISTORY_CACHE_KEY,
        "getBackupHistory",
        [sessionId, signature],
        (result) => {
          if (!result?.success || !Array.isArray(result.backups)) {
            return;
          }

          const fresh = result.backups;

          if (JSON.stringify(fresh) === JSON.stringify(cached)) {
            return;
          }

          renderBackupHistory(fresh);
        },
        false,
        true,
      );
    } catch (error) {
      if (handleInvalidSessionError(error)) {
        return;
      }

      console.error("[BackupHistory] Background refresh failed:", error);
    }
  }

  function loadOperationLogs(forceRefresh = false, button = null) {
    const cached = getCachedOperationLogs();

    if (!forceRefresh && cached) {
      renderOperationLogs(cached);
      return;
    }

    if (forceRefresh) {
      AppUtils.cacheClear(OPERATION_LOGS_CACHE_KEY);
    }

    const loading = button?.length
      ? AppUtils.setButtonLoading(button[0], false, true)
      : null;

    DataTableModule.showLoader(OPERATION_LOGS_TABLE_ID);

    getAuthArgs()
      .then(([sessionId, signature]) => {
        AppUtils.cachedGScriptCall(
          OPERATION_LOGS_CACHE_KEY,
          "getOperationLogHistory",
          [sessionId, signature, OPERATION_LOGS_LIMIT],
          (result) => {
            loading?.restore();

            if (!result?.success || !Array.isArray(result.logs)) {
              AppUtils.showDashboardToast(
                "Unable to load operation logs.",
                "error",
              );
              return;
            }

            renderOperationLogs(result.logs);
          },
          false,
          true,
        );
      })
      .catch((error) => {
        loading?.restore();

        if (handleInvalidSessionError(error)) {
          return;
        }

        AppUtils.showError(error?.message || "Failed to load operation logs.");
      });
  }

  function refreshOperationLogs(button = null) {
    loadOperationLogs(true, button);
  }

  function renderOperationLogs(logs) {
    operationLogsAllRecords = Array.isArray(logs) ? [...logs] : [];

    const tbody = document.getElementById(OPERATION_LOGS_TABLE_BODY_ID);
    const message = document.getElementById("operation-log-message");

    if (!tbody || !message || !Array.isArray(logs)) {
      console.error("[OperationLogs] Cannot render logs:", {
        tbodyFound: Boolean(tbody),
        messageFound: Boolean(message),
        logsIsArray: Array.isArray(logs),
      });
      return;
    }

    const tableSelector = `#${OPERATION_LOGS_TABLE_ID}`;

    DataTableModule.hideTableOverlay(OPERATION_LOGS_TABLE_ID);

    if ($.fn.DataTable.isDataTable(tableSelector)) {
      DataTableModule.destroy(OPERATION_LOGS_TABLE_ID);
    }

    tbody.replaceChildren();

    logs.forEach((log) => {
      tbody.appendChild(createOperationLogRow(log));
    });

    message.textContent = `${logs.length} record(s) loaded.`;

    setTimeout(() => {
      const tableElement = document.getElementById(OPERATION_LOGS_TABLE_ID);

      if (!tableElement?.isConnected) {
        console.warn("[OperationLogs] Table is no longer in the document.");
        return;
      }

      const instance = DataTableModule.init(
        OPERATION_LOGS_TABLE_TITLE,
        tableSelector,
        false,
        {
          paging: false,
          scrollY: "80vh",
          order: [[0, "desc"]],
          layout: {
            topStart: null,
            topEnd: null,
            bottomStart: ["info"],
            bottomEnd: ["search"],
          },
        },
      );

      if (instance) {
        applyOperationLogFilters();
      }
    }, 50);
  }

  function applyOperationLogFilters() {
    const categoryElement = document.getElementById("operation-log-category");
    const statusElement = document.getElementById("operation-log-status");
    const message = document.getElementById("operation-log-message");

    const table = DataTableModule.getInstance(`#${OPERATION_LOGS_TABLE_ID}`);

    if (!categoryElement || !statusElement || !table) {
      console.warn("[OperationLogs] Filter dependencies missing.");
      return;
    }

    const selectedCategory = categoryElement.value.trim().toUpperCase();
    const selectedStatus = statusElement.value.trim().toUpperCase();

    const category = selectedCategory === "ALL" ? "" : selectedCategory;
    const status = selectedStatus === "ALL" ? "" : selectedStatus;

    const filteredLogs = operationLogsAllRecords.filter((log) => {
      const logCategory = String(log.category ?? "")
        .trim()
        .toUpperCase();
      const logStatus = String(log.status ?? "")
        .trim()
        .toUpperCase();

      return (
        (!category || logCategory === category) &&
        (!status || logStatus === status)
      );
    });

    // Replace the table's data without reinitializing DataTables.
    table.clear();

    filteredLogs.forEach((log) => {
      table.row.add(createOperationLogRow(log));
    });

    table.draw();

    if (message) {
      message.textContent = filteredLogs.length
        ? `${filteredLogs.length} record(s) shown from ${operationLogsAllRecords.length} loaded.`
        : `No logs match the selected filters. ${operationLogsAllRecords.length} record(s) loaded.`;
    }
  }

  function getCachedOperationLogs() {
    const cached = AppUtils.cacheGet(OPERATION_LOGS_CACHE_KEY);

    if (Array.isArray(cached)) {
      return cached;
    }

    if (Array.isArray(cached?.logs)) {
      return cached.logs;
    }

    return null;
  }

  function createOperationLogRow(log) {
    const row = document.createElement("tr");

    const timestampCell = document.createElement("td");
    timestampCell.textContent = formatOperationLogTimestamp(log.timestamp);

    // Sort by the actual timestamp, not the displayed date string.
    const timestamp = new Date(log.timestamp).getTime();

    timestampCell.setAttribute(
      "data-order",
      Number.isFinite(timestamp) ? String(timestamp) : "0",
    );

    const categoryCell = document.createElement("td");
    categoryCell.textContent = log.category || "GENERAL";

    const operationCell = document.createElement("td");
    operationCell.textContent = log.operation || "UNKNOWN";

    const statusCell = document.createElement("td");
    const badge = document.createElement("span");

    const statusClasses = {
      SUCCESS: "bg-success",
      PARTIAL: "bg-warning text-dark",
      FAILED: "bg-danger",
    };

    badge.className = `badge ${statusClasses[log.status] || "bg-secondary"}`;

    badge.textContent = log.status || "UNKNOWN";
    statusCell.appendChild(badge);

    const targetCell = document.createElement("td");
    targetCell.textContent = log.target || "—";

    const detailsCell = document.createElement("td");
    detailsCell.className = "text-wrap";

    const message = document.createElement("div");
    message.textContent = log.message || "No additional details.";

    detailsCell.appendChild(message);

    if (log.error) {
      const errorDetails = document.createElement("details");
      errorDetails.className = "mt-2";

      const summary = document.createElement("summary");
      summary.className = "text-danger";
      summary.textContent = "View error";

      const errorText = document.createElement("pre");
      errorText.className = "small text-wrap mt-2 mb-0";
      errorText.style.whiteSpace = "pre-wrap";
      errorText.textContent = log.error;

      errorDetails.append(summary, errorText);
      detailsCell.appendChild(errorDetails);
    }

    const metadata = document.createElement("div");
    metadata.className = "text-muted small mt-2";
    metadata.textContent =
      `${log.trigger || "UNKNOWN"} · ${Number(log.durationMs) || 0} ms` +
      ` · Processed: ${Number(log.processed) || 0}` +
      ` · Succeeded: ${Number(log.succeeded) || 0}` +
      ` · Failed: ${Number(log.failed) || 0}`;

    detailsCell.appendChild(metadata);

    row.append(
      timestampCell,
      categoryCell,
      operationCell,
      statusCell,
      targetCell,
      detailsCell,
    );

    return row;
  }

  function formatOperationLogTimestamp(value) {
    if (!value) {
      return "—";
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  }

  function handleIntegrationListClick(e) {
    const item = e.target.closest(".integration-list-item");
    if (!item) {return;}

    // Ignore "Coming soon" item
    if (item.classList.contains("integration-list-item-coming")) {return;}

    const integration = item.getAttribute("data-integration");
    if (!integration) {return;}

    // Store which integration was clicked
    AppUtils.cacheSet("selectedIntegration", integration);

    // Navigate to integrations page
    RouterModule.go("integrationsConfiguration");
  }

  function openFormulaInjectionModal() {
    const ns = ".formulaInjection";

    AppUtils.openModal(MODAL_ID, {
      size: "md",
      placement: "center",

      header: `
        <div>
          <div class="font-weight-bold">Formula Injection</div>
          <div class="text-muted small">
            Deploy formulas to selected Google Sheets.
          </div>
        </div>
      `,

      body: `
        <!-- STEP 1: CONFIGURATION -->
        <div id="formula-injection-main">

          <div class="mb-3">
            <label for="formulaInjectionTarget" class="form-label">
              Spreadsheet Target
            </label>

            <select
              id="formulaInjectionTarget"
              class="form-control js-select2"
              data-placeholder="Select spreadsheet target"
            >
              <option value=""></option>
              <option value="main">Main Sheets</option>
              <option value="external-main">External Client Sheets</option>
            </select>
          </div>

          <div class="mb-3">
            <label class="form-label d-block">
              Deployment Scope
            </label>

            <div
              id="formulaInjectionScopeOptions"
              class="d-flex flex-column gap-2"
            >
              <!-- Options are rendered according to the selected target. -->
            </div>
          </div>

          <div
            class="mb-3 d-none"
            id="formulaIndividualSheetGroup"
          >
            <label
              for="formulaIndividualSheetName"
              class="form-label"
            >
              Sheet Tab Name
            </label>

            <input
              type="text"
              class="form-control"
              id="formulaIndividualSheetName"
              placeholder="Enter exact sheet tab name"
              maxlength="100"
              autocomplete="off"
            >

            <div class="form-text">
              The exact tab name will be matched across the applicable spreadsheets.
            </div>
          </div>

          <div class="mb-3">
            <label
              for="formulaInjectionCell"
              class="form-label"
            >
              Cell Reference
            </label>

            <input
              type="text"
              class="form-control"
              id="formulaInjectionCell"
              placeholder="B39"
              autocomplete="off"
            >

            <div class="form-text">
              Example: B39, N18, or AB25.
            </div>
          </div>

          <div class="mb-3">
            <label
              for="formulaInjectionValue"
              class="form-label"
            >
              Formula
            </label>

            <textarea
              class="form-control"
              id="formulaInjectionValue"
              rows="8"
              style="height: 200px;"
              placeholder='=COUNTIF(B41:B,"<>")'
            ></textarea>
          </div>

          <div class="small text-muted">
            Review the deployment target and formula carefully before proceeding.
          </div>
        </div>

        <!-- STEP 2: REVIEW -->
        <div id="formula-injection-review" class="d-none">

          <h5 class="modal-title mb-2">
            <strong>Review Formula Injection</strong>
          </h5>

          <p class="text-muted">
            Please verify the following details before applying the formula.
          </p>

          <div class="border rounded p-3 mb-3">
            <div class="mb-3">
              <div class="small text-muted">Spreadsheet Target</div>
              <div
                class="font-weight-bold"
                id="formulaReviewTarget"
              ></div>
            </div>

            <div class="mb-3">
              <div class="small text-muted">Deployment Scope</div>
              <div
                class="font-weight-bold"
                id="formulaReviewScope"
              ></div>
            </div>

            <div
              class="mb-3 d-none"
              id="formulaReviewSheetGroup"
            >
              <div class="small text-muted">Sheet Tab Name</div>
              <div
                class="font-weight-bold"
                id="formulaReviewSheet"
              ></div>
            </div>

            <div class="mb-3">
              <div class="small text-muted">Cell Reference</div>
              <div
                class="font-weight-bold"
                id="formulaReviewCell"
              ></div>
            </div>

            <div>
              <div class="small text-muted mb-1">Formula</div>
              <pre
                id="formulaReviewValue"
                class="bg-light rounded p-2 mb-0 scroll-area-sm"
                style="white-space: pre-wrap; overflow-wrap: anywhere;"
              ></pre>
            </div>
          </div>

          <div class="alert alert-warning small mb-0">
            This operation may update multiple spreadsheets. Make sure the
            target and formula are correct before continuing.
          </div>
        </div>
      `,

      footer: `
        <!-- STEP 1 ACTIONS -->
        <div
          id="formula-injection-main-footer"
          class="d-flex gap-2"
        >
          <button
            type="button"
            class="btn btn-secondary btn-cancel"
          >
            Cancel
          </button>

          <button
            type="button"
            class="btn btn-gc btn-review-formula"
          >
            Review Formula
          </button>
        </div>

        <!-- STEP 2 ACTIONS -->
        <div
          id="formula-injection-review-footer"
          class="d-flex gap-2 d-none"
        >
          <button
            type="button"
            class="btn btn-secondary btn-modal-back"
          >
            Back
          </button>

          <button
            type="button"
            class="btn btn-success btn-proceed"
          >
            Proceed
          </button>
        </div>
      `,

      review: {
        enabled: true,

        selectors: {
          main: "#formula-injection-main, #formula-injection-main-footer",
          review: "#formula-injection-review, #formula-injection-review-footer",
          trigger: ".btn-review-formula",
          back: ".btn-modal-back",
          proceed: ".btn-proceed",
        },

        // Validate and capture the exact values being reviewed.
        getData($modal) {
          return getFormulaInjectionFormData($modal);
        },

        // Populate the review screen.
        onReview($modal, data) {
          const targetLabels = {
            main: "Main Sheets",
            "external-main": "External Client Sheets",
          };

          const scopeLabels = {
            all:
              data.target === "external-main"
                ? "All Client Sheets (Internal Tabs)"
                : "All Client Sheets",
            project: "Project Tab",
            individual: "Specific Sheet Tab",
          };

          $modal
            .find("#formulaReviewTarget")
            .text(targetLabels[data.target] || data.target);

          $modal
            .find("#formulaReviewScope")
            .text(scopeLabels[data.scope] || data.scope);

          $modal
            .find("#formulaReviewSheetGroup")
            .toggleClass("d-none", data.scope !== "individual");

          $modal.find("#formulaReviewSheet").text(data.sheetName || "");
          $modal.find("#formulaReviewCell").text(data.cellRef);
          $modal.find("#formulaReviewValue").text(data.formula);
        },

        onProceed($modal, data, $btn, controls) {
          return submitFormulaInjection($modal, $btn, data, controls);
        },
      },

      onOpen($modal) {
        $modal.off(ns);

        renderFormulaInjectionScopes($modal);

        $modal.on("change" + ns, "#formulaInjectionTarget", () => {
          renderFormulaInjectionScopes($modal);
        });

        $modal.on("change" + ns, '[name="formulaInjectionScope"]', () =>
          syncFormulaInjectionScope($modal),
        );

        $modal.on(`click${ns}`, ".btn-cancel", () => {
          AppUtils.closeModal(MODAL_ID);
        });
      },

      onClose($modal) {
        $modal.off(ns);
      },
    });
  }

  function renderFormulaInjectionScopes($modal) {
    const target = String(
      $modal.find("#formulaInjectionTarget").val() || "",
    ).trim();

    const $options = $modal.find("#formulaInjectionScopeOptions");
    const currentScope = String(
      $modal.find('[name="formulaInjectionScope"]:checked').val() || "",
    );

    const scopeOptions = {
      main: [
        {
          value: "all",
          label: "All Client Sheets",
        },
        {
          value: "individual",
          label: "Specific Sheet Tab",
        },
      ],

      "external-main": [
        {
          value: "all",
          label: "All Client Sheets (Internal Tabs)",
        },
        {
          value: "project",
          label: "Project Tab",
        },
        {
          value: "individual",
          label: "Specific Sheet Tab",
        },
      ],
    };

    const options = scopeOptions[target] || [];

    $options.html(
      options
        .map(
          (option, index) => `
          <div class="custom-control custom-radio">
            <input
              type="radio"
              class="custom-control-input"
              id="formulaScope${option.value}"
              name="formulaInjectionScope"
              value="${option.value}"
              ${currentScope === option.value || (!options.some((item) => item.value === currentScope) && index === 0) ? "checked" : ""}
            >
            <label
              class="custom-control-label"
              for="formulaScope${option.value}"
            >
              ${option.label}
            </label>
          </div>
        `,
        )
        .join(""),
    );

    syncFormulaInjectionScope($modal);
  }

  function syncFormulaInjectionScope($modal) {
    const scope = String(
      $modal.find('[name="formulaInjectionScope"]:checked').val() || "",
    );

    const $sheetGroup = $modal.find("#formulaIndividualSheetGroup");

    $sheetGroup.toggleClass("d-none", scope !== "individual");

    if (scope !== "individual") {
      $modal.find("#formulaIndividualSheetName").removeClass("is-invalid");
    }
  }

  function getFormulaInjectionFormData($modal) {
    const $target = $modal.find("#formulaInjectionTarget");
    const $sheetName = $modal.find("#formulaIndividualSheetName");
    const $cellRef = $modal.find("#formulaInjectionCell");
    const $formula = $modal.find("#formulaInjectionValue");

    const target = String($target.val() || "").trim();

    const scope = String(
      $modal.find('[name="formulaInjectionScope"]:checked').val() || "",
    ).trim();

    const sheetName = String($sheetName.val() || "").trim();

    $target.removeClass("is-invalid");
    $sheetName.removeClass("is-invalid");
    $cellRef.removeClass("is-invalid");
    $formula.removeClass("is-invalid");

    const validScopes = {
      main: ["all", "individual"],
      "external-main": ["all", "project", "individual"],
    };

    let isValid = true;
    let errorMessage = "";

    if (!Object.prototype.hasOwnProperty.call(validScopes, target)) {
      $target.addClass("is-invalid");
      isValid = false;
      errorMessage = "Please select a spreadsheet target.";
    } else if (!validScopes[target].includes(scope)) {
      isValid = false;
      errorMessage = "Please select a valid deployment scope.";
    }

    if (scope === "individual") {
      if (!sheetName) {
        $sheetName.addClass("is-invalid");
        isValid = false;
        errorMessage ||= "Please enter the exact sheet tab name.";
      } else if (sheetName.length > 100) {
        $sheetName.addClass("is-invalid");
        isValid = false;
        errorMessage ||= "Sheet tab name cannot exceed 100 characters.";
      }
    }

    const cellRefResult = ValidationModule.cellReference(
      $cellRef.val(),
      "Cell reference",
    );

    if (!cellRefResult.valid) {
      $cellRef.addClass("is-invalid");
      isValid = false;
      errorMessage ||= cellRefResult.message;
    }

    const formulaResult = ValidationModule.formula($formula.val(), "Formula");

    if (!formulaResult.valid) {
      $formula.addClass("is-invalid");
      isValid = false;
      errorMessage ||= formulaResult.message;
    }

    if (!isValid) {
      AppUtils.showDashboardToast(errorMessage, "error");
      return null;
    }

    return {
      target,
      scope,
      sheetName: scope === "individual" ? sheetName : "",
      cellRef: cellRefResult.value,
      formula: formulaResult.value,
    };
  }

  async function submitFormulaInjection($modal, $btn, data, controls = {}) {
    if (!data) {
      return false;
    }

    const loading = AppUtils.setButtonLoading($btn[0], "Injecting Formula");

    try {
      const [sessionId, signature] = await getAuthArgs();

      AppUtils.gScriptRun({
        gscriptFunc: "applyFormulaInjection",

        args: [
          sessionId,
          signature,
          data.target,
          data.scope,
          data.sheetName,
          data.cellRef,
          data.formula,
        ],

        onSuccess: (result) => {
          const updated = Number(result?.updated || 0);
          const failed = Number(result?.failed || 0);

          // if (Array.isArray(result?.results)) {
          //   console.table(result.results); 
          // }

          if (result?.success && failed === 0) {
            loading.setSuccess("Formula Applied");

            AppUtils.showDashboardToast(
              `Formula successfully applied to ${updated} sheet(s).`,
              "success",
            );

            AppUtils.closeModal(MODAL_ID);
            return;
          }

          loading.restore();

          const message =
            failed > 0
              ? `Formula injection completed with errors. Updated: ${updated}, Failed: ${failed}. Check the console for details.`
              : "Formula injection completed, but no sheets were updated.";

          AppUtils.showDashboardToast(message, "error");

          // Do not automatically retry partial deployments.
          AppUtils.closeModal(MODAL_ID);
        },

        onError: (error) => {
          console.error("applyFormulaInjection failed:", error);

          loading.restore();
          controls.release?.();

          AppUtils.showDashboardToast(
            error?.message || "Failed to inject the formula.",
            "error",
          );
        },
      });

      return true;
    } catch (error) {
      loading.restore();

      if (handleInvalidSessionError(error)) {
        return false;
      }

      console.error("Formula injection authentication failed:", error);

      AppUtils.showDashboardToast(
        error?.message || "Failed to authenticate formula injection.",
        "error",
      );

      return false;
    }
  }

  function handleTabShown(e) {
    const target = e.target.getAttribute("href");

    if (!target) {
      return;
    }

    const handler = tabHandlers[target];

    if (typeof handler === "function") {
      handler();
    }
  }

  function handleOperationLogFilterChange(e) {
    const target = e.target;

    if (
      !target ||
      !target.matches("#operation-log-category, #operation-log-status")
    ) {
      return;
    }

    // Filter the already-loaded table. No cache lookup or server call.
    applyOperationLogFilters();
  }

  function init() {
    if (initialized) {
      return;
    }
    
    initialized = true;

    document.addEventListener("click", handleClick);
    document.addEventListener("click", handleIntegrationListClick);
    document.addEventListener("shown.bs.tab", handleTabShown);
    document.addEventListener("change", handleOperationLogFilterChange);

    $(document).on(
      "change.operationLogs",
      "#operation-log-category, #operation-log-status",
      handleOperationLogFilterChange,
    );
  }

  function destroy() {
    if (!initialized) {
      return;
    }

    initialized = false;

    document.removeEventListener("click", handleClick);
    document.removeEventListener("click", handleIntegrationListClick);
    document.removeEventListener("shown.bs.tab", handleTabShown);
    document.removeEventListener("change", handleOperationLogFilterChange);

    $(document).off(".operationLogs");

    for (const tableId of [BACKUP_HISTORY_TABLE_ID, OPERATION_LOGS_TABLE_ID]) {
      if ($.fn.DataTable.isDataTable("#" + tableId)) {
        DataTableModule.destroy(tableId);
      }
    }
  }

  return {
    init,
    destroy
  };
})();

export { settingsConfigurationPage };
