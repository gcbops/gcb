const GCB_MANAGER_REGISTRY_PROPERTY = "MANAGER_REGISTRY_SPREADSHEET_ID";
const GCB_MANAGER_REGISTRY_SHEET = "Managers";

function getManagerWorkspaceForSession_(session) {
  if (
    !session ||
    typeof session.email !== "string" ||
    !session.email.trim() ||
    typeof session.googleSub !== "string" ||
    !session.googleSub.trim()
  ) {
    throw new Error("A valid authenticated session is required.");
  }

  const registryId = String(
    PropertiesService.getScriptProperties().getProperty(
      GCB_MANAGER_REGISTRY_PROPERTY,
    ) || "",
  ).trim();

  if (!registryId) {
    throw new Error("MANAGER_REGISTRY_SPREADSHEET_ID is not configured.");
  }

  const registrySpreadsheet = openSpreadsheetById(registryId);
  const managersSheet = registrySpreadsheet.getSheetByName(
    GCB_MANAGER_REGISTRY_SHEET,
  );

  if (!managersSheet) {
    throw new Error('The manager registry is missing the "Managers" tab.');
  }

  const values = managersSheet.getDataRange().getValues();

  if (values.length < 2) {
    throw new Error("No manager assignments are configured.");
  }

  const headers = values[0].map((header) => String(header || "").trim());

  const requiredHeaders = [
    "Manager ID",
    "Manager Name",
    "Login Email",
    "Enabled",
    "Operational Spreadsheet ID",
    "External Sheets Folder ID",
    "Backup Folder ID",
    "Reports Folder ID",
  ];

  const indexes = {};

  for (const header of requiredHeaders) {
    indexes[header] = headers.indexOf(header);

    if (indexes[header] === -1) {
      throw new Error(`The Managers tab is missing the "${header}" column.`);
    }
  }

  const normalizedEmail = session.email.trim().toLowerCase();
  const matchingRows = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    const rowEmail = String(row[indexes["Login Email"]] || "")
      .trim()
      .toLowerCase();

    if (rowEmail === normalizedEmail) {
      matchingRows.push({
        row,
        rowNumber: i + 1,
      });
    }
  }

  if (matchingRows.length === 0) {
    throw new Error(
      "No manager workspace is assigned to the authenticated account.",
    );
  }

  if (matchingRows.length > 1) {
    throw new Error(
      "Multiple manager assignments exist for this account. Resolve the duplicate records.",
    );
  }

  const { row, rowNumber } = matchingRows[0];

  const enabledValue = row[indexes.Enabled];

  const enabled =
    enabledValue === true ||
    ["true", "1", "yes"].includes(
      String(enabledValue ?? "")
        .trim()
        .toLowerCase(),
    );

  if (!enabled) {
    throw new Error("The manager workspace assignment is disabled.");
  }

  const managerId = String(row[indexes["Manager ID"]] || "").trim();
  const managerName = String(row[indexes["Manager Name"]] || "").trim();
  const operationalSpreadsheetId = String(
    row[indexes["Operational Spreadsheet ID"]] || "",
  ).trim();
  const externalSheetsFolderId = String(
    row[indexes["External Sheets Folder ID"]] || "",
  ).trim();
  const backupFolderId = String(row[indexes["Backup Folder ID"]] || "").trim();

  const reportsFolderId = String(
    row[indexes["Reports Folder ID"]] || "",
  ).trim();

  const discordWebhookUrl = getManagerIntegrationSecret_(
    managerId,
    "DISCORD_WEBHOOK_URL",
  );

  const asanaAccessToken = getManagerIntegrationSecret_(
    managerId,
    "ASANA_ACCESS_TOKEN",
  );

  if (!managerId || !operationalSpreadsheetId) {
    throw new Error(
      "The manager assignment is missing its ID or operational spreadsheet ID.",
    );
  }

  if (operationalSpreadsheetId === registryId) {
    throw new Error(
      "The manager operational spreadsheet cannot be the central registry spreadsheet.",
    );
  }

  /*
   * An unconfigured folder must be blank.
   * Reject placeholder text instead of treating it as a valid folder ID.
   */
  if (
    externalSheetsFolderId &&
    !/^[A-Za-z0-9_-]{20,}$/.test(externalSheetsFolderId)
  ) {
    throw new Error(
      `The External Sheets Folder ID for manager "${managerId}" is invalid. ` +
        "Enter the actual Google Drive folder ID or leave the cell blank.",
    );
  }

  let operationalSpreadsheet;

  try {
    operationalSpreadsheet = openSpreadsheetById(operationalSpreadsheetId);
  } catch (error) {
    console.error(
      `[Manager Workspace] Unable to open the assigned spreadsheet for manager ${managerId}.`,
    );

    throw new Error(
      "The assigned manager spreadsheet could not be opened. Verify its ID and the deployment account's access.",
    );
  }

  return {
    managerId,
    managerName,
    email: normalizedEmail,
    enabled,

    externalSheetsFolderId,
    backupFolderId,
    reportsFolderId,

    discordWebhookUrl,
    asanaAccessToken,

    registryRow: rowNumber,
    spreadsheetId: operationalSpreadsheetId,
    spreadsheet: operationalSpreadsheet,
  };
}

function getManagerSpreadsheetForSession_(session) {
  return getManagerWorkspaceForSession_(session).spreadsheet;
}

function getManagerWorkspaceForCapability_(sessionId, signature, capability) {
  const session = requireCapability(sessionId, signature, capability);

  const workspace = getManagerWorkspaceForSession_(session);

  if (!workspace || !workspace.managerId || !workspace.spreadsheet) {
    throw new Error(
      "No operational spreadsheet is assigned to the authenticated manager.",
    );
  }

  return {
    session,
    workspace,
    spreadsheet: workspace.spreadsheet,
  };
}

function getManagerSheetForSession_(session, sheetName) {
  const name = String(sheetName || "").trim();

  if (!name) {
    throw new Error("A sheet name is required.");
  }

  const sheet = getManagerSpreadsheetForSession_(session).getSheetByName(name);

  if (!sheet) {
    throw new Error(`Required manager sheet "${name}" was not found.`);
  }

  return sheet;
}

function getManagerSheetSafeForSession_(session, sheetName) {
  const name = String(sheetName || "").trim();

  if (!name) {
    throw new Error("A sheet name is required.");
  }

  return getManagerSpreadsheetForSession_(session).getSheetByName(name) || null;
}

function getAllManagerExternalSpreadsheetTargets_() {
  const managers = getManagers_();
  const targets = new Map();
  const errors = [];

  managers.forEach((manager) => {
    if (!manager?.managerId || !manager?.spreadsheetId) {
      errors.push({
        managerId: manager?.managerId || null,
        error: "Manager ID or operational spreadsheet ID is missing.",
      });
      return;
    }

    try {
      const managerSS = openSpreadsheetById(manager.spreadsheetId);
      const externalSheets = getExternalSheetsInternal(managerSS);

      externalSheets.forEach((external) => {
        const spreadsheetId = String(external.spreadsheetId || "").trim();

        if (!spreadsheetId) {
          return;
        }

        if (!targets.has(spreadsheetId)) {
          targets.set(spreadsheetId, {
            spreadsheetId,
            source: "manager",
            managerId: manager.managerId,
          });
        }
      });
    } catch (error) {
      errors.push({
        managerId: manager.managerId,
        error: String(error?.message || error).slice(0, 300),
      });
    }
  });

  // The external template is intentionally shared across managers.
  const templateId = String(
    PropertiesService.getScriptProperties().getProperty(
      EXTERNAL_SHEETS_CONFIG.templateProperty,
    ) || "",
  ).trim();

  if (templateId) {
    targets.set(templateId, {
      spreadsheetId: templateId,
      source: "shared-template",
      managerId: null,
    });
  } else {
    errors.push({
      managerId: null,
      error: "The shared external template ID is not configured.",
    });
  }

  return {
    targets: [...targets.values()],
    errors,
  };
}

function getManagerChartSheet_(sessionId, signature, sheetName) {
  const workspace = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "hours.view",
  );

  return workspace?.spreadsheet?.getSheetByName(sheetName) || null;
}

function getAssignedManagerIdsForUser_(session) {
  if (
    !session ||
    typeof session.googleSub !== "string" ||
    !session.googleSub.trim() ||
    typeof session.email !== "string" ||
    !session.email.trim()
  ) {
    throw new Error("A valid authenticated user is required.");
  }

  const registryId = String(
    PropertiesService.getScriptProperties().getProperty(
      GCB_MANAGER_REGISTRY_PROPERTY,
    ) || "",
  ).trim();

  if (!registryId) {
    throw new Error("MANAGER_REGISTRY_SPREADSHEET_ID is not configured.");
  }

  const sheet = getUserAssignmentsSheet_();

  if (!sheet) {
    throw new Error('The "User Assignments" tab was not found.');
  }

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return [];
  }

  const headers = values[0].map((value) => String(value || "").trim());

  const indexes = {};

  for (const header of GCB_USER_ASSIGNMENTS_CONFIG.headers) {
    indexes[header] = headers.indexOf(header);

    if (indexes[header] === -1) {
      throw new Error(`User Assignments is missing the "${header}" column.`);
    }
  }

  const userEmail = session.email.trim().toLowerCase();
  const userSub = session.googleSub.trim();

  const managerIds = new Set();

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    const email = String(row[indexes.Email] || "")
      .trim()
      .toLowerCase();

    const googleSub = String(row[indexes["Google Sub"]] || "").trim();
    const managerId = String(row[indexes["Manager ID"]] || "").trim();

    const enabledValue = row[indexes.Enabled];

    const enabled =
      enabledValue === true ||
      ["true", "1", "yes"].includes(
        String(enabledValue ?? "")
          .trim()
          .toLowerCase(),
      );

    if (!enabled || !managerId) continue;

    // Both identity fields must match the authenticated session.
    if (email !== userEmail || googleSub !== userSub) continue;

    managerIds.add(managerId);
  }

  return [...managerIds];
}

function getEnabledManagerIdsForRequestLogs_() {
  const registryId = String(
    PropertiesService.getScriptProperties().getProperty(
      GCB_MANAGER_REGISTRY_PROPERTY,
    ) || "",
  ).trim();

  if (!registryId) {
    throw new Error("MANAGER_REGISTRY_SPREADSHEET_ID is not configured.");
  }

  const registry = openSpreadsheetById(registryId);
  const sheet = registry.getSheetByName(GCB_MANAGER_REGISTRY_SHEET);

  if (!sheet) {
    throw new Error('The manager registry is missing the "Managers" tab.');
  }

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) return [];

  const headers = values[0].map((value) => String(value || "").trim());

  const managerIdIndex = headers.indexOf("Manager ID");
  const enabledIndex = headers.indexOf("Enabled");

  if (managerIdIndex === -1 || enabledIndex === -1) {
    throw new Error(
      'The Managers tab must contain "Manager ID" and "Enabled".',
    );
  }

  const managerIds = new Set();

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    const managerId = String(row[managerIdIndex] || "").trim();

    const enabledValue = row[enabledIndex];

    const enabled =
      enabledValue === true ||
      ["true", "1", "yes"].includes(
        String(enabledValue ?? "")
          .trim()
          .toLowerCase(),
      );

    if (enabled && managerId) {
      managerIds.add(managerId);
    }
  }

  return [...managerIds];
}

function getManagers_() {
  const registryId = PropertiesService.getScriptProperties().getProperty(
    BACKUP_CONFIG.registryProperty,
  );

  if (!registryId) {
    throw new Error(
      `Missing Script Property: ${BACKUP_CONFIG.registryProperty}`,
    );
  }

  const registry = openSpreadsheetById(registryId);
  const sheet = registry.getSheetByName("Managers");

  if (!sheet) {
    throw new Error('The central registry is missing the "Managers" sheet.');
  }

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return [];
  }

  const headers = values[0].map((value) => String(value).trim().toLowerCase());

  const requiredHeaders = [
    "manager id",
    "manager name",
    "enabled",
    "operational spreadsheet id",
    "external sheets folder id",
    "backup folder id",
    "reports folder id",
  ];

  const columns = {};

  requiredHeaders.forEach((header) => {
    const index = headers.indexOf(header);

    if (index === -1) {
      throw new Error(`Managers registry is missing the "${header}" column.`);
    }

    columns[header] = index;
  });

  return values.slice(1).flatMap((row, index) => {
    const enabledValue = row[columns.enabled];
    const enabled =
      enabledValue === true ||
      ["true", "1", "yes"].includes(String(enabledValue).trim().toLowerCase());

    const managerId = String(row[columns["manager id"]] || "").trim();
    const spreadsheetId = String(
      row[columns["operational spreadsheet id"]] || "",
    ).trim();
    const externalFolderId = String(
      row[columns["external sheets folder id"]] || "",
    ).trim();
    const backupFolderId = String(
      row[columns["backup folder id"]] || "",
    ).trim();
    const reportsFolderId = String(
      row[columns["reports folder id"]] || "",
    ).trim();

    if (!enabled) {
      return [];
    }

    if (!managerId || !spreadsheetId || !backupFolderId || !reportsFolderId) {
      throw new Error(
        `Enabled manager on registry row ${index + 2} is missing a manager ID, operational spreadsheet ID, backup folder ID, or reports folder ID.`,
      );
    }

    return [
      {
        managerId,
        managerName: String(row[columns["manager name"]] || managerId).trim(),
        spreadsheetId,
        externalFolderId,
        backupFolderId,
        reportsFolderId,

        discordWebhookUrl: getManagerIntegrationSecret_(
          managerId,
          "DISCORD_WEBHOOK_URL",
        ),

        asanaAccessToken: getManagerIntegrationSecret_(
          managerId,
          "ASANA_ACCESS_TOKEN",
        ),
      },
    ];
  });
}

function runForEachEnabledManagerNotification_(handler) {
  const managers = getManagers_();

  if (!managers.length) {
    throw new Error("No enabled managers are configured.");
  }

  const results = [];

  managers.forEach((manager) => {
    const startedAt = Date.now();
    const managerId = manager.managerId || "";

    try {
      const workspace = getManagerReportWorkspace_(manager);
      const result = handler(manager, workspace);

      if (result?.skipped === true) {
        const reason = String(
          result.reason || "Notification configuration is missing.",
        );

        results.push({
          managerId,
          success: true,
          skipped: true,
          status: "SKIPPED",
          reason,
        });

        logManagerNotificationOperation_({
          managerId,
          status: "SKIPPED",
          startedAt,
          message: reason,
        });

        return;
      }

      results.push({
        managerId,
        success: true,
        status: "SUCCESS",
        result,
      });

      logManagerNotificationOperation_({
        managerId,
        status: "SUCCESS",
        startedAt,
        message: "Manager notification workflow completed successfully.",
      });
    } catch (error) {
      const message = String(error?.message || error);

      results.push({
        managerId,
        success: false,
        status: "FAILED",
        error: message,
      });

      console.error(
        `[Notification] Failed for manager ${managerId}: ${message}`,
      );

      logManagerNotificationOperation_({
        managerId,
        status: "FAILED",
        startedAt,
        message: "Manager notification workflow failed.",
        error: message,
      });
    }
  });

  const failed = results.filter((item) => !item.success);
  const skipped = results.filter((item) => item.skipped);

  const summary = {
    success: failed.length === 0,
    status: failed.length
      ? failed.length === results.length
        ? "FAILED"
        : "PARTIAL"
      : skipped.length
        ? "PARTIAL"
        : "SUCCESS",
    processed: results.length,
    succeeded: results.filter((item) => item.success && !item.skipped).length,
    skipped: skipped.length,
    failed: failed.length,
    results,
  };

  if (failed.length) {
    throw new Error(
      `${failed.length} of ${results.length} manager notification workflows failed.`,
    );
  }

  return summary;
}

function logManagerNotificationOperation_({
  managerId = "",
  status = "UNKNOWN",
  startedAt = Date.now(),
  message = "",
  error = "",
} = {}) {
  try {
    const completedAt = Date.now();

    recordGcbOperationLog_({
      timestamp: new Date(completedAt),
      startedAt,
      completedAt,
      requestId: "",
      managerId,
      category: "NOTIFICATION",
      operation: "MANAGER_NOTIFICATION",
      status,
      trigger: "SCHEDULED",
      durationMs: Math.max(0, completedAt - startedAt),
      processed: 1,
      succeeded: status === "SUCCESS" ? 1 : 0,
      failed: status === "FAILED" ? 1 : 0,
      target: managerId || "Unknown manager",
      message,
      error: String(error || "").slice(0, 2000),
    });
  } catch (logError) {
    console.error(
      `[Notification] Could not log manager ${managerId}:`,
      logError?.message || logError,
    );
  }
}

const GCB_USER_ASSIGNMENTS_CONFIG = {
  sheetName: "User Assignments",
  headers: ["Email", "Google Sub", "Manager ID", "Enabled"],
};

function getUserAssignmentsSheet_() {
  const registryId = String(
    PropertiesService.getScriptProperties().getProperty(
      GCB_MANAGER_REGISTRY_PROPERTY,
    ) || "",
  ).trim();

  if (!registryId) {
    throw new Error("MANAGER_REGISTRY_SPREADSHEET_ID is not configured.");
  }

  const registry = openSpreadsheetById(registryId);

  let sheet = registry.getSheetByName(GCB_USER_ASSIGNMENTS_CONFIG.sheetName);

  // Automatically create the tab when it doesn't exist.
  if (!sheet) {
    sheet = registry.insertSheet(GCB_USER_ASSIGNMENTS_CONFIG.sheetName);
  }

  const headers = GCB_USER_ASSIGNMENTS_CONFIG.headers;
  const lastColumn = sheet.getLastColumn();

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    const existingHeaders = sheet
      .getRange(1, 1, 1, Math.max(lastColumn, 1))
      .getValues()[0]
      .map((value) => String(value || "").trim());

    const missingHeaders = headers.filter(
      (header) => !existingHeaders.includes(header),
    );

    if (missingHeaders.length) {
      sheet
        .getRange(1, lastColumn + 1, 1, missingHeaders.length)
        .setValues([missingHeaders]);
    }
  }

  sheet.setFrozenRows(1);

  return sheet;
}

function setupUserAssignmentsSheet_() {
  const sheet = getUserAssignmentsSheet_();

  return {
    success: true,
    sheetName: sheet.getName(),
    headers: GCB_USER_ASSIGNMENTS_CONFIG.headers,
  };
}

const GCB_MANAGER_INTEGRATION_PROPERTIES = {
  DISCORD_WEBHOOK_URL: "DISCORD_WEBHOOK_URL",
  ASANA_ACCESS_TOKEN: "ASANA_ACCESS_TOKEN",
};

function getManagerIntegrationSecret_(managerId, integration) {
  const normalizedManagerId = String(managerId || "").trim();
  const propertySuffix = GCB_MANAGER_INTEGRATION_PROPERTIES[integration];

  if (!normalizedManagerId) {
    throw new Error(
      "A manager ID is required to resolve integration credentials.",
    );
  }

  if (!propertySuffix) {
    throw new Error(`Unsupported manager integration: ${integration}`);
  }

  const propertyName = `MANAGER_${normalizedManagerId}_${propertySuffix}`;

  return String(
    PropertiesService.getScriptProperties().getProperty(propertyName) || "",
  ).trim();
}

function getManagerReportWorkspace_(manager) {
  if (!manager?.managerId || !manager?.spreadsheetId) {
    throw new Error("A valid manager registry entry is required.");
  }

  if (!manager.reportsFolderId) {
    throw new Error(
      `Reports Folder ID is missing for manager "${manager.managerId}".`,
    );
  }

  const workspace = {
    managerId: manager.managerId,
    managerName: manager.managerName || manager.managerId,
    email: String(manager.email || "").trim(),

    discordWebhookUrl: String(manager.discordWebhookUrl || "").trim(),
    asanaAccessToken: String(manager.asanaAccessToken || "").trim(),

    spreadsheetId: manager.spreadsheetId,
    reportsFolderId: manager.reportsFolderId,
    spreadsheet: openSpreadsheetById(manager.spreadsheetId),
  };

  // Verify the manager's configured Reports Folder is accessible.
  getReportFolder(workspace);

  return workspace;
}

function hasEnabledManagerNotificationConfig_(type = "either") {
  const managers = getManagers_();

  return managers.some((manager) => {
    const hasDiscord = Boolean(String(manager.discordWebhookUrl || "").trim());

    const hasEmail = Boolean(String(manager.email || "").trim());

    switch (type) {
      case "discord":
        return hasDiscord;

      case "email":
        return hasEmail;

      case "either":
        return hasDiscord || hasEmail;

      default:
        throw new Error(`Unsupported notification configuration type: ${type}`);
    }
  });
}