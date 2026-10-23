const ActivityValidation = (() => {
  const MAX_CLIENT_NAME_LENGTH = 100;
  const MAX_TYPE_LENGTH = 100;
  const MAX_TASK_LENGTH = 500;

  const MIN_HOURS = 0;
  const MAX_HOURS = 24;

  function clientActivityForm(formData) {
    Validation.requireObject(formData, "Form data");

    const client = Validation.requiredString(formData.client, "Client", {
      maxLength: MAX_CLIENT_NAME_LENGTH,
    });

    const hour = Validation.number(formData.hour, "Hours", {
      min: MIN_HOURS,
      max: MAX_HOURS,
    });

    const type = Validation.requiredString(formData.type, "Type", {
      maxLength: MAX_TYPE_LENGTH,
    });

    const task = Validation.requiredString(formData.task, "Task", {
      maxLength: MAX_TASK_LENGTH,
    });

    if (task.toLowerCase() === "loading...") {
      throw new Error("Please enter a valid task.");
    }

    return {
      client,
      hour,
      type,
      task,
    };
  }

  function todayHoursRecord(record, index = 0) {
    Validation.requireObject(record, `Record ${index + 1}`);

    const row = Validation.integer(record.row, `Record ${index + 1} row`, {
      min: Validation.START_ROW,
    });

    const recordAction = Validation.action(
      record.action,
      `Record ${index + 1} action`,
    );

    const sourceSheet = Validation.optionalString(
      record.sourceSheet,
      `Record ${index + 1} source sheet`,
      {
        maxLength: 100,
      },
    );

    let sourceRow = null;

    if (
      record.sourceRow !== null &&
      record.sourceRow !== undefined &&
      String(record.sourceRow).trim() !== ""
    ) {
      sourceRow = Validation.integer(
        record.sourceRow,
        `Record ${index + 1} source row`,
        {
          min: Validation.START_ROW,
        },
      );
    }

    const snapshotFields = [
      "originalType",
      "originalTask",
      "originalHours",
      "originalDate",
    ];

    snapshotFields.forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(record, field)) {
        throw new Error(
          `Record ${index + 1} is missing its original record snapshot.`,
        );
      }
    });

    const originalType = Validation.optionalString(
      record.originalType,
      `Record ${index + 1} original type`,
      { maxLength: MAX_TYPE_LENGTH },
    );

    const originalTask = Validation.optionalString(
      record.originalTask,
      `Record ${index + 1} original task`,
      { maxLength: MAX_TASK_LENGTH },
    );

    const originalHours = Validation.number(
      record.originalHours,
      `Record ${index + 1} original hours`,
      {
        min: MIN_HOURS,
        max: MAX_HOURS,
      },
    );

    const originalDate = Validation.requiredString(
      record.originalDate,
      `Record ${index + 1} original date`,
      { maxLength: 20 },
    );

    if (recordAction === "delete") {
      return {
        row,
        action: "delete",
        sourceSheet,
        sourceRow,
        originalType,
        originalTask,
        originalHours,
        originalDate,
      };
    }

    const type = Validation.requiredString(
      record.type,
      `Record ${index + 1} type`,
      {
        maxLength: MAX_TYPE_LENGTH,
      },
    );

    const task = Validation.requiredString(
      record.task,
      `Record ${index + 1} task`,
      {
        maxLength: MAX_TASK_LENGTH,
      },
    );

    if (task.toLowerCase() === "loading...") {
      throw new Error(`Invalid task for record ${index + 1}.`);
    }

    const hours = Validation.number(record.hours, `Record ${index + 1} hours`, {
      min: MIN_HOURS,
      max: MAX_HOURS,
    });

    return {
      row,
      action: "update",
      type,
      task,
      hours,
      sourceSheet,
      sourceRow,
      originalType,
      originalTask,
      originalHours,
      originalDate,
    };
  }

  function todayHoursRecords(records) {
    if (!Array.isArray(records)) {
      throw new Error("Records must be an array.");
    }

    if (!records.length) {
      return [];
    }

    const normalized = [];
    const rows = new Set();

    records.forEach((record, index) => {
      const normalizedRecord = todayHoursRecord(record, index);

      if (rows.has(normalizedRecord.row)) {
        throw new Error(`Duplicate row submitted: ${normalizedRecord.row}`);
      }

      rows.add(normalizedRecord.row);
      normalized.push(normalizedRecord);
    });

    return normalized;
  }

  return {
    clientActivityForm,
    todayHoursRecord,
    todayHoursRecords,
  };
})();

const GCB_HOURS_REQUEST_LEDGER_CONFIG = {
  sheetName: "__GCB_HOURS_REQUEST_LEDGER",
  headers: [
    "Entry ID",
    "Batch ID",
    "Client",
    "Task",
    "Type",
    "Date",
    "Target Tab ID",
    "Target Row",
    "Applied At",
  ],
};

const GCB_TODAY_HOURS_OPERATION_LEDGER = {
  sheetName: "__GCB_TODAY_HOURS_OPS",
  headers: [
    "Request ID",
    "Payload Fingerprint",
    "Client",
    "Result JSON",
    "Applied At",
  ],
};

function withHoursSaveLock_(callback) {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    throw new Error(
      "Another hours update is in progress. Please try again in a few seconds.",
    );
  }

  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function validateManualHoursFormData(formData) {
  return ActivityValidation.clientActivityForm(formData);
}

function getHoursIdempotencyLedger_(spreadsheet) {
  if (!spreadsheet) {
    throw new Error("Unable to access the hours ledger spreadsheet.");
  }

  let ledger = spreadsheet.getSheetByName(
    GCB_HOURS_REQUEST_LEDGER_CONFIG.sheetName,
  );

  if (!ledger) {
    ledger = spreadsheet.insertSheet(GCB_HOURS_REQUEST_LEDGER_CONFIG.sheetName);
  }

  if (ledger.getLastRow() === 0) {
    ledger
      .getRange(1, 1, 1, GCB_HOURS_REQUEST_LEDGER_CONFIG.headers.length)
      .setValues([GCB_HOURS_REQUEST_LEDGER_CONFIG.headers]);

    ledger.setFrozenRows(1);
  }

  // Hide the ledger if another visible sheet is available.
  if (!ledger.isSheetHidden()) {
    const hasOtherVisibleSheet = spreadsheet
      .getSheets()
      .some(
        (sheet) =>
          sheet.getSheetId() !== ledger.getSheetId() && !sheet.isSheetHidden(),
      );

    if (hasOtherVisibleSheet) {
      ledger.hideSheet();
    }
  }

  return ledger;
}

/**
 * Gets the hours request ledger from the main GCB spreadsheet.
 * Uses the project's customized getSpreadsheet() helper.
 */
function getGcbHoursRequestLedgerSheet_() {
  const spreadsheet = getSpreadsheet();

  if (!spreadsheet) {
    throw new Error("Unable to access the main GCB spreadsheet.");
  }

  return getHoursIdempotencyLedger_(spreadsheet);
}

/**
 * Selects the correct ledger for an hours destination.
 *
 * Internal client sheets use the main GCB ledger.
 * External client sheets use a ledger in their own spreadsheet.
 */
function getHoursIdempotencyLedgerForSheet_(targetSheet) {
  const targetSpreadsheet = targetSheet.getParent();
  const mainSpreadsheet = getSpreadsheet();

  if (!mainSpreadsheet) {
    throw new Error("Unable to access the main GCB spreadsheet.");
  }

  if (targetSpreadsheet.getId() === mainSpreadsheet.getId()) {
    return getGcbHoursRequestLedgerSheet_();
  }

  return getHoursIdempotencyLedger_(targetSpreadsheet);
}

function findAppliedHoursEntry_(ledger, entryId) {
  const lastRow = ledger.getLastRow();

  if (lastRow < 2) {
    return null;
  }

  return ledger
    .getRange(2, 1, lastRow - 1, 1)
    .createTextFinder(String(entryId))
    .matchCase(true)
    .matchEntireCell(true)
    .findNext();
}

function makeCellValue_(value) {
  if (typeof value === "number") {
    return { userEnteredValue: { numberValue: value } };
  }

  return {
    userEnteredValue: {
      stringValue: String(value ?? ""),
    },
  };
}

function normalizeHoursRecordDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "M/d/yyyy");
  }

  if (typeof value === "string" && value.trim()) {
    const text = value.trim();
    const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

    if (match) {
      return `${Number(match[1])}/${Number(match[2])}/${match[3]}`;
    }
  }

  return "";
}

function toSheetsDateSerial_(date) {
  const dateOnly = new Date(date);
  dateOnly.setHours(0, 0, 0, 0);

  const utcDate = Date.UTC(
    dateOnly.getFullYear(),
    dateOnly.getMonth(),
    dateOnly.getDate(),
  );

  // Google Sheets date serial epoch: December 30, 1899.
  return utcDate / 86400000 + 25569;
}

/**
 * Applies one hours entry and its ledger record atomically.
 *
 * Must be called while holding withHoursSaveLock_().
 * The entryId must remain the same across retries.
 */
function recordClientHoursToSheetIdempotent_(
  sheet,
  data,
  entryId,
  batchId,
  clientName,
) {
  const spreadsheet = sheet.getParent();
  const ledger = getHoursIdempotencyLedgerForSheet_(sheet);

  // A previous attempt may have committed successfully even if the
  // browser did not receive its response. Never add it a second time.
  if (findAppliedHoursEntry_(ledger, entryId)) {
    return {
      success: true,
      action: "already-applied",
      duplicatePrevented: true,
    };
  }

  const { type, task, hours } = data;
  const startRow = 3;
  const today = formatDateSafe(new Date(), "M/d/yyyy");
  const lastRow = sheet.getLastRow();
  const rowCount = Math.max(1, lastRow - startRow + 1);
  const values = sheet.getRange(startRow, 5, rowCount, 4).getValues();

  let targetRow = null;
  let currentHours = 0;

  for (let i = 0; i < values.length; i++) {
    const [existingType, existingTask, existingHours, entryDate] = values[i];

    const sameType = normalizeText(existingType) === normalizeText(type);
    const sameTask = normalizeText(existingTask) === normalizeText(task);
    const sameDate = normalizeHoursRecordDate_(entryDate) === today;

    if (sameType && sameTask && sameDate) {
      targetRow = startRow + i;
      currentHours = Number(existingHours) || 0;
      break;
    }
  }

  let action;
  let requests;

  if (targetRow !== null) {
    const newHours = currentHours + hours;
    action = "updated";

    requests = [
      {
        updateCells: {
          range: {
            sheetId: sheet.getSheetId(),
            startRowIndex: targetRow - 1,
            endRowIndex: targetRow,
            startColumnIndex: 6,
            endColumnIndex: 7,
          },
          rows: [
            {
              values: [makeCellValue_(newHours)],
            },
          ],
          fields: "userEnteredValue",
        },
      },
    ];
  } else {
    targetRow = getFirstEmptyRow(sheet, 5, startRow);
    action = "created";

    requests = [
      {
        updateCells: {
          range: {
            sheetId: sheet.getSheetId(),
            startRowIndex: targetRow - 1,
            endRowIndex: targetRow,
            startColumnIndex: 4,
            endColumnIndex: 8,
          },
          rows: [
            {
              values: [
                makeCellValue_(type),
                makeCellValue_(task),
                makeCellValue_(hours),
                {
                  userEnteredValue: {
                    numberValue: toSheetsDateSerial_(new Date()),
                  },
                  userEnteredFormat: {
                    numberFormat: {
                      type: "DATE",
                      pattern: "M/d/yyyy",
                    },
                  },
                },
              ],
            },
          ],
          fields: "userEnteredValue",
        },
      },
    ];
  }

  const ledgerRow = ledger.getLastRow() + 1;

  const ledgerValues = [
    entryId,
    batchId,
    clientName,
    task,
    type,
    today,
    sheet.getSheetId(),
    targetRow,
    new Date().toISOString(),
  ];

  requests.push({
    updateCells: {
      range: {
        sheetId: ledger.getSheetId(),
        startRowIndex: ledgerRow - 1,
        endRowIndex: ledgerRow,
        startColumnIndex: 0,
        endColumnIndex: ledgerValues.length,
      },
      rows: [
        {
          values: ledgerValues.map(makeCellValue_),
        },
      ],
      fields: "userEnteredValue",
    },
  });

  // Both changes are committed together in the same spreadsheet.
  Sheets.Spreadsheets.batchUpdate({ requests }, spreadsheet.getId());

  return {
    success: true,
    action,
    duplicatePrevented: false,
    row: targetRow,
  };
}

function recordClientHoursToSheet(sheet, data) {
  const { type, task, hours } = data;

  const startRow = 3;
  const lastRow = sheet.getLastRow();

  const today = formatDateSafe(new Date(), "M/d/yyyy");

  const rowCount = Math.max(1, lastRow - startRow + 1);

  const values = sheet.getRange(startRow, 5, rowCount, 4).getValues();

  /* ---------- Update existing entry ---------- */

  for (let i = 0; i < values.length; i++) {
    const [typeDev, taskProject, existingHours, entryDate] = values[i];

    const sameType = normalizeText(typeDev) === normalizeText(type);

    const sameTask = normalizeText(taskProject) === normalizeText(task);

    const sameDate = formatDateSafe(entryDate, "M/d/yyyy") === today;

    if (sameType && sameTask && sameDate) {
      const currentHours = Number(existingHours) || 0;

      const newHours = currentHours + hours;

      sheet.getRange(startRow + i, 7).setValue(newHours);

      return {
        success: true,
        action: "updated",
      };
    }
  }

  /* ---------- Create new entry ---------- */

  const emptyRow = getFirstEmptyRow(sheet, 5, startRow);

  sheet.getRange(emptyRow, 5, 1, 4).setValues([[type, task, hours, today]]);

  return {
    success: true,
    action: "created",
  };
}

function recordManualClientHoursFromForm(sessionId, signature, formData) {
  requireRole(sessionId, signature, "admin");

  return withHoursSaveLock_(() => recordManualClientHoursFromForm_(formData));
}

function recordManualClientHoursFromForm_(formData) {
  try {
    const data = ActivityValidation.clientActivityForm(formData);

    const clientSheet = getSheetSafe(data.client);

    if (!clientSheet) {
      throw new Error(`Sheet "${data.client}" not found.`);
    }

    return recordClientHoursToSheet(clientSheet, {
      type: data.type,
      task: data.task,
      hours: data.hour,
    });
  } catch (err) {
    throw new Error(err.message || String(err));
  }
}

function recordExternalClientHoursFromForm(sessionId, signature, formData) {
  requireRole(sessionId, signature, "admin");

  return withHoursSaveLock_(() => recordExternalClientHoursFromForm_(formData));
}

function recordExternalClientHoursFromForm_(formData) {
  try {
    const data = ActivityValidation.clientActivityForm(formData);

    const registrySheet = getSheetSafe("External Sheets");

    if (!registrySheet || registrySheet.getLastRow() < 2) {
      throw new Error("External Sheets registry not found.");
    }

    const values = registrySheet
      .getRange(2, 1, registrySheet.getLastRow() - 1, 5)
      .getValues();

    const normalizedClient = normalizeText(data.client);

    const externalRow = values.find(
      (row) =>
        normalizeText(String(row[1] || "")) === normalizedClient &&
        String(row[0] || "").trim() !== "",
    );

    if (!externalRow) {
      throw new Error(
        `External client "${data.client}" was not found in the External Sheets registry.`,
      );
    }

    const spreadsheetId = String(externalRow[0] || "").trim();

    if (!spreadsheetId) {
      throw new Error(
        `No spreadsheet ID found for external client "${data.client}".`,
      );
    }

    let externalSS;

    try {
      externalSS = SpreadsheetApp.openById(spreadsheetId);
    } catch (err) {
      throw new Error(
        `Unable to access the external spreadsheet for "${data.client}".`,
      );
    }

    // const taskName = data.task;

    // const projectSheet = externalSS.getSheetByName(taskName);

    // if (!projectSheet) {
    //   throw new Error(
    //     `Project sheet "${taskName}" was not found in the external spreadsheet for "${data.client}".`,
    //   );
    // }

    const taskName = data.task;
    const availableSheets = externalSS
      .getSheets()
      .map((sheet) => sheet.getName());

    const projectSheet = externalSS.getSheetByName(taskName);

    if (!projectSheet) {
      throw new Error(
        [
          `Project sheet "${taskName}" was not found.`,
          `Client: ${data.client}`,
          `Spreadsheet: ${externalSS.getName()}`,
          `Spreadsheet ID: ${spreadsheetId}`,
          `Available sheets: ${JSON.stringify(availableSheets)}`,
        ].join("\n"),
      );
    }

    const sheetName = projectSheet.getName();

    if (sheetName === "Projects" || sheetName === "BLANK") {
      throw new Error(`Invalid project sheet "${sheetName}".`);
    }

    const result = recordClientHoursToSheet(projectSheet, {
      type: data.type,
      task: data.task,
      hours: data.hour,
    });

    combineExternalSheetData(spreadsheetId);

    return result;
  } catch (err) {
    throw new Error(err?.message || String(err));
  }
}

function validateHoursBatchFormData_(formData) {
  Validation.requireObject(formData, "Batch form data");

  const client = Validation.requiredString(formData.client, "Client", {
    maxLength: 100,
  });

  const requestId = Validation.requiredString(
    formData.requestId,
    "Request ID",
    { maxLength: 200 },
  );

  if (!Array.isArray(formData.records) || formData.records.length === 0) {
    throw new Error("At least one hours entry is required.");
  }

  const records = formData.records.map((record, index) => {
    try {
      const validated = ActivityValidation.clientActivityForm({
        client,
        type: record?.type,
        task: record?.task,
        hour: record?.hour,
      });

      return {
        type: validated.type,
        task: validated.task,
        hour: validated.hour,
      };
    } catch (error) {
      throw new Error(
        `Invalid hours entry ${index + 1}: ${error.message || String(error)}`,
      );
    }
  });

  return { client, requestId, records };
}

/**
 * Records a batch of hours for an internal GCB client.
 *
 * Each entry has a stable ID derived from the request ID and its
 * position. A retry skips entries that were already committed.
 */
function recordManualClientHoursBatchFromForm(sessionId, signature, formData) {
  requireRole(sessionId, signature, "admin");

  return withHoursSaveLock_(() =>
    recordManualClientHoursBatchFromForm_(formData),
  );
}

function recordManualClientHoursBatchFromForm_(formData) {
  const batch = validateHoursBatchFormData_(formData);
  const clientSheet = getSheetSafe(batch.client);

  if (!clientSheet) {
    throw new Error(`Sheet "${batch.client}" not found.`);
  }

  const results = [];

  batch.records.forEach((record, index) => {
    const entryId = `${batch.requestId}:${index + 1}`;

    results.push(
      recordClientHoursToSheetIdempotent_(
        clientSheet,
        {
          type: record.type,
          task: record.task,
          hours: record.hour,
        },
        entryId,
        batch.requestId,
        batch.client,
      ),
    );
  });

  return {
    success: true,
    client: batch.client,
    requestId: batch.requestId,
    entries: results.length,
    duplicatePrevented: results.filter((result) => result.duplicatePrevented)
      .length,
    results,
  };
}

/**
 * Records a batch of hours for an external client.
 *
 * The hours and ledger entries are written to the external
 * spreadsheet together. External summary data is synchronized
 * after all entries have been applied.
 */
function recordExternalClientHoursBatchFromForm(
  sessionId,
  signature,
  formData,
) {
  requireRole(sessionId, signature, "admin");

  return withHoursSaveLock_(() =>
    recordExternalClientHoursBatchFromForm_(formData),
  );
}

function recordExternalClientHoursBatchFromForm_(formData) {
  const batch = validateHoursBatchFormData_(formData);

  const registrySheet = getSheetSafe("External Sheets");

  if (!registrySheet || registrySheet.getLastRow() < 2) {
    throw new Error("External Sheets registry not found.");
  }

  const registryValues = registrySheet
    .getRange(2, 1, registrySheet.getLastRow() - 1, 5)
    .getValues();

  const normalizedClient = normalizeText(batch.client);

  const externalRow = registryValues.find(
    (row) =>
      normalizeText(String(row[1] || "")) === normalizedClient &&
      String(row[0] || "").trim() !== "",
  );

  if (!externalRow) {
    throw new Error(
      `External client "${batch.client}" was not found in the External Sheets registry.`,
    );
  }

  const spreadsheetId = String(externalRow[0] || "").trim();

  let externalSS;

  try {
    externalSS = SpreadsheetApp.openById(spreadsheetId);
  } catch (error) {
    throw new Error(
      `Unable to access the external spreadsheet for "${batch.client}".`,
    );
  }

  // Resolve and validate all project sheets before writing any hours.
  const resolvedRecords = batch.records.map((record, index) => {
    const projectSheet = externalSS.getSheetByName(record.task);

    if (!projectSheet) {
      throw new Error(
        [
          `Project sheet "${record.task}" was not found.`,
          `Client: ${batch.client}`,
          `Spreadsheet: ${externalSS.getName()}`,
          `Available sheets: ${JSON.stringify(
            externalSS.getSheets().map((sheet) => sheet.getName()),
          )}`,
        ].join("\n"),
      );
    }

    const sheetName = projectSheet.getName();

    if (sheetName === "Projects" || sheetName === "BLANK") {
      throw new Error(`Invalid project sheet "${sheetName}".`);
    }

    return {
      ...record,
      projectSheet,
      entryId: `${batch.requestId}:${index + 1}`,
    };
  });

  const results = [];

  resolvedRecords.forEach((record) => {
    results.push(
      recordClientHoursToSheetIdempotent_(
        record.projectSheet,
        {
          type: record.type,
          task: record.task,
          hours: record.hour,
        },
        record.entryId,
        batch.requestId,
        batch.client,
      ),
    );
  });

  // Run even on a retry where all entries were already applied:
  // a previous attempt might have failed during this synchronization.
  combineExternalSheetData(spreadsheetId);

  return {
    success: true,
    client: batch.client,
    requestId: batch.requestId,
    entries: results.length,
    duplicatePrevented: results.filter((result) => result.duplicatePrevented)
      .length,
    results,
  };
}

function getTodayClientHours(sessionId, signature, clientName) {
  requireCapability(sessionId, signature, "hours.view");

  try {
    if (!clientName || !String(clientName).trim()) {
      return {
        success: false,
        message: "Client is required.",
        records: [],
      };
    }

    clientName = String(clientName).trim();

    const startRow = 3;
    const today = formatDateSafe(new Date(), "M/d/yyyy");

    /*
     * --------------------------------------------------
     * 1. DETERMINE CLIENT TYPE
     * --------------------------------------------------
     */

    const registrySheet = getSheetSafe("External Sheets");

    let externalSpreadsheetId = null;

    if (registrySheet && registrySheet.getLastRow() >= 2) {
      const registryValues = registrySheet
        .getRange(2, 1, registrySheet.getLastRow() - 1, 5)
        .getValues();

      const normalizedClient = normalizeText(clientName);

      const externalRow = registryValues.find(
        (row) =>
          normalizeText(String(row[1] || "")) === normalizedClient &&
          String(row[0] || "").trim() !== "",
      );

      if (externalRow) {
        externalSpreadsheetId = String(externalRow[0] || "").trim();
      }
    }

    const isExternal = Boolean(externalSpreadsheetId);

    /*
     * ==================================================
     * INTERNAL CLIENT
     * ==================================================
     *
     * Keep the existing behavior.
     */

    if (!isExternal) {
      const clientSheet = getSheetSafe(clientName);

      if (!clientSheet) {
        return {
          success: false,
          message: `Sheet "${clientName}" not found.`,
          records: [],
        };
      }

      const lastRow = clientSheet.getLastRow();

      if (lastRow < startRow) {
        return {
          success: true,
          records: [],
        };
      }

      const rowCount = lastRow - startRow + 1;

      // E:H
      const data = clientSheet.getRange(startRow, 5, rowCount, 4).getValues();

      const records = [];

      data.forEach((row, index) => {
        const [type, task, hours, date] = row;

        const rowNumber = startRow + index;

        const isToday = formatDateSafe(date, "M/d/yyyy") === today;

        if (!isToday) {
          return;
        }

        // Ignore completely empty rows.
        if (
          !type &&
          !task &&
          (hours === "" || hours === null || hours === undefined)
        ) {
          return;
        }

        records.push({
          row: rowNumber,

          /*
           * Internal clients don't need source metadata.
           */
          sourceSheet: "",
          sourceRow: null,

          type: type || "",
          task: task || "",
          hours: Number(hours) || 0,
          date: formatDateSafe(date, "M/d/yyyy"),
        });
      });

      return {
        success: true,
        records,
      };
    }

    /*
     * ==================================================
     * EXTERNAL CLIENT
     * ==================================================
     *
     * IMPORTANT:
     *
     * The main client sheet is an IMPORTRANGE view.
     *
     * Therefore its row number must NOT be treated as
     * the actual row inside the external project tab.
     *
     * Instead, scan the actual project sheets and return
     * the real source sheet + source row.
     */

    let externalSS;

    try {
      externalSS = SpreadsheetApp.openById(externalSpreadsheetId);
    } catch (err) {
      throw new Error(
        `Unable to access the external spreadsheet for "${clientName}".`,
      );
    }

    const projectSheets = externalSS
      .getSheets()
      .filter(
        (sheet) =>
          sheet.getName() !== "Projects" && sheet.getName() !== "BLANK",
      );

    const records = [];

    projectSheets.forEach((projectSheet) => {
      const lastRow = projectSheet.getLastRow();

      if (lastRow < startRow) {
        return;
      }

      const rowCount = lastRow - startRow + 1;

      /*
       * Read E:H from the actual project sheet.
       */
      const data = projectSheet.getRange(startRow, 5, rowCount, 4).getValues();

      data.forEach((row, index) => {
        const [type, task, hours, date] = row;

        const sourceRow = startRow + index;

        const isToday = formatDateSafe(date, "M/d/yyyy") === today;

        if (!isToday) {
          return;
        }

        /*
         * Ignore completely empty rows.
         */
        if (
          !type &&
          !task &&
          (hours === "" || hours === null || hours === undefined)
        ) {
          return;
        }

        records.push({
          /*
           * Keep row for frontend compatibility.
           *
           * For external clients this is NOT used as the
           * physical external row.
           */
          row: sourceRow,

          /*
           * Actual source location.
           */
          sourceSheet: projectSheet.getName(),
          sourceRow,

          type: type || "",
          task: task || "",
          hours: Number(hours) || 0,
          date: formatDateSafe(date, "M/d/yyyy"),
        });
      });
    });

    /*
     * Sort newest source rows first.
     *
     * Since records are already today's records,
     * this mainly keeps the UI deterministic.
     */
    records.sort((a, b) => {
      if (a.sourceSheet !== b.sourceSheet) {
        return a.sourceSheet.localeCompare(b.sourceSheet);
      }

      return Number(a.sourceRow) - Number(b.sourceRow);
    });

    return {
      success: true,
      records,
    };
  } catch (err) {
    throw new Error(err.message || String(err));
  }
}

// function saveEditedTodayClientHours(sessionId, signature, formData) {
//   requireRole(sessionId, signature, "admin");

//   return withHoursSaveLock_(() => saveEditedTodayClientHours_(formData));
// }

// function saveEditedTodayClientHours_(formData) {
//   try {
//     Validation.requireObject(formData, "Form data");

//     const clientName = Validation.requiredString(formData.client, "Client", {
//       maxLength: Validation.MAX_CLIENT_NAME_LENGTH,
//     });

//     const records = ActivityValidation.todayHoursRecords(formData.records);

//     if (!records.length) {
//       return {
//         success: true,
//         message: "No changes to save.",
//       };
//     }

//     const startRow = 3;
//     const today = formatDateSafe(new Date(), "M/d/yyyy");

//     /*
//      * --------------------------------------------------
//      * 1. DETERMINE CLIENT TYPE
//      * --------------------------------------------------
//      */

//     const registrySheet = getSheetSafe("External Sheets");

//     let externalSpreadsheetId = null;

//     if (registrySheet && registrySheet.getLastRow() >= 2) {
//       const registryValues = registrySheet
//         .getRange(2, 1, registrySheet.getLastRow() - 1, 5)
//         .getValues();

//       const normalizedClient = normalizeText(clientName);

//       const externalRow = registryValues.find(
//         (row) =>
//           normalizeText(String(row[1] || "")) === normalizedClient &&
//           String(row[0] || "").trim() !== "",
//       );

//       if (externalRow) {
//         externalSpreadsheetId = String(externalRow[0] || "").trim();
//       }
//     }

//     const isExternal = Boolean(externalSpreadsheetId);

//     /*
//      * ==================================================
//      * INTERNAL CLIENT
//      * ==================================================
//      *
//      * Existing behavior remains unchanged.
//      */

//     if (!isExternal) {
//       const clientSheet = getSheetSafe(clientName);

//       if (!clientSheet) {
//         throw new Error(`Sheet "${clientName}" not found.`);
//       }

//       const lastRow = clientSheet.getLastRow();

//       if (lastRow < startRow) {
//         throw new Error("No records found.");
//       }

//       /*
//        * ------------------------------------------------
//        * Validate requested rows.
//        * ------------------------------------------------
//        */

//       const requestedRows = new Set();

//       records.forEach((record) => {
//         const rowNumber = Number(record.row);

//         if (!Number.isInteger(rowNumber)) {
//           throw new Error("Invalid row number.");
//         }

//         if (rowNumber < startRow || rowNumber > lastRow) {
//           throw new Error(`Row ${rowNumber} is no longer valid.`);
//         }

//         if (requestedRows.has(rowNumber)) {
//           throw new Error(`Duplicate row submitted: ${rowNumber}`);
//         }

//         requestedRows.add(rowNumber);
//       });

//       /*
//        * Read E:H.
//        */
//       const rowCount = lastRow - startRow + 1;

//       const data = clientSheet.getRange(startRow, 5, rowCount, 4).getValues();

//       /*
//        * Build map of actual sheet rows.
//        */
//       const sheetRows = new Map();

//       data.forEach((row, index) => {
//         const rowNumber = startRow + index;

//         sheetRows.set(rowNumber, {
//           row: rowNumber,
//           type: row[0] || "",
//           task: row[1] || "",
//           hours: Number(row[2]) || 0,
//           date: row[3],
//           dateFormatted: formatDateSafe(row[3], "M/d/yyyy"),
//         });
//       });

//       /*
//        * Verify row + date.
//        */
//       records.forEach((record) => {
//         const rowNumber = Number(record.row);

//         const actual = sheetRows.get(rowNumber);

//         if (!actual) {
//           throw new Error(`Row ${rowNumber} could not be found.`);
//         }

//         if (actual.dateFormatted !== today) {
//           throw new Error(`Row ${rowNumber} is no longer a record from today.`);
//         }

//         assertTodayHoursRecordUnchanged_(record, actual, `Row ${rowNumber}`);
//       });

//       /*
//        * Validate submitted values.
//        */
//       records.forEach((record) => {
//         if (record.action !== "delete" && record.action !== "update") {
//           throw new Error(`Invalid action for row ${record.row}.`);
//         }

//         if (record.action === "update") {
//           const type = String(record.type || "").trim();

//           const task = String(record.task || "").trim();

//           if (!type) {
//             throw new Error(`Type is required for row ${record.row}.`);
//           }

//           if (!task) {
//             throw new Error(`Task is required for row ${record.row}.`);
//           }

//           if (task.toLowerCase() === "loading...") {
//             throw new Error(`Invalid task for row ${record.row}.`);
//           }

//           const hours = Number(record.hours);

//           if (!Number.isFinite(hours) || hours < 0) {
//             throw new Error(`Invalid hours for row ${record.row}.`);
//           }
//         }
//       });

//       /*
//        * Apply internal updates.
//        */
//       records
//         .filter((record) => record.action === "update")
//         .forEach((record) => {
//           const rowNumber = Number(record.row);

//           clientSheet
//             .getRange(rowNumber, 5, 1, 3)
//             .setValues([
//               [
//                 String(record.type).trim(),

//                 String(record.task).trim(),

//                 Number(record.hours),
//               ],
//             ]);
//         });

//       /*
//        * Delete internal records.
//        */
//       const deleteRows = records
//         .filter((record) => record.action === "delete")
//         .map((record) => Number(record.row));

//       if (deleteRows.length) {
//         deleteTodayRowsAndCompact(clientSheet, deleteRows, today, startRow);
//       }

//       return {
//         success: true,
//         message: "Today's records have been updated.",
//       };
//     }

//     /*
//      * ==================================================
//      * EXTERNAL CLIENT
//      * ==================================================
//      */

//     let externalSS;

//     try {
//       externalSS = SpreadsheetApp.openById(externalSpreadsheetId);
//     } catch (err) {
//       throw new Error(
//         `Unable to access the external spreadsheet for "${clientName}".`,
//       );
//     }

//     /*
//      * --------------------------------------------------
//      * 2. VALIDATE AND RESOLVE SOURCE LOCATIONS
//      * --------------------------------------------------
//      *
//      * Each external record MUST contain:
//      *
//      *   sourceSheet
//      *   sourceRow
//      *
//      * These identify the actual project tab and row.
//      */

//     const resolvedRecords = [];

//     const requestedSources = new Set();

//     records.forEach((record) => {
//       if (record.action !== "delete" && record.action !== "update") {
//         throw new Error(`Invalid action for row ${record.row}.`);
//       }

//       const sourceSheetName = String(record.sourceSheet || "").trim();

//       const sourceRow = Number(record.sourceRow);

//       if (!sourceSheetName) {
//         throw new Error(
//           `Missing source sheet for external record ${record.row}.`,
//         );
//       }

//       if (!Number.isInteger(sourceRow) || sourceRow < startRow) {
//         throw new Error(
//           `Invalid source row for external record ${record.row}.`,
//         );
//       }

//       /*
//        * Prevent the same physical external row from
//        * being submitted twice.
//        */
//       const sourceKey = `${sourceSheetName}::${sourceRow}`;

//       if (requestedSources.has(sourceKey)) {
//         throw new Error(
//           `Duplicate external record submitted: ${sourceSheetName} row ${sourceRow}.`,
//         );
//       }

//       requestedSources.add(sourceKey);

//       /*
//        * Resolve the exact project tab.
//        */
//       const projectSheet = externalSS.getSheetByName(sourceSheetName);

//       if (!projectSheet) {
//         throw new Error(
//           `Project sheet "${sourceSheetName}" was not found in the external spreadsheet.`,
//         );
//       }

//       /*
//        * Never allow system tabs as source tabs.
//        */
//       if (
//         projectSheet.getName() === "Projects" ||
//         projectSheet.getName() === "BLANK"
//       ) {
//         throw new Error(`Invalid external source sheet "${sourceSheetName}".`);
//       }

//       const lastRow = projectSheet.getLastRow();

//       if (sourceRow > lastRow) {
//         throw new Error(
//           `External row ${sourceRow} no longer exists in "${sourceSheetName}".`,
//         );
//       }

//       /*
//        * Read the actual source record.
//        */
//       const actual = projectSheet.getRange(sourceRow, 5, 1, 4).getValues()[0];

//       const [actualType, actualTask, actualHours, actualDate] = actual;

//       const actualDateFormatted = formatDateSafe(actualDate, "M/d/yyyy");

//       /*
//        * The source record must still exist
//        * and still belong to today.
//        */
//       if (actualDateFormatted !== today) {
//         throw new Error(
//           `External record "${sourceSheetName}" row ${sourceRow} is no longer a record from today.`,
//         );
//       }

//       /*
//        * Ignore completely empty source rows.
//        */
//       if (
//         !actualType &&
//         !actualTask &&
//         (actualHours === "" ||
//           actualHours === null ||
//           actualHours === undefined) &&
//         !actualDate
//       ) {
//         throw new Error(
//           `External record "${sourceSheetName}" row ${sourceRow} no longer exists.`,
//         );
//       }

//       /*
//        * Validate submitted values.
//        */
//       if (record.action === "update") {
//         const type = String(record.type || "").trim();

//         const task = String(record.task || "").trim();

//         if (!type) {
//           throw new Error(`Type is required for external record ${sourceRow}.`);
//         }

//         if (!task) {
//           throw new Error(`Task is required for external record ${sourceRow}.`);
//         }

//         if (task.toLowerCase() === "loading...") {
//           throw new Error(`Invalid task for external record ${sourceRow}.`);
//         }

//         const hours = Number(record.hours);

//         if (!Number.isFinite(hours) || hours < 0) {
//           throw new Error(`Invalid hours for external record ${sourceRow}.`);
//         }
//       }

//       assertTodayHoursRecordUnchanged_(
//         record,
//         {
//           type: actualType,
//           task: actualTask,
//           hours: actualHours,
//           dateFormatted: actualDateFormatted,
//         },
//         `External record "${sourceSheetName}" row ${sourceRow}`,
//       );

//       resolvedRecords.push({
//         record,
//         sheet: projectSheet,
//         sourceRow,
//         actual: {
//           type: actualType || "",
//           task: actualTask || "",
//           hours: Number(actualHours) || 0,
//           date: actualDate,
//           dateFormatted: actualDateFormatted,
//         },
//       });
//     });

//     /*
//      * --------------------------------------------------
//      * 3. APPLY EXTERNAL UPDATES
//      * --------------------------------------------------
//      */

//     resolvedRecords
//       .filter(({ record }) => record.action === "update")
//       .forEach(({ record, sheet, sourceRow }) => {
//         /*
//          * IMPORTANT:
//          *
//          * We write directly to the exact source
//          * project tab + exact source row.
//          *
//          * The frontend's "row" value is NOT used here.
//          */
//         sheet
//           .getRange(sourceRow, 5, 1, 3)
//           .setValues([
//             [
//               String(record.type).trim(),

//               String(record.task).trim(),

//               Number(record.hours),
//             ],
//           ]);
//       });

//     /*
//      * --------------------------------------------------
//      * 4. GROUP EXTERNAL DELETIONS
//      * --------------------------------------------------
//      */

//     const deleteGroups = new Map();

//     resolvedRecords
//       .filter(({ record }) => record.action === "delete")
//       .forEach(({ sheet, sourceRow }) => {
//         const sheetId = sheet.getSheetId();

//         if (!deleteGroups.has(sheetId)) {
//           deleteGroups.set(sheetId, {
//             sheet,
//             rows: [],
//           });
//         }

//         deleteGroups.get(sheetId).rows.push(sourceRow);
//       });

//     /*
//      * Delete/compact independently per
//      * actual external project tab.
//      */
//     deleteGroups.forEach(({ sheet, rows }) => {
//       deleteTodayRowsAndCompact(sheet, rows, today, startRow);
//     });

//     /*
//      * --------------------------------------------------
//      * 5. REFRESH MAIN IMPORTED VIEW
//      * --------------------------------------------------
//      *
//      * The main client sheet is only an imported/
//      * aggregated representation.
//      *
//      * The actual external project sheets are the
//      * source of truth.
//      */

//     combineExternalSheetData(externalSpreadsheetId);

//     return {
//       success: true,
//       message: "Today's external client records have been updated.",
//     };
//   } catch (err) {
//     throw new Error(err.message || String(err));
//   }
// }


function saveEditedTodayClientHours(sessionId, signature, formData) {
  requireRole(sessionId, signature, "admin");

  return withHoursSaveLock_(() => saveEditedTodayClientHours_(formData));
}

function saveEditedTodayClientHours_(formData) {
  Validation.requireObject(formData, "Form data");

  const requestId = Validation.requiredString(
    formData.requestId,
    "Request ID",
    { maxLength: 200 },
  );

  const clientName = Validation.requiredString(formData.client, "Client", {
    maxLength: Validation.MAX_CLIENT_NAME_LENGTH,
  });

  const records = ActivityValidation.todayHoursRecords(formData.records);

  if (!records.length) {
    return {
      success: true,
      message: "No changes to save.",
      requestId,
      duplicatePrevented: false,
    };
  }

  validateTodayHoursOperationRecords_(records);

  const fingerprint = fingerprintTodayHoursOperation_(clientName, records);

  /*
   * Resolve whether the client is internal or external.
   */
  const registrySheet = getSheetSafe("External Sheets");
  let externalSpreadsheetId = null;

  if (registrySheet && registrySheet.getLastRow() >= 2) {
    const registryValues = registrySheet
      .getRange(2, 1, registrySheet.getLastRow() - 1, 5)
      .getValues();

    const normalizedClient = normalizeText(clientName);

    const externalRow = registryValues.find(
      (row) =>
        normalizeText(String(row[1] || "")) === normalizedClient &&
        String(row[0] || "").trim() !== "",
    );

    if (externalRow) {
      externalSpreadsheetId = String(externalRow[0]).trim();
    }
  }

  const isExternal = Boolean(externalSpreadsheetId);
  let destinationSS;
  let clientSheet = null;

  if (isExternal) {
    try {
      destinationSS = SpreadsheetApp.openById(externalSpreadsheetId);
    } catch (error) {
      throw new Error(
        `Unable to access the external spreadsheet for "${clientName}".`,
      );
    }
  } else {
    clientSheet = getSheetSafe(clientName);

    if (!clientSheet) {
      throw new Error(`Sheet "${clientName}" not found.`);
    }

    destinationSS = clientSheet.getParent();
  }

  /*
   * The ledger is in the same spreadsheet as the source records.
   * An existing operation is checked BEFORE snapshot validation.
   */
  const ledgerSheet = getTodayHoursOperationLedger_(destinationSS);

  const previousOperation = findTodayHoursOperation_(ledgerSheet, requestId);

  if (previousOperation) {
    if (previousOperation.fingerprint !== fingerprint) {
      throw new Error(
        "HOURS_CONFLICT: This request ID was already used for a different operation. Reload today's hours before trying again.",
      );
    }

    const previousResult = previousOperation.result;

    if (!previousResult || previousResult.success !== true) {
      throw new Error(
        "The saved result for this request could not be verified. No changes were reapplied.",
      );
    }

    /*
     * Source changes already committed. For external clients,
     * retry the aggregate refresh without repeating those changes.
     */
    if (isExternal) {
      combineExternalSheetData(externalSpreadsheetId);
    }

    return {
      ...previousResult,
      requestId,
      duplicatePrevented: true,
    };
  }

  const startRow = 3;
  const today = formatDateSafe(new Date(), "M/d/yyyy");
  const timeZone = destinationSS.getSpreadsheetTimeZone();

  /*
   * Resolve records and construct all source mutation requests
   * without writing to any source tab.
   */
  const sheetGroups = new Map();

  if (!isExternal) {
    const lastRow = clientSheet.getLastRow();

    if (lastRow < startRow) {
      throw new Error("No records found.");
    }

    const requestedRows = new Set();

    records.forEach((record) => {
      const rowNumber = Number(record.row);

      if (!Number.isInteger(rowNumber)) {
        throw new Error("Invalid row number.");
      }

      if (rowNumber < startRow || rowNumber > lastRow) {
        throw new Error(
          `HOURS_CONFLICT: Row ${rowNumber} is no longer valid. Reload today's hours and try again.`,
        );
      }

      if (requestedRows.has(rowNumber)) {
        throw new Error(`Duplicate row submitted: ${rowNumber}`);
      }

      requestedRows.add(rowNumber);
    });

    sheetGroups.set(clientSheet.getSheetId(), {
      sheet: clientSheet,
      entries: records.map((record) => ({
        record,
        rowNumber: Number(record.row),
      })),
    });
  } else {
    const requestedSources = new Set();

    records.forEach((record) => {
      const sourceSheetName = String(record.sourceSheet || "").trim();

      const sourceRow = Number(record.sourceRow);

      if (!sourceSheetName) {
        throw new Error(
          `Missing source sheet for external record ${record.row}.`,
        );
      }

      if (!Number.isInteger(sourceRow) || sourceRow < startRow) {
        throw new Error(
          `Invalid source row for external record ${record.row}.`,
        );
      }

      const sourceKey = `${sourceSheetName}::${sourceRow}`;

      if (requestedSources.has(sourceKey)) {
        throw new Error(
          `Duplicate external record submitted: ${sourceSheetName} row ${sourceRow}.`,
        );
      }

      requestedSources.add(sourceKey);

      const projectSheet = destinationSS.getSheetByName(sourceSheetName);

      if (!projectSheet) {
        throw new Error(
          `HOURS_CONFLICT: Project sheet "${sourceSheetName}" no longer exists. Reload today's hours and try again.`,
        );
      }

      if (
        projectSheet.getName() === "Projects" ||
        projectSheet.getName() === "BLANK"
      ) {
        throw new Error(`Invalid external source sheet "${sourceSheetName}".`);
      }

      if (sourceRow > projectSheet.getLastRow()) {
        throw new Error(
          `HOURS_CONFLICT: External row ${sourceRow} no longer exists in "${sourceSheetName}". Reload today's hours and try again.`,
        );
      }

      const sheetId = projectSheet.getSheetId();

      if (!sheetGroups.has(sheetId)) {
        sheetGroups.set(sheetId, {
          sheet: projectSheet,
          entries: [],
        });
      }

      sheetGroups.get(sheetId).entries.push({
        record,
        rowNumber: sourceRow,
      });
    });
  }

  /*
   * Build changes for every affected tab.
   * This performs reads and validation only; it does not write.
   */
  const mutationRequests = [];

  sheetGroups.forEach(({ sheet, entries }) => {
    mutationRequests.push(
      ...planTodayHoursSheetMutation_(
        sheet,
        entries,
        today,
        startRow,
        timeZone,
      ),
    );
  });

  const result = {
    success: true,
    message: isExternal
      ? "Today's external client records have been updated."
      : "Today's records have been updated.",
    client: clientName,
    requestId,
    duplicatePrevented: false,
  };

  /*
   * Append the operation ledger entry in the SAME batch as
   * the source edits/deletions/compaction.
   */
  const ledgerRowIndex = ledgerSheet.getLastRow();

  mutationRequests.push({
    updateCells: {
      range: {
        sheetId: ledgerSheet.getSheetId(),
        startRowIndex: ledgerRowIndex,
        startColumnIndex: 0,
      },
      rows: [
        {
          values: [
            { userEnteredValue: { stringValue: requestId } },
            { userEnteredValue: { stringValue: fingerprint } },
            { userEnteredValue: { stringValue: clientName } },
            {
              userEnteredValue: {
                stringValue: JSON.stringify(result),
              },
            },
            {
              userEnteredValue: {
                stringValue: new Date().toISOString(),
              },
            },
          ],
        },
      ],
      fields: "userEnteredValue",
    },
  });

  /*
   * Atomic per destination spreadsheet:
   * either all source mutations + ledger entry commit, or none do.
   */
  Sheets.Spreadsheets.batchUpdate(
    { requests: mutationRequests },
    destinationSS.getId(),
  );

  /*
   * This refresh is intentionally after the source batch.
   * If it fails, the retry finds the ledger and refreshes again
   * without applying the source changes twice.
   */
  if (isExternal) {
    combineExternalSheetData(externalSpreadsheetId);
  }

  return result;
}

function getTodayHoursOperationLedger_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(
    GCB_TODAY_HOURS_OPERATION_LEDGER.sheetName,
  );

  if (!sheet) {
    sheet = spreadsheet.insertSheet(GCB_TODAY_HOURS_OPERATION_LEDGER.sheetName);

    sheet
      .getRange(1, 1, 1, GCB_TODAY_HOURS_OPERATION_LEDGER.headers.length)
      .setValues([GCB_TODAY_HOURS_OPERATION_LEDGER.headers]);

    try {
      sheet.hideSheet();
    } catch (error) {
      console.warn("[TodayHoursLedger] Unable to hide ledger sheet:", error);
    }

    return sheet;
  }

  if (sheet.getLastRow() === 0) {
    sheet
      .getRange(1, 1, 1, GCB_TODAY_HOURS_OPERATION_LEDGER.headers.length)
      .setValues([GCB_TODAY_HOURS_OPERATION_LEDGER.headers]);

    return sheet;
  }

  const headers = sheet
    .getRange(1, 1, 1, GCB_TODAY_HOURS_OPERATION_LEDGER.headers.length)
    .getValues()[0];

  const headersMatch =
    JSON.stringify(headers) ===
    JSON.stringify(GCB_TODAY_HOURS_OPERATION_LEDGER.headers);

  if (!headersMatch) {
    throw new Error(
      "The today's-hours operation ledger has unexpected headers. No changes were applied.",
    );
  }

  return sheet;
}

function findTodayHoursOperation_(ledgerSheet, requestId) {
  const lastRow = ledgerSheet.getLastRow();

  if (lastRow < 2) {
    return null;
  }

  const values = ledgerSheet.getRange(2, 1, lastRow - 1, 5).getValues();

  for (let index = 0; index < values.length; index++) {
    const row = values[index];

    if (String(row[0] || "") !== requestId) {
      continue;
    }

    let result;

    try {
      result = JSON.parse(String(row[3] || ""));
    } catch (error) {
      throw new Error(
        "The saved result for this request ID is unreadable. No changes were reapplied.",
      );
    }

    return {
      fingerprint: String(row[1] || ""),
      result,
    };
  }

  return null;
}

function fingerprintTodayHoursOperation_(clientName, records) {
  /*
   * Explicit property order produces a stable canonical payload.
   * Do not include transient UI state or updatedAt timestamps.
   */
  const canonicalPayload = {
    client: String(clientName),
    records: records.map((record) => ({
      row: Number(record.row),
      action: String(record.action || ""),
      sourceSheet: String(record.sourceSheet || ""),
      sourceRow:
        record.sourceRow === undefined ||
        record.sourceRow === null ||
        record.sourceRow === ""
          ? null
          : Number(record.sourceRow),
      originalType: String(record.originalType ?? ""),
      originalTask: String(record.originalTask ?? ""),
      originalHours: Number(record.originalHours),
      originalDate: String(record.originalDate ?? ""),
      type:
        record.type === undefined || record.type === null
          ? null
          : String(record.type),
      task:
        record.task === undefined || record.task === null
          ? null
          : String(record.task),
      hours:
        record.hours === undefined || record.hours === null
          ? null
          : Number(record.hours),
    })),
  };

  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify(canonicalPayload),
    Utilities.Charset.UTF_8,
  );

  return Utilities.base64Encode(digest);
}

function validateTodayHoursOperationRecords_(records) {
  const seen = new Set();

  records.forEach((record) => {
    if (record.action !== "update" && record.action !== "delete") {
      throw new Error(`Invalid action for row ${record.row}.`);
    }

    if (record.action === "update") {
      const type = String(record.type || "").trim();
      const task = String(record.task || "").trim();
      const hours = Number(record.hours);

      if (!type) {
        throw new Error(`Type is required for row ${record.row}.`);
      }

      if (!task) {
        throw new Error(`Task is required for row ${record.row}.`);
      }

      if (task.toLowerCase() === "loading...") {
        throw new Error(`Invalid task for row ${record.row}.`);
      }

      if (!Number.isFinite(hours) || hours < 0) {
        throw new Error(`Invalid hours for row ${record.row}.`);
      }
    }

    /*
     * Validate snapshots before fingerprinting can conceal
     * malformed input behind JSON's treatment of NaN.
     */
    const originalHours = Number(record.originalHours);
    const originalDate = String(record.originalDate ?? "").trim();

    if (!Number.isFinite(originalHours) || originalHours < 0 || !originalDate) {
      throw new Error(
        `Original record snapshot is invalid for row ${record.row}.`,
      );
    }

    const sourceSheet = String(record.sourceSheet || "").trim();
    const sourceRow = Number(record.sourceRow);

    const locationKey = sourceSheet
      ? `${sourceSheet}::${sourceRow}`
      : `internal::${Number(record.row)}`;

    if (seen.has(locationKey)) {
      throw new Error(`Duplicate record submitted: ${locationKey}.`);
    }

    seen.add(locationKey);
  });
}

function planTodayHoursSheetMutation_(
  sheet,
  entries,
  today,
  startRow,
  timeZone,
) {
  const lastRow = sheet.getLastRow();

  if (lastRow < startRow) {
    throw new Error(
      "HOURS_CONFLICT: The requested records no longer exist. Reload today's hours and try again.",
    );
  }

  const rowCount = lastRow - startRow + 1;
  const data = sheet.getRange(startRow, 5, rowCount, 4).getValues();

  const workingData = data.map((row) => row.slice());

  /*
   * Validate every snapshot against the original data before
   * planning any mutations.
   */
  entries.forEach(({ record, rowNumber }) => {
    if (
      !Number.isInteger(rowNumber) ||
      rowNumber < startRow ||
      rowNumber > lastRow
    ) {
      throw new Error(
        `HOURS_CONFLICT: Row ${rowNumber} is no longer valid. Reload today's hours and try again.`,
      );
    }

    const index = rowNumber - startRow;
    const actualRow = data[index];

    if (!actualRow) {
      throw new Error(
        `HOURS_CONFLICT: Row ${rowNumber} could not be found. Reload today's hours and try again.`,
      );
    }

    const actual = {
      type: actualRow[0] || "",
      task: actualRow[1] || "",
      hours: Number(actualRow[2]) || 0,
      date: actualRow[3],
      dateFormatted: formatDateSafe(actualRow[3], "M/d/yyyy"),
    };

    if (actual.dateFormatted !== today) {
      throw new Error(
        `HOURS_CONFLICT: Row ${rowNumber} is no longer a record from today. Reload today's hours and try again.`,
      );
    }

    assertTodayHoursRecordUnchanged_(record, actual, `Row ${rowNumber}`);
  });

  const deleteRows = new Set(
    entries
      .filter(({ record }) => record.action === "delete")
      .map(({ rowNumber }) => rowNumber),
  );

  /*
   * Apply updates to the in-memory copy. Nothing is written yet.
   */
  entries.forEach(({ record, rowNumber }) => {
    if (record.action !== "update") {
      return;
    }

    const index = rowNumber - startRow;

    workingData[index] = [
      String(record.type).trim(),
      String(record.task).trim(),
      Number(record.hours),
      workingData[index][3],
    ];
  });

  const requests = [];

  if (deleteRows.size > 0) {
    /*
     * Preserve the existing compaction behavior:
     * only today's occupied row positions are compacted.
     */
    const todayIndexes = [];

    data.forEach((row, index) => {
      if (formatDateSafe(row[3], "M/d/yyyy") === today) {
        todayIndexes.push(index);
      }
    });

    const todayRowNumbers = new Set(
      todayIndexes.map((index) => startRow + index),
    );

    deleteRows.forEach((rowNumber) => {
      if (!todayRowNumbers.has(rowNumber)) {
        throw new Error(
          `HOURS_CONFLICT: Row ${rowNumber} is no longer valid for deletion. Reload today's hours and try again.`,
        );
      }
    });

    const remainingRows = todayIndexes
      .filter((index) => !deleteRows.has(startRow + index))
      .map((index) => workingData[index].slice());

    /*
     * Write the remaining records to the original today's-row
     * positions, then clear the unused positions.
     */
    todayIndexes.forEach((targetIndex, index) => {
      const values = remainingRows[index] || ["", "", "", ""];

      requests.push(
        makeTodayHoursUpdateCellsRequest_(
          sheet.getSheetId(),
          startRow + targetIndex,
          5,
          values,
          timeZone,
        ),
      );
    });

    return requests;
  }

  /*
   * No deletion on this tab: update only the requested E:G cells.
   * The date in column H remains untouched.
   */
  entries.forEach(({ record, rowNumber }) => {
    if (record.action !== "update") {
      return;
    }

    const index = rowNumber - startRow;

    requests.push(
      makeTodayHoursUpdateCellsRequest_(
        sheet.getSheetId(),
        rowNumber,
        5,
        [
          String(record.type).trim(),
          String(record.task).trim(),
          Number(record.hours),
        ],
        timeZone,
      ),
    );
  });

  return requests;
}

function makeTodayHoursUpdateCellsRequest_(
  sheetId,
  rowNumber,
  columnNumber,
  values,
  timeZone,
) {
  return {
    updateCells: {
      range: {
        sheetId: sheetId,
        startRowIndex: rowNumber - 1,
        startColumnIndex: columnNumber - 1,
        endRowIndex: rowNumber,
        endColumnIndex: columnNumber - 1 + values.length,
      },
      rows: [
        {
          values: values.map((value) =>
            makeTodayHoursCellData_(value, timeZone),
          ),
        },
      ],
      fields: "userEnteredValue",
    },
  };
}

function makeTodayHoursCellData_(value, timeZone) {
  if (value === "" || value === null || value === undefined) {
    /*
     * With fields=userEnteredValue, an empty cell object clears
     * the existing value while preserving formatting.
     */
    return {};
  }

  if (value instanceof Date) {
    const dateText = Utilities.formatDate(value, timeZone, "yyyy-MM-dd");

    const [year, month, day] = dateText.split("-").map(Number);

    const serial = Date.UTC(year, month - 1, day) / 86400000 + 25569;

    return {
      userEnteredValue: {
        numberValue: serial,
      },
    };
  }

  if (typeof value === "number") {
    return {
      userEnteredValue: {
        numberValue: value,
      },
    };
  }

  if (typeof value === "boolean") {
    return {
      userEnteredValue: {
        boolValue: value,
      },
    };
  }

  return {
    userEnteredValue: {
      stringValue: String(value),
    },
  };
}

// function assertTodayHoursRecordUnchanged_(record, actual, label) {
//   const originalType = String(record.originalType ?? "");
//   const originalTask = String(record.originalTask ?? "");
//   const originalHours = Number(record.originalHours);
//   const originalDate = String(record.originalDate ?? "").trim();

//   if (!Number.isFinite(originalHours) || originalHours < 0 || !originalDate) {
//     throw new Error(`Original record snapshot is invalid for ${label}.`);
//   }

//   const actualType = String(actual.type ?? "");
//   const actualTask = String(actual.task ?? "");
//   const actualHours = Number(actual.hours);
//   const actualDate = String(actual.dateFormatted ?? "").trim();

//   const unchanged =
//     actualType === originalType &&
//     actualTask === originalTask &&
//     Number.isFinite(actualHours) &&
//     actualHours === originalHours &&
//     actualDate === originalDate;

//   if (!unchanged) {
//     throw new Error(
//       `${label} has changed since it was loaded. Reload today's hours and try again.`,
//     );
//   }
// }


function assertTodayHoursRecordUnchanged_(record, actual, label) {
  const originalType = String(record.originalType ?? "");
  const originalTask = String(record.originalTask ?? "");
  const originalHours = Number(record.originalHours);
  const originalDate = String(record.originalDate ?? "").trim();

  if (!Number.isFinite(originalHours) || originalHours < 0 || !originalDate) {
    throw new Error(`Invalid original record snapshot for ${label}.`);
  }

  const actualType = String(actual.type ?? "");
  const actualTask = String(actual.task ?? "");
  const actualHours = Number(actual.hours);
  const actualDate = String(actual.dateFormatted ?? "").trim();

  const unchanged =
    actualType === originalType &&
    actualTask === originalTask &&
    Number.isFinite(actualHours) &&
    actualHours === originalHours &&
    actualDate === originalDate;

  if (!unchanged) {
    throw new Error(
      `HOURS_CONFLICT: ${label} has changed since it was loaded. Reload today's hours and try again.`,
    );
  }
}

function deleteTodayRowsAndCompact(sheet, deleteRows, today, startRow) {
  const lastRow = sheet.getLastRow();

  if (lastRow < startRow) {
    return;
  }

  /*
   * Read E:H.
   */
  const rowCount = lastRow - startRow + 1;

  const data = sheet.getRange(startRow, 5, rowCount, 4).getValues();

  /*
   * Convert into objects containing
   * the original sheet row.
   */
  const rows = data.map((row, index) => ({
    rowNumber: startRow + index,
    values: row,
    dateFormatted: formatDateSafe(row[3], "M/d/yyyy"),
  }));

  const deleteSet = new Set(deleteRows);

  /*
   * Only today's records can be deleted.
   */
  const todayRows = rows.filter(
    (row) => row.dateFormatted === today && deleteSet.has(row.rowNumber),
  );

  /*
   * Safety check.
   */
  if (todayRows.length !== deleteRows.length) {
    throw new Error("One or more records are no longer valid for deletion.");
  }

  /*
   * Find all today's records.
   */
  const todayRecords = rows.filter((row) => row.dateFormatted === today);

  /*
   * Keep records that aren't being deleted.
   */
  const remainingRecords = todayRecords.filter(
    (row) => !deleteSet.has(row.rowNumber),
  );

  /*
   * Nothing left.
   */
  if (!remainingRecords.length) {
    todayRecords.forEach((row) => {
      sheet.getRange(row.rowNumber, 5, 1, 4).clearContent();
    });

    return;
  }

  /*
   * Write remaining records into the
   * original positions from the top.
   *
   * Example:
   *
   * Row 10 DELETE
   *
   * Row 11 -> Row 10
   * Row 12 -> Row 11
   *
   * etc.
   */
  const targetRows = todayRecords.map((row) => row.rowNumber);

  remainingRecords.forEach((record, index) => {
    const targetRow = targetRows[index];

    sheet.getRange(targetRow, 5, 1, 4).setValues([record.values]);
  });

  /*
   * Clear the rows that are now unused.
   *
   * Example:
   *
   * 3 records
   * delete 1
   *
   * 2 remain
   * last row gets cleared.
   */
  const rowsToClear = targetRows.slice(remainingRecords.length);

  rowsToClear.forEach((rowNumber) => {
    sheet.getRange(rowNumber, 5, 1, 4).clearContent();
  });
}

function getTaskOptions(sessionId, signature, clientName) {
  requireCapability(sessionId, signature, "hours.view");

  if (!clientName) {
    return [];
  }

  try {
    const sheet = getSheetSafe(clientName.trim());

    if (!sheet) {
      logResponse(`❌ No sheet found for client: ${clientName}`);
      return [];
    }

    SpreadsheetApp.flush();

    const tasks = sheet
      .getRange("F3:F")
      .getValues()
      .flat()
      .filter((task) => task && String(task).trim() !== "");

    return [...new Set(tasks)].sort();
  } catch (err) {
    logResponse(`⚠️ getTaskOptions error: ${err}`);
    return [];
  }
}

function getRecentRecordsForManualForm(clientSheetName, limit = 3) {
  requireCapability(sessionId, signature, "hours.view");

  if (!isNonEmptyString(clientSheetName)) {
    return [];
  }

  const sheet = getSheetSafe(clientSheetName);

  if (!sheet) {
    return [];
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < 3) {
    return [];
  }

  const startRow = 3;
  const numRows = lastRow - startRow + 1;

  const [dateCol, hourCol, typeCol, taskCol] = [8, 7, 5, 6].map((col) =>
    sheet.getRange(startRow, col, numRows).getValues(),
  );

  const rows = [];

  for (let i = 0; i < numRows; i++) {
    const date = dateCol[i][0];
    const hours = hourCol[i][0];
    const type = typeCol[i][0];
    const task = taskCol[i][0];

    if (
      ![date, hours, type, task].some((value) => value !== "" && value != null)
    ) {
      continue;
    }

    let dateTimestamp = 0;
    let dateString = "";

    if (date instanceof Date && !isNaN(date)) {
      dateTimestamp = date.getTime();
      dateString = formatDateSafe(date, "yyyy-MM-dd");
    } else if (date) {
      const parsed = new Date(String(date));

      if (!isNaN(parsed)) {
        dateTimestamp = parsed.getTime();
        dateString = formatDateSafe(parsed, "yyyy-MM-dd");
      } else {
        dateString = String(date);
      }
    }

    rows.push({
      dateTimestamp,
      row: [dateString, hours, type, task],
    });
  }

  return rows
    .sort((a, b) => b.dateTimestamp - a.dateTimestamp)
    .slice(0, limit)
    .map((item) => item.row);
}

function getDailyActivityData(sessionId, signature) {
  requireCapability(sessionId, signature, "hours.view");

  const sheet = getSheetSafe("Client Tracker - Today");

  if (!sheet) {
    return [];
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  // Read only rows that contain data, rather than the entire grid.
  const values = sheet.getRange(2, 2, lastRow - 1, 6).getValues();

  return values.filter((row) =>
    row.some((value) => value !== "" && value != null),
  );
}

function getHoursSummary(sessionId, signature) {
  requireCapability(sessionId, signature, "hours.view");

  const sheet = getSheetSafe("Other Analytics");

  if (!sheet) {
    return {};
  }

  const values = sheet.getRange("A2:I2").getValues()[0];

  return {
    totalHours: values[1] ?? 0,
    totalPaid: values[2] ?? 0,
    owedHours: values[3] ?? 0,
    netHours: values[4] ?? 0,

    lifetimePercent: values[5] ?? 0,
    collectionRate: values[6] ?? 0,
    debtExposureRate: values[7] ?? 0,
    netHoursYield: values[8] ?? 0,
  };
}

function getClientHoursForOverview(sessionId, signature, clientName) {
  requireCapability(sessionId, signature, "hours.view");

  if (!isNonEmptyString(clientName)) {
    return { error: "INVALID_CLIENT" };
  }

  const sheet = getSheetSafe(clientName);

  if (!sheet) {
    return { error: "NOT_FOUND" };
  }

  return {
    totalHrs: sheet.getRange("B8").getValue(),
    weekHrs: sheet.getRange("N18").getValue(),
    monthHrs: sheet.getRange("N19").getValue(),
    yearHrs: sheet.getRange("N20").getValue(),
  };
}

function getYearHoursSummary(sessionId, signature, year) {
  requireCapability(sessionId, signature, "hours.view");

  const sheet = getSheetSafe("Other Analytics");

  if (!sheet) {
    return null;
  }

  /*
   * A:M
   *
   * A = Net Yr
   * B = Hours
   * C = Net Paid
   * D = Net Owed
   * E = Net Hrs
   * F = % of Lifetime Vol
   * G = Collection Rate
   * H = Debt Exposure Rate
   * I = Net Hours Yield
   * J = Hours vs Last Year
   * K = Collection Rate vs Last Year
   * L = Debt Exposure Rate vs Last Year
   * M = Net Hours Yield vs Last Year
   */
  const data = sheet.getRange("A5:M").getValues();

  const row = data.find((item) => Number(item[0]) === Number(year));

  if (!row) {
    return null;
  }

  return {
    year: row[0],

    // Current year metrics
    hours: row[1],
    paid: row[2],
    owed: row[3],
    netHours: row[4],

    lifetime: row[5],
    collection: row[6],
    debt: row[7],
    yield: row[8],

    // Year-over-year metrics
    hoursYoY: row[9],
    collectionYoY: row[10],
    debtYoY: row[11],
    yieldYoY: row[12],
  };
}

function addCurrMthTotalHrly(sessionId, signature, value) {
  requireCapability(sessionId, signature, "hours.edit");

  const numVal = Validation.number(value, "Current month total", {
    min: Number.EPSILON,
  });

  const sheet = getSheetSafe("Hourly History");

  if (!sheet) {
    throw new Error('Sheet "Hourly History" not found.');
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < 4) {
    throw new Error("Not enough data in Hourly History.");
  }

  const colE = sheet.getRange("E4:E" + lastRow).getValues();
  const colF = sheet.getRange("F4:F" + lastRow).getValues();

  const targetRow = colE.findIndex((e, i) => e[0] && !colF[i][0]);

  if (targetRow === -1) {
    throw new Error("No empty F cell found to update.");
  }

  const rowNum = targetRow + 4;

  sheet.getRange(`F${rowNum}`).setValue(numVal);

  const monthYear = sheet.getRange(`E${rowNum}`).getValue();

  return {
    message: `Added value to ${monthYear}`,
    row: rowNum,
    monthYear,
  };
}

function getDailyOverviewSummary(sessionId, signature) {
  requireCapability(sessionId, signature, "hours.view");

  const metricsSheet = getSheetSafe("Daily Activities Metrics");

  if (!metricsSheet) {
    return null;
  }

  const values = metricsSheet.getRange("R2:R29").getValues();

  const currentMonth = new Date().getMonth() + 1;

  const monthlyValues = metricsSheet
    .getRange("O2:Q")
    .getValues()
    .filter((row) => row[0] !== "");

  const currentMonthRow = monthlyValues.find(
    (row) => Number(row[0]) === currentMonth,
  );

  const currentMonthAverage = currentMonthRow?.[2] ?? null;

  return {
    overall: values[0][0],
    overallTotalHours: values[3][0],

    currentMonth: values[6][0],
    currentMonthAverage,

    activeClientsToday: values[12][0],
    activeClientsYesterday: values[15][0],

    todayHours: values[18][0],
    yesterdayHours: values[21][0],

    hoursVsYesterday: values[24][0],
    monthVsPreviousMonth: values[27][0],
  };
}

function getTodayChargedHours(sessionId, signature) {
  requireCapability(sessionId, signature, "hours.view");

  const sheet = getSheetSafe("Daily Activities Metrics");

  if (!sheet) return null;

  const values = sheet.getRange("R35:R41").getValues();

  return {
    todayHours: Number(values[0][0]) || 0,
    yesterdayHours: Number(values[3][0]) || 0,
    change:
      values[6][0] === "" || values[6][0] === null
        ? null
        : Number(values[6][0]),
  };
}

function getMonthlyHoursSummary(sessionId, signature) {
  requireCapability(sessionId, signature, "hours.view");

  const monthlySheet = getSheetSafe("Monthly Hours Log");
  const currentSheet = getSheetSafe("Current Month Log");

  if (!monthlySheet) {
    return {};
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-based

  /*
   * ---------------------------------------------------------
   * Monthly Hours Log
   * Row 1 = month labels
   * Row 2 = total hours
   * Starting at column M
   * ---------------------------------------------------------
   */

  const monthlyLastColumn = monthlySheet.getLastColumn();

  if (monthlyLastColumn < 13) {
    return {};
  }

  const monthHeaders = monthlySheet
    .getRange(1, 13, 1, monthlyLastColumn - 12)
    .getValues()[0];

  const monthTotals = monthlySheet
    .getRange(2, 13, 1, monthlyLastColumn - 12)
    .getValues()[0];

  const monthlyData = [];

  monthHeaders.forEach((header, index) => {
    if (!header) {
      return;
    }

    const date = header instanceof Date ? header : new Date(header);

    if (isNaN(date.getTime())) {
      return;
    }

    monthlyData.push({
      date,
      year: date.getFullYear(),
      month: date.getMonth(),
      label: Utilities.formatDate(
        date,
        Session.getScriptTimeZone(),
        "MMMM yyyy",
      ),
      hours: Number(monthTotals[index]) || 0,
    });
  });

  /*
   * Current month.
   */
  const currentMonthData = monthlyData.find(
    (item) => item.year === currentYear && item.month === currentMonth,
  );

  /*
   * Previous month.
   */
  const previousMonthDate = new Date(currentYear, currentMonth - 1, 1);

  const previousMonthData = monthlyData.find(
    (item) =>
      item.year === previousMonthDate.getFullYear() &&
      item.month === previousMonthDate.getMonth(),
  );

  /*
   * Same month last year.
   */
  const lastYearData = monthlyData.find(
    (item) => item.year === currentYear - 1 && item.month === currentMonth,
  );

  const currentHours = currentMonthData?.hours || 0;
  const previousHours = previousMonthData?.hours || 0;
  const lastYearHours = lastYearData?.hours || 0;

  /*
   * Percentage change helper.
   *
   * Returns null when there is no comparison value,
   * preventing divide-by-zero errors.
   */
  const percentageChange = (current, previous) => {
    if (!previous) {
      return null;
    }

    return ((current - previous) / Math.abs(previous)) * 100;
  };

  /*
   * ---------------------------------------------------------
   * Current Month Log
   *
   * AR:AV = Week 1 -> Week 5
   * Row 2 contains the totals.
   * ---------------------------------------------------------
   */

  let chargedHours = 0;
  let activeWeeks = 0;

  if (currentSheet) {
    const weeklyTotals = currentSheet
      .getRange("AR2:AV2")
      .getValues()[0]
      .map((value) => Number(value) || 0);

    chargedHours = weeklyTotals.reduce((total, value) => total + value, 0);

    activeWeeks = weeklyTotals.filter((value) => value > 0).length;
  }

  const chargedRate =
    currentHours > 0 ? (chargedHours / currentHours) * 100 : null;

  const averageWeekly = activeWeeks > 0 ? chargedHours / activeWeeks : 0;

  return {
    currentMonth: currentMonthData
      ? {
          label: currentMonthData.label,
          hours: currentHours,
        }
      : {
          label: Utilities.formatDate(
            now,
            Session.getScriptTimeZone(),
            "MMMM yyyy",
          ),
          hours: 0,
        },

    previousMonth: previousMonthData
      ? {
          label: previousMonthData.label,
          hours: previousHours,
        }
      : {
          label: "",
          hours: 0,
        },

    lastYear: lastYearData
      ? {
          label: lastYearData.label,
          hours: lastYearHours,
        }
      : {
          label: "",
          hours: 0,
        },

    previousMonthChange: percentageChange(currentHours, previousHours),

    lastYearChange: percentageChange(currentHours, lastYearHours),

    chargedHours,
    chargedRate,
    averageWeekly,
    activeWeeks,
  };
}

function getGrowthComparisonSummary(
  sessionId,
  signature,
  currentYear,
  comparisonYear,
) {
  requireCapability(sessionId, signature, "hours.view");

  const sheet = getSheetSafe("Other Analytics");

  if (!sheet) {
    return null;
  }

  currentYear = Number(currentYear);
  comparisonYear = Number(comparisonYear);

  if (!currentYear || !comparisonYear) {
    return null;
  }

  /*
   * Row 4 = headers
   * Row 5+ = yearly data
   */
  const lastRow = sheet.getLastRow();

  if (lastRow < 5) {
    return null;
  }

  const data = sheet.getRange(5, 1, lastRow - 4, 14).getValues();

  const current = data.find((row) => Number(row[0]) === currentYear);

  const previous = data.find((row) => Number(row[0]) === comparisonYear);

  if (!current || !previous) {
    return null;
  }

  return {
    currentYear,
    comparisonYear,

    current: {
      hours: Number(current[1]) || 0,
      paid: Number(current[2]) || 0,
      owed: Number(current[3]) || 0,
      netHours: Number(current[4]) || 0,
      lifetime: Number(current[5]) || 0,
      collection: Number(current[6]) || 0,
      debt: Number(current[7]) || 0,
      yield: Number(current[8]) || 0,
      monthlyAverage: Number(current[13]) || 0,
    },

    previous: {
      hours: Number(previous[1]) || 0,
      paid: Number(previous[2]) || 0,
      owed: Number(previous[3]) || 0,
      netHours: Number(previous[4]) || 0,
      lifetime: Number(previous[5]) || 0,
      collection: Number(previous[6]) || 0,
      debt: Number(previous[7]) || 0,
      yield: Number(previous[8]) || 0,
      monthlyAverage: Number(previous[13]) || 0,
    },
  };
}
