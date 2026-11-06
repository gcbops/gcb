const GCB_OPERATION_LOG_CONFIG = {
  sheetName: "GCB_Operation_Logs",
  headers: [
    "Timestamp",
    "Started At",
    "Completed At",
    "Request ID",
    "Manager ID",
    "Category",
    "Operation",
    "Status",
    "Trigger",
    "Duration (ms)",
    "Processed",
    "Succeeded",
    "Failed",
    "Target",
    "Message",
    "Error",
  ],
};

/**
 * Gets the operation log sheet, creating it when needed.
 * The log spreadsheet is stored in the configured backup folder.
 */

function getGcbOperationLogSheet_() {
  const registryId = String(
    PropertiesService.getScriptProperties().getProperty(
      GCB_MANAGER_REGISTRY_PROPERTY,
    ) || "",
  ).trim();

  if (!registryId) {
    throw new Error("MANAGER_REGISTRY_SPREADSHEET_ID is not configured.");
  }

  const spreadsheet = openSpreadsheetById(registryId);

  let sheet = spreadsheet.getSheetByName(GCB_OPERATION_LOG_CONFIG.sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(GCB_OPERATION_LOG_CONFIG.sheetName);
  }

  const headers = GCB_OPERATION_LOG_CONFIG.headers;
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  // -------------------------------------------------------
  // 1. INITIALIZE EMPTY SHEET
  // -------------------------------------------------------

  if (lastRow === 0 || lastColumn === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

    sheet.setFrozenRows(1);

    return sheet;
  }

  // -------------------------------------------------------
  // 2. READ EXISTING HEADERS
  // -------------------------------------------------------

  const existingHeaders = sheet
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0]
    .map((header) => String(header || "").trim());

  // Preserve additional columns not defined in the current config.
  const extraHeaders = existingHeaders.filter(
    (header) => header && !headers.includes(header),
  );

  const finalHeaders = [...headers, ...extraHeaders];

  // -------------------------------------------------------
  // 3. CHECK WHETHER MIGRATION IS NEEDED
  // -------------------------------------------------------

  const headersMatch =
    existingHeaders.length === finalHeaders.length &&
    finalHeaders.every((header, index) => existingHeaders[index] === header);

  if (!headersMatch) {
    // -----------------------------------------------------
    // 4. READ EXISTING RECORDS
    // -----------------------------------------------------

    const existingRows =
      lastRow > 1
        ? sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues()
        : [];

    // Map each existing header to its original column index.
    const headerIndexes = new Map();

    existingHeaders.forEach((header, index) => {
      if (header && !headerIndexes.has(header)) {
        headerIndexes.set(header, index);
      }
    });

    // -----------------------------------------------------
    // 5. REBUILD ROWS USING HEADER NAMES
    // -----------------------------------------------------

    const migratedRows = existingRows.map((row) => {
      return finalHeaders.map((header) => {
        const index = headerIndexes.get(header);

        return index !== undefined ? row[index] : "";
      });
    });

    // -----------------------------------------------------
    // 6. WRITE THE MIGRATED STRUCTURE
    // -----------------------------------------------------

    const migratedData = [finalHeaders, ...migratedRows];

    sheet
      .getRange(1, 1, migratedData.length, finalHeaders.length)
      .setValues(migratedData);

    console.info("[Operation Logs] Sheet schema migrated:", {
      previousColumns: existingHeaders.length,
      currentColumns: finalHeaders.length,
      existingRecords: existingRows.length,
    });
  }

  sheet.setFrozenRows(1);

  return sheet;
}

function getRequestOperationLogs(sessionId, signature, requestIds) {
  const session = requireAuthenticatedUser(sessionId, signature);

  if (!Array.isArray(requestIds)) {
    throw new Error("A list of Request IDs is required.");
  }

  const normalizedRequestIds = [
    ...new Set(
      requestIds
        .filter((id) => typeof id === "string")
        .map((id) => id.trim())
        .filter((id) => id && id.length <= 200),
    ),
  ].slice(0, 50);

  if (!normalizedRequestIds.length) {
    return {
      success: true,
      logs: [],
      total: 0,
    };
  }

  const role = String(session.role || "")
    .trim()
    .toLowerCase();

  const isAdmin = role === "admin";

  const allowedRoles = ["admin", "manager", "workforce", "staff"];

  if (!allowedRoles.includes(role)) {
    throw new Error("Your account role is not authorized for this operation.");
  }

  const authorizedManagerIds = new Set(
    isAdmin
      ? getEnabledManagerIdsForRequestLogs_()
      : getAssignedManagerIdsForUser_(session),
  );

  // No assigned manager means no manager-scoped operation logs.
  if (!isAdmin && authorizedManagerIds.size === 0) {
    return {
      success: true,
      logs: [],
      total: 0,
    };
  }

  const requestedIds = new Set(normalizedRequestIds);

  const sheet = getGcbOperationLogSheet_();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return {
      success: true,
      logs: [],
      total: 0,
    };
  }

  const headers = GCB_OPERATION_LOG_CONFIG.headers;
  const columnCount = headers.length;

  const maxRowsToScan = 5000;
  const availableRecords = lastRow - 1;
  const recordsToRead = Math.min(availableRecords, maxRowsToScan);

  const startRow = lastRow - recordsToRead + 1;

  const values = sheet
    .getRange(startRow, 1, recordsToRead, columnCount)
    .getValues()
    .reverse();

  const logs = [];

  for (const row of values) {
    const requestId = String(row[3] || "").trim();

    if (!requestId || !requestedIds.has(requestId)) {
      continue;
    }

    const managerId = String(row[4] || "").trim();

    // Admins can also inspect aggregate records with no manager ID.
    if (!isAdmin && !authorizedManagerIds.has(managerId)) {
      continue;
    }

    if (isAdmin && managerId && !authorizedManagerIds.has(managerId)) {
      continue;
    }

    logs.push({
      timestamp:
        row[0] instanceof Date ? row[0].toISOString() : String(row[0] || ""),

      startedAt:
        row[1] instanceof Date ? row[1].toISOString() : String(row[1] || ""),

      completedAt:
        row[2] instanceof Date ? row[2].toISOString() : String(row[2] || ""),

      requestId,
      managerId,

      category: String(row[5] || "GENERAL"),
      operation: String(row[6] || "UNKNOWN"),
      status: String(row[7] || "UNKNOWN"),
      trigger: String(row[8] || "UNKNOWN"),

      durationMs: Number(row[9]) || 0,
      processed: Number(row[10]) || 0,
      succeeded: Number(row[11]) || 0,
      failed: Number(row[12]) || 0,

      target: String(row[13] || ""),
      message: String(row[14] || ""),
      error: String(row[15] || ""),
    });
  }

  return {
    success: true,
    logs,
    total: logs.length,
    scanned: recordsToRead,
    truncated: availableRecords > recordsToRead,
  };
}

/**
 * Prevents log text from being interpreted as a spreadsheet formula.
 */
function sanitizeOperationLogText_(value, maxLength) {
  let text = String(value ?? "").slice(0, maxLength);

  if (/^[\s]*[=+\-@]/.test(text)) {
    text = "'" + text;
  }

  return text;
}

/**
 * Writes one operation record.
 *
 * Logging failures are reported to Apps Script execution logs and do
 * not replace the result or exception from the operation being logged.
 */
function recordGcbOperationLog_(entry = {}) {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(5000)) {
    console.error("Could not acquire lock to write GCB operation log.");
    return false;
  }

  try {
    const sheet = getGcbOperationLogSheet_();

    const completedAt = entry.completedAt
      ? new Date(entry.completedAt)
      : entry.timestamp
        ? new Date(entry.timestamp)
        : new Date();

    const durationMs = Math.max(0, Number(entry.durationMs) || 0);

    const startedAt = entry.startedAt
      ? new Date(entry.startedAt)
      : new Date(completedAt.getTime() - durationMs);

    sheet.appendRow([
      completedAt, // Timestamp
      startedAt,
      completedAt,
      sanitizeOperationLogText_(entry.requestId || "", 150),
      sanitizeOperationLogText_(entry.managerId || "", 150),

      sanitizeOperationLogText_(entry.category || "GENERAL", 100),
      sanitizeOperationLogText_(entry.operation || "UNKNOWN", 150),
      sanitizeOperationLogText_(entry.status || "UNKNOWN", 30),
      sanitizeOperationLogText_(entry.trigger || "UNKNOWN", 30),

      durationMs,
      Math.max(0, Number(entry.processed) || 0),
      Math.max(0, Number(entry.succeeded) || 0),
      Math.max(0, Number(entry.failed) || 0),

      sanitizeOperationLogText_(entry.target || "", 250),
      sanitizeOperationLogText_(entry.message || "", 1000),
      sanitizeOperationLogText_(entry.error || "", 2000),
    ]);

    return true;
  } catch (error) {
    console.error("Failed to write GCB operation log:", error);
    return false;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Shared wrapper for logging operations that succeed or throw.
 *
 * Use only around operations whose failures are represented by
 * thrown exceptions. Handle false/error results explicitly when needed.
 */
function runGcbLoggedOperation_(options = {}, callback) {
  const startedAt = new Date();

  try {
    const result = callback();

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    recordGcbOperationLog_({
      timestamp: completedAt,
      startedAt,
      completedAt,
      durationMs,

      category: options.category,
      operation: options.operation,
      status: "SUCCESS",
      trigger: options.trigger || "MANUAL",

      processed: options.processed ?? 1,
      succeeded: options.succeeded ?? 1,
      failed: options.failed ?? 0,

      target: options.target || "",
      message: options.successMessage || "Operation completed successfully.",

      requestId: options.requestId || "",
      managerId: options.managerId || "",
    });

    return result;
  } catch (error) {
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    recordGcbOperationLog_({
      timestamp: completedAt,
      startedAt,
      completedAt,
      durationMs,

      category: options.category,
      operation: options.operation,
      status: "FAILED",
      trigger: options.trigger || "MANUAL",

      processed: options.processed ?? 1,
      succeeded: 0,
      failed: options.failed ?? 1,

      target: options.target || "",
      message: options.failureMessage || "Operation failed.",

      error: String(error?.message || error),

      requestId: options.requestId || "",
      managerId: options.managerId || "",
    });

    throw error;
  }
}

function getOperationLogHistory(sessionId, signature, limit = 200) {
  requireRole(sessionId, signature, "admin");

  const maxRecords = Math.min(
    200,
    Math.max(1, Math.floor(Number(limit) || 200)),
  );

  const sheet = getGcbOperationLogSheet_();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return {
      success: true,
      logs: [],
      total: 0,
    };
  }

  const headers = GCB_OPERATION_LOG_CONFIG.headers;
  const columnCount = headers.length;
  const availableRecords = lastRow - 1;
  const recordsToRead = Math.min(availableRecords, maxRecords);
  const startRow = lastRow - recordsToRead + 1;

  // Read only the newest records, newest first.
  const values = sheet
    .getRange(startRow, 1, recordsToRead, columnCount)
    .getValues()
    .reverse();

  const logs = values.map((row) => ({
    timestamp:
      row[0] instanceof Date ? row[0].toISOString() : String(row[0] || ""),

    startedAt:
      row[1] instanceof Date ? row[1].toISOString() : String(row[1] || ""),

    completedAt:
      row[2] instanceof Date ? row[2].toISOString() : String(row[2] || ""),

    requestId: String(row[3] || ""),
    managerId: String(row[4] || ""),

    category: String(row[5] || "GENERAL"),
    operation: String(row[6] || "UNKNOWN"),
    status: String(row[7] || "UNKNOWN"),
    trigger: String(row[8] || "UNKNOWN"),

    durationMs: Number(row[9]) || 0,
    processed: Number(row[10]) || 0,
    succeeded: Number(row[11]) || 0,
    failed: Number(row[12]) || 0,

    target: String(row[13] || ""),
    message: String(row[14] || ""),
    error: String(row[15] || ""),
  }));

  return {
    success: true,
    logs,
    total: availableRecords,
    limit: maxRecords,
  };
}
