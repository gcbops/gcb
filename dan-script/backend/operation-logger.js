const GCB_OPERATION_LOG_CONFIG = {
  sheetName: "GCB_Operation_Logs",
  headers: [
    "Timestamp",
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
  const spreadsheet = getMainSpreadsheet();

  if (!spreadsheet) {
    throw new Error("Unable to access the main GCB spreadsheet.");
  }

  let sheet = spreadsheet.getSheetByName(GCB_OPERATION_LOG_CONFIG.sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(GCB_OPERATION_LOG_CONFIG.sheetName);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(GCB_OPERATION_LOG_CONFIG.headers);
    sheet.setFrozenRows(1);
  }

  return sheet;
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

    sheet.appendRow([
      entry.timestamp || new Date(),
      sanitizeOperationLogText_(entry.category || "GENERAL", 100),
      sanitizeOperationLogText_(entry.operation || "UNKNOWN", 150),
      sanitizeOperationLogText_(entry.status || "UNKNOWN", 30),
      sanitizeOperationLogText_(entry.trigger || "UNKNOWN", 30),
      Math.max(0, Number(entry.durationMs) || 0),
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
function runGcbLoggedOperation_(options, callback) {
  const startedAt = Date.now();

  try {
    const result = callback();

    recordGcbOperationLog_({
      category: options.category,
      operation: options.operation,
      status: "SUCCESS",
      trigger: options.trigger || "MANUAL",
      durationMs: Date.now() - startedAt,
      processed: 1,
      succeeded: 1,
      target: options.target || "",
      message: options.successMessage || "Operation completed successfully.",
    });

    return result;
  } catch (error) {
    recordGcbOperationLog_({
      category: options.category,
      operation: options.operation,
      status: "FAILED",
      trigger: options.trigger || "MANUAL",
      durationMs: Date.now() - startedAt,
      processed: 1,
      failed: 1,
      target: options.target || "",
      message: options.failureMessage || "Operation failed.",
      error: String(error?.message || error),
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
    category: String(row[1] || "GENERAL"),
    operation: String(row[2] || "UNKNOWN"),
    status: String(row[3] || "UNKNOWN"),
    trigger: String(row[4] || "UNKNOWN"),
    durationMs: Number(row[5]) || 0,
    processed: Number(row[6]) || 0,
    succeeded: Number(row[7]) || 0,
    failed: Number(row[8]) || 0,
    target: String(row[9] || ""),
    message: String(row[10] || ""),
    error: String(row[11] || ""),
  }));

  return {
    success: true,
    logs,
    total: availableRecords,
    limit: maxRecords,
  };
}
