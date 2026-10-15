import { RouterModule } from "../routers.js";
import { AppUtils } from "../utils.js";
import { ValidationModule } from "../validations.js";
import {
  getAuthArgs,
  handleInvalidSessionError,
} from "../auth/auth-error-handler.js";
import { DataTableModule } from "../tables/data-table.js";

const settingsConfigurationPage = (() => {
  let initialized = false;
  let masterFormulaOperationId = 0;
  let masterFormulaTimer = null;
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

  const tabHandlers = {
    "#backups-tab-content": loadBackupHistory,
    "#logs-tab-content": loadOperationLogs,
  };

  function handleClick(e) {
    const btn = e.target.closest(
      "[data-settings-action], " +
      "#btnClearCache, #btnSyncClient, #btnSyncProjectLists, " +
        "#btnBackupAllSheets, #btnAddMasterFormula, " +
        "#btnDeployExternalProjectsMainSheetFormula, " +
        "#btnDeployExternalProjectsInternalSheetFormula, " +
        "#btnSyncExternalClients, " +
        "#btnRefreshOperationLogs",
    );

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

      case "btnAddMasterFormula":
        openMasterFormulaModal();
        break;

      case "btnDeployExternalProjectsMainSheetFormula":
      case "btnDeployExternalProjectsInternalSheetFormula":
        openMasterFormulaModal(el_id);
        break;

      case "create-manual-backup":
      case "btnBackupAllSheets":
        AppUtils.openConfirmationModal({
          ns: "backupAllSheets",
          title: "Confirm All Google Sheets Backup?",
          message:
            "This will create a complete backup point for all active sheets. This process might take a few moments.",
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
              "Backup partially completed. Some files may have failed.",
              "warning",
            );
          } else {
            AppUtils.showDashboardToast("Backup completed", "success");
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

    loadPropertyStatus("BACKUP_FOLDER_ID", updateBackupDestinationStatus);

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
      return;
    }

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

    message.textContent = `${backups.length} backup folder(s) found.`;

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

    actionsCell.appendChild(createBackupActionsDropdown(backup));

    row.append(dateCell, nameCell, filesCell, actionsCell);

    return row;
  }

  function createBackupActionsDropdown(backup) {
    const wrapper = document.createElement("div");
    wrapper.className = "dropdown btn-group";

    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = "p-0 btn border-0";
    toggleButton.setAttribute("data-bs-toggle", "dropdown");
    toggleButton.setAttribute("aria-haspopup", "true");
    toggleButton.setAttribute("aria-expanded", "false");
    toggleButton.title = "Backup History actions";

    const icon = document.createElement("i");
    icon.className = "pe-7s-more";

    toggleButton.appendChild(icon);
    wrapper.appendChild(toggleButton);

    const menu = document.createElement("div");
    menu.className = "dropdown-menu";
    menu.setAttribute("tabindex", "-1");
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-hidden", "true");

    menu.appendChild(createOpenFolderItem(backup.folderUrl));

    menu.appendChild(createDownloadZipItem(backup));

    if (Array.isArray(backup.files) && backup.files.length) {
      menu.appendChild(createViewFilesSubmenu(backup.files));
    }

    wrapper.appendChild(menu);

    return wrapper;
  }

  function createOpenFolderItem(folderUrl) {
    const item = document.createElement("a");

    item.className = "dropdown-item";
    item.href = folderUrl || "#";
    item.target = "_blank";
    item.rel = "noopener noreferrer";
    item.textContent = "Open Folder";

    return item;
  }

  function createViewFilesSubmenu(files) {
    const listItem = document.createElement("li");
    listItem.className = "submenu submenu-md dropend";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "dropdown-item dropdown-toggle";
    toggle.setAttribute("role", "button");
    toggle.setAttribute("data-bs-toggle", "dropdown");
    toggle.setAttribute("aria-expanded", "false");

    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    toggle.textContent = "Individual ZIPs";

    const submenu = document.createElement("ul");
    submenu.className = "dropdown-menu";

    files.forEach((file) => {
      const fileItem = document.createElement("li");

      const fileLink = document.createElement("a");
      fileLink.className = "dropdown-item";
      fileLink.href = file.downloadUrl || file.url || "#";
      fileLink.target = "_blank";
      fileLink.rel = "noopener noreferrer";
      fileLink.textContent = file.name || "Backup ZIP";

      fileItem.appendChild(fileLink);
      submenu.appendChild(fileItem);
    });

    listItem.append(toggle, submenu);

    return listItem;
  }

  function createDownloadZipItem(backup) {
    const item = document.createElement("a");

    item.className = "dropdown-item";
    item.textContent = "Download ZIP";

    const zipUrl = backup.zipDownloadUrl || backup.zipUrl;

    if (zipUrl) {
      item.href = zipUrl;
      item.target = "_blank";
      item.rel = "noopener noreferrer";
    } else {
      item.href = "#";
      item.classList.add("disabled");
      item.setAttribute("aria-disabled", "true");
      item.title = "ZIP archive is not available for this backup.";
    }

    return item;
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
    const cached = AppUtils.cacheGet(OPERATION_LOGS_CACHE_KEY);

    if (!forceRefresh && Array.isArray(cached)) {
      renderOperationLogs(cached);
      refreshOperationLogsInBackground(cached);
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

  async function refreshOperationLogsInBackground(cached) {
    try {
      const [sessionId, signature] = await getAuthArgs();

      AppUtils.cachedGScriptCall(
        OPERATION_LOGS_CACHE_KEY,
        "getOperationLogHistory",
        [sessionId, signature, OPERATION_LOGS_LIMIT],
        (result) => {
          if (!result?.success || !Array.isArray(result.logs)) {
            return;
          }

          if (JSON.stringify(result.logs) === JSON.stringify(cached)) {
            return;
          }

          renderOperationLogs(result.logs);
        },
        false,
        true,
      );
    } catch (error) {
      if (handleInvalidSessionError(error)) {
        return;
      }

      console.error("[OperationLogs] Background refresh failed:", error);
    }
  }

  function renderOperationLogs(logs, callback = null) {
    const tbody = document.getElementById(OPERATION_LOGS_TABLE_BODY_ID);
    const message = document.getElementById("operation-log-message");

    if (!tbody || !message) {return;}

    const tableSelector = "#" + OPERATION_LOGS_TABLE_ID;

    DataTableModule.hideTableOverlay(OPERATION_LOGS_TABLE_ID);

    if ($.fn.DataTable.isDataTable(tableSelector)) {
      DataTableModule.destroy(OPERATION_LOGS_TABLE_ID);
    }

    tbody.replaceChildren();

    if (!Array.isArray(logs) || logs.length === 0) {
      DataTableModule.showEmpty(
        OPERATION_LOGS_TABLE_ID,
        "No operation logs found.",
      );

      message.textContent = "No operation records found.";
      return;
    }

    const category =
      document.getElementById("operation-log-category")?.value?.trim() || "";

    const status =
      document.getElementById("operation-log-status")?.value?.trim() || "";

    const filteredLogs = logs.filter((log) => {
      const matchesCategory =
        !category || String(log.category || "GENERAL").trim() === category;

      const matchesStatus =
        !status || String(log.status || "UNKNOWN").trim() === status;

      return matchesCategory && matchesStatus;
    });

    if (filteredLogs.length === 0) {
      DataTableModule.showEmpty(
        OPERATION_LOGS_TABLE_ID,
        "No matching operation logs found.",
      );

      message.textContent = `No logs match the selected filters. ${logs.length} record(s) loaded.`;

      return;
    }

    message.textContent = `${filteredLogs.length} record(s) shown from ${logs.length} loaded.`;

    filteredLogs.forEach((log) => {
      tbody.appendChild(createOperationLogRow(log));
    });

    setTimeout(() => {
      // Avoid initializing a table that has been removed during navigation.
      if (!document.getElementById(OPERATION_LOGS_TABLE_ID)?.isConnected) {
        return;
      }

      DataTableModule.init(
        OPERATION_LOGS_TABLE_TITLE,
        tableSelector,
        false,
        callback,
      );
    }, 50);
  }

  function createOperationLogRow(log) {
    const row = document.createElement("tr");

    const timestampCell = document.createElement("td");
    timestampCell.textContent = formatOperationLogTimestamp(log.timestamp);

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

  function startMasterFormulaOperation() {
    masterFormulaOperationId++;

    if (masterFormulaTimer) {
      clearTimeout(masterFormulaTimer);
      masterFormulaTimer = null;
    }

    return masterFormulaOperationId;
  }

  function isMasterFormulaOperationActive(operationId) {
    return operationId === masterFormulaOperationId;
  }

  function cancelMasterFormulaOperation() {
    masterFormulaOperationId++;

    if (masterFormulaTimer) {
      clearTimeout(masterFormulaTimer);
      masterFormulaTimer = null;
    }
  }

  function getMasterFormulaFormData($modal) {
    const cellRefResult = ValidationModule.cellReference(
      $modal.find("#masterFormulaCell").val(),
      "Cell reference",
    );

    if (!cellRefResult.valid) {
      AppUtils.showDashboardToast(cellRefResult.message, "error");
      return null;
    }

    const formulaResult = ValidationModule.formula(
      $modal.find("#masterFormulaValue").val(),
      "Formula",
    );

    if (!formulaResult.valid) {
      AppUtils.showDashboardToast(formulaResult.message, "error");
      return null;
    }

    return {
      cellRef: cellRefResult.value,
      formula: formulaResult.value,
    };
  }

  function openMasterFormulaModal(isNotMain = false) {
    const ns = ".masterFormula";

    AppUtils.openModal(MODAL_ID, {
      size: "md",
      placement: "center",

      header: "<div></div>",

      body: `
      <!-- STEP 1: MAIN FORM BODY -->
      <div id="main-modal-body">
        <div class="mb-3">
          <label for="masterFormulaCell" class="form-label">
            Cell Reference
          </label>

          <input
            type="text"
            class="form-none control"
            id="masterFormulaCell"
            placeholder="B39"
            autocomplete="off"
          >

          <div class="form-text">
            Example: B39, N18, or AB25.
          </div>
        </div>

        <div class="mb-3">
          <label for="masterFormulaValue" class="form-label">
            Formula
          </label>

          <textarea
            class="form-control"
            id="masterFormulaValue"
            rows="10"
            style="height: 200px;"
            placeholder='=COUNTIF(B41:B,"<>")'
          ></textarea>
        </div>

        <div class="small text-muted">
          The formula will be applied to the applicable sheets.
        </div>
      </div>

      <!-- STEP 2: REVIEW / CONFIRMATION BODY -->
      <div id="review-modal-body" class="d-none">
        <h5 class="modal-title mb-2">
          <strong>Do you want to proceed?</strong>
        </h5>

        <p>
          Please review the details before updating the spreadsheets.
        </p>
      </div>
    `,

      footer: `
      <!-- STEP 1: MAIN FOOTER -->
      <div
        id="main-modal-footer"
        class="d-flex gap-2"
      >
        <!-- APP-MODAL-MAIN-ACTIONS -->

        <button
          type="button"
          class="btn btn-secondary btn-cancel"
        >
          Cancel
        </button>

        <button
          type="button"
          class="btn btn-primary btn-save"
        >
          Apply Formula
        </button>
      </div>

      <!-- STEP 2: REVIEW FOOTER -->
      <div
        id="review-modal-footer"
        class="d-flex gap-2 d-none"
      >
        <!-- APP-MODAL-REVIEW-ACTIONS -->

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

      /*
       * ----------------------------------------------------------
       * OPTIONAL CUSTOM ACTIONS
       * ----------------------------------------------------------
       */
      footerActions: {
        review: [
          {
            label: "Apply to External Main Sheet",
            icon: "pe-7s-shuffle",
            onClick: ($modal, $btn) => {
              AppUtils.lockModal(MODAL_ID);
              applyFormulaToExternalProjectsFromModal(
                $modal,
                $(MODAL_ID).find(".btn-proceed"),
              );
            },
          },

          {
            label: "Apply to External Internal Sheets",
            icon: "pe-7s-shuffle",
            onClick: ($modal, $btn) => {
              AppUtils.lockModal(MODAL_ID);
              applyFormulaToExternalProjectSheetsFromModal(
                $modal,
                $(MODAL_ID).find(".btn-proceed"),
              );
            },
          },
        ],
      },

      onOpen($modal) {
        $modal
          .off(ns)

          /*
           * STEP 1
           * ------------------------------------------------------
           */

          .on(`click${ns}`, ".btn-cancel", () => {
            AppUtils.closeModal(MODAL_ID);
          })

          .on(`click${ns}`, ".btn-save", () => {
            const $cellInput = $modal.find("#masterFormulaCell");

            const $formulaValue = $modal.find("#masterFormulaValue");

            /*
             * Remove previous validation styling.
             */
            $cellInput.removeClass("is-invalid");
            $formulaValue.removeClass("is-invalid");

            let isValid = true;

            const cellRefResult = ValidationModule.cellReference(
              $cellInput.val(),
              "Cell reference",
            );

            const formulaResult = ValidationModule.formula(
              $formulaValue.val(),
              "Formula",
            );

            if (!cellRefResult.valid) {
              $cellInput.addClass("is-invalid");
              isValid = false;
            }

            if (!formulaResult.valid) {
              $formulaValue.addClass("is-invalid");
              isValid = false;
            }

            /*
             * Only show review if valid.
             */
            if (isValid) {
              $modal
                .find("#main-modal-body, #main-modal-footer")
                .addClass("d-none");

              $modal
                .find("#review-modal-body, #review-modal-footer")
                .removeClass("d-none");
            }
          })

          /*
           * STEP 2
           * ------------------------------------------------------
           */

          .on(`click${ns}`, ".btn-back", () => {
            $modal
              .find("#review-modal-body, #review-modal-footer")
              .addClass("d-none");

            $modal
              .find("#main-modal-body, #main-modal-footer")
              .removeClass("d-none");
          })

          .on(`click${ns}`, ".btn-proceed", () => {
            const $btn = $modal.find(".btn-proceed");

            AppUtils.lockModal(MODAL_ID);

            if (isNotMain === "btnDeployExternalProjectsInternalSheetFormula") {
              applyFormulaToExternalProjectSheetsFromModal($modal, $btn);
            } else if (
              isNotMain === "btnDeployExternalProjectsMainSheetFormula"
            ) {
              applyFormulaToExternalProjectsFromModal($modal, $btn);
            } else {
              applyMasterFormula($modal, $btn);
            }
          });
      },

      onClose($modal) {
        $modal.off(ns);
      },
    });
  }

  async function applyMasterFormula($modal, $btn) {
    const data = getMasterFormulaFormData($modal);

    if (!data) {
      return;
    }

    const { cellRef, formula } = data;

    const operationId = startMasterFormulaOperation();

    const loading = AppUtils.setButtonLoading($btn[0], "Applying Formula");

    try {
      const [sessionId, signature] = await getAuthArgs();

      AppUtils.gScriptRun({
        gscriptFunc: "applyFormulaToMainSheets",

        args: [sessionId, signature, cellRef, formula],

        onSuccess: (result) => {
          if (!isMasterFormulaOperationActive(operationId)) {
            return;
          }

          loading.setSuccess("Formula Applied");

          AppUtils.showDashboardToast(
            "Formula applied to the main spreadsheet.",
            "success",
          );

          AppUtils.closeModal(MODAL_ID);

          masterFormulaTimer = setTimeout(() => {
            masterFormulaTimer = null;

            if (!isMasterFormulaOperationActive(operationId)) {
              return;
            }

            openExternalProjectsConfirmation(cellRef, formula, operationId);
          }, 1000);
        },

        onError: (err) => {
          if (!isMasterFormulaOperationActive(operationId)) {
            return;
          }

          console.error("applyFormulaToMainSheets failed:", err);

          loading.restore();

          AppUtils.showDashboardToast(
            err?.message || "Failed to apply formula to the main spreadsheet.",
            "error",
          );
        },
      });
    } catch (error) {
      loading.restore();

      if (handleInvalidSessionError(error)) {
        return;
      }

      AppUtils.showDashboardToast(
        error?.message || "Failed to apply formula to the main sheets.",
        "error",
      );
    }
  }

  function openExternalProjectsConfirmation(cellRef, formula, operationId) {
    if (!isMasterFormulaOperationActive(operationId)) {
      return;
    }

    AppUtils.openConfirmationModal({
      ns: "externalProjects",

      title: "Update External Projects?",

      message:
        "This will apply the formula to the Projects sheet of every registered external spreadsheet, including the external template. This may take some time.",

      onProceed: ($modal, $btn) => {
        applyFormulaToExternalProjects(cellRef, formula, $btn[0], operationId);
      },

      onBack: () => {
        cancelMasterFormulaOperation();
        AppUtils.closeModal(MODAL_ID);
      },
    });
  }

  function applyFormulaToExternalProjectsFromModal($modal, $btn) {
    const data = getMasterFormulaFormData($modal);

    if (!data) {
      return;
    }

    const { cellRef, formula } = data;

    const operationId = startMasterFormulaOperation();

    applyFormulaToExternalProjects(cellRef, formula, $btn[0], operationId);
  }

  async function applyFormulaToExternalProjects(
    cellRef,
    formula,
    btn,
    operationId,
  ) {
    if (!isMasterFormulaOperationActive(operationId)) {
      return;
    }

    const loading = AppUtils.setButtonLoading(btn, "Updating Projects");

    try {
      const [sessionId, signature] = await getAuthArgs();

      AppUtils.gScriptRun({
        gscriptFunc: "applyFormulaToExternalProjects",

        args: [sessionId, signature, cellRef, formula],

        onSuccess: (result) => {
          if (!isMasterFormulaOperationActive(operationId)) {
            return;
          }

          loading.setSuccess("Formula Applied");

          AppUtils.showDashboardToast(
            `External Projects updated successfully: ${result.updated} spreadsheet(s).`,
            "success",
          );

          masterFormulaTimer = setTimeout(() => {
            masterFormulaTimer = null;

            if (!isMasterFormulaOperationActive(operationId)) {
              return;
            }

            openExternalProjectSheetsConfirmation(
              cellRef,
              formula,
              operationId,
            );
          }, 1000);
        },

        onError: (err) => {
          if (!isMasterFormulaOperationActive(operationId)) {
            return;
          }

          console.error("applyFormulaToExternalProjects failed:", err);

          loading.restore();

          AppUtils.showDashboardToast(
            err?.message || "Failed to update External Projects.",
            "error",
          );
        },
      });
    } catch (error) {
      loading.restore();

      if (handleInvalidSessionError(error)) {
        return;
      }

      AppUtils.showDashboardToast(
        error?.message || "Failed to update external projects.",
        "error",
      );
    }
  }

  function openExternalProjectSheetsConfirmation(
    cellRef,
    formula,
    operationId,
  ) {
    if (!isMasterFormulaOperationActive(operationId)) {
      return;
    }

    AppUtils.openConfirmationModal({
      ns: "externalProjectSheets",

      title: "Update External Project Sheets?",

      message:
        "This will apply the formula to the individual project sheets inside every registered external spreadsheet, including the external template. This may take some time.",

      onProceed: ($modal, $btn) => {
        applyFormulaToExternalProjectSheets(
          cellRef,
          formula,
          $btn[0],
          operationId,
        );
      },

      onBack: () => {
        cancelMasterFormulaOperation();
        AppUtils.closeModal(MODAL_ID);
      },
    });
  }

  function applyFormulaToExternalProjectSheetsFromModal($modal, $btn) {
    const data = getMasterFormulaFormData($modal);

    if (!data) {
      return;
    }

    const { cellRef, formula } = data;

    const operationId = startMasterFormulaOperation();

    applyFormulaToExternalProjectSheets(cellRef, formula, $btn[0], operationId);
  }

  async function applyFormulaToExternalProjectSheets(
    cellRef,
    formula,
    btn,
    operationId,
  ) {
    if (!isMasterFormulaOperationActive(operationId)) {
      return;
    }

    const loading = AppUtils.setButtonLoading(btn, "Updating Sheets");

    try {
      const [sessionId, signature] = await getAuthArgs();

      AppUtils.gScriptRun({
        gscriptFunc: "applyFormulaToExternalProjectSheets",

        args: [sessionId, signature, cellRef, formula],

        onSuccess: (result) => {
          if (!isMasterFormulaOperationActive(operationId)) {
            return;
          }

          loading.setSuccess("Sheets Updated");

          AppUtils.showDashboardToast(
            `External project sheets updated successfully: ${result.updated} sheet(s).`,
            "success",
          );

          cancelMasterFormulaOperation();
        },

        onError: (err) => {
          if (!isMasterFormulaOperationActive(operationId)) {
            return;
          }

          console.error("applyFormulaToExternalProjectSheets failed:", err);

          loading.restore();

          AppUtils.showDashboardToast(
            err?.message || "Failed to update external project sheets.",
            "error",
          );
        },
      });
    } catch (error) {
      loading.restore();

      if (handleInvalidSessionError(error)) {
        return;
      }

      AppUtils.showDashboardToast(
        error?.message || "Failed to update external project sheets.",
        "error",
      );
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

    const cached = AppUtils.cacheGet(OPERATION_LOGS_CACHE_KEY);

    if (Array.isArray(cached)) {
      renderOperationLogs(cached);
    } else {
      loadOperationLogs();
    }
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

    AppUtils.initSelect2(".dt-table-filters");
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
