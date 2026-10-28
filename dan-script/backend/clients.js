const CLIENT_CREATION_JOURNAL = "ClientCreation_Operations";
const CLIENT_CREATION_RETENTION_DAYS = 30;

function getClientCreationJournal_(spreadsheet) {
  if (!spreadsheet) {
    throw new Error(
      "A manager spreadsheet is required for the client creation journal.",
    );
  }

  let sheet = spreadsheet.getSheetByName(CLIENT_CREATION_JOURNAL);

  const headers = [
    "Created At",
    "Operation Key",
    "Request ID",
    "Status",
    "Client Name",
    "Sheet ID",
    "Updated At",
    "Error / Reconciliation Note",
  ];

  if (!sheet) {
    sheet = spreadsheet.insertSheet(CLIENT_CREATION_JOURNAL);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    // Validate the existing schema rather than silently overwriting it.
    const existingHeaders = sheet
      .getRange(1, 1, 1, headers.length)
      .getDisplayValues()[0];

    if (
      existingHeaders[1] !== "Operation Key" ||
      existingHeaders[3] !== "Status" ||
      existingHeaders[5] !== "Sheet ID"
    ) {
      throw new Error(
        `The "${CLIENT_CREATION_JOURNAL}" schema is invalid. ` +
          "Verify its headers before continuing.",
      );
    }
  }

  return sheet;
}

function findClientCreationOperation_(sheet, operationKey) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return null;

  const keys = sheet
    .getRange(2, 2, lastRow - 1, 1)
    .getDisplayValues()
    .flat();

  // Search newest-first in case a journal was manually repaired.
  for (let i = keys.length - 1; i >= 0; i--) {
    if (String(keys[i]).trim() === operationKey) {
      const row = i + 2;
      const values = sheet.getRange(row, 1, 1, 8).getValues()[0];

      return {
        row,
        createdAt: values[0],
        operationKey: String(values[1]),
        requestId: String(values[2]),
        status: String(values[3]).trim().toUpperCase(),
        clientName: String(values[4]),
        sheetId: String(values[5] || ""),
        updatedAt: values[6],
        note: String(values[7] || ""),
      };
    }
  }

  return null;
}

function writeClientCreationOperation_(sheet, row, operation) {
  const now = new Date();

  const values = [
    operation.createdAt || now,
    operation.operationKey,
    operation.requestId,
    operation.status,
    operation.clientName,
    operation.sheetId || "",
    now,
    operation.note || "",
  ];

  sheet.getRange(row, 1, 1, values.length).setValues([values]);
  SpreadsheetApp.flush();
}

/**
 * Remove only old COMPLETED records.
 *
 * PROCESSING and reconciliation records are intentionally retained.
 * Call while holding the script lock.
 */
function cleanupClientCreationJournal_(sheet) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) return;

  const cutoff =
    Date.now() - CLIENT_CREATION_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  const rows = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  const rowsToDelete = [];

  rows.forEach((row, index) => {
    const createdAt = row[0];
    const status = String(row[3] || "")
      .trim()
      .toUpperCase();

    if (
      status === "COMPLETED" &&
      createdAt instanceof Date &&
      createdAt.getTime() < cutoff
    ) {
      rowsToDelete.push(index + 2);
    }
  });

  // Delete bottom-up so row indices remain valid.
  rowsToDelete.reverse().forEach((row) => sheet.deleteRow(row));
}

function clientSheetExists(sessionId, signature, clientName) {
  const { spreadsheet } = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "clients.view",
  );

  const name = Validation.sheetName(clientName, "Client name");

  return spreadsheet.getSheetByName(name) !== null;
}

function getClientSheetsList(sessionId, signature) {
  const { spreadsheet } = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "clients.view",
  );

  return getClientSheetsListFromSpreadsheet_(spreadsheet);
}

function getClientSheetsListFromSpreadsheet_(spreadsheet) {
  return spreadsheet
    .getSheets()
    .filter((sheet) => {
      const sheetName = sheet.getName();
      const marker = String(sheet.getRange("K1").getValue()).trim();

      return marker === sheetName;
    })
    .map((sheet) => sheet.getName())
    .sort();
}

function syncClientSheetList(sessionId, signature) {
  const { spreadsheet } = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "clients.manage",
  );

  const sheet = spreadsheet.getSheetByName("Client Names");

  if (!sheet) {
    throw new Error(
      'The authenticated manager spreadsheet is missing the "Client Names" sheet.',
    );
  }

  const names = getClientSheetsListFromSpreadsheet_(spreadsheet);

  // Clear existing values without clearing the entire column's formatting.
  const lastRow = sheet.getLastRow();

  if (lastRow >= 2) {
    sheet.getRange(2, 1, lastRow - 1, 1).clearContent();
  }

  if (names.length) {
    sheet
      .getRange(2, 1, names.length, 1)
      .setValues(names.map((name) => [name]));
  }

  SpreadsheetApp.flush();

  return names;
}

function getCellValueSafe(sheet, cellRange) {
  try {
    return sheet.getRange(cellRange).getValue();
  } catch (err) {
    logResponse(`Error reading ${cellRange}: ${err.message}`);

    return "";
  }
}

function getDirectCellValueSafe(sessionId, signature, sheetName, cellRange) {
  const { spreadsheet } = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "clients.view",
  );

  const sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found.`);
  }

  return sheet.getRange(cellRange).getValue();
}

function goToPresentClient(sessionId, signature, sheetName) {
  const { spreadsheet } = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "clients.view",
  );

  const labSheet = spreadsheet.getSheetByName("Lab 3.0");

  if (!labSheet) {
    return "⚠️ Lab sheet not found";
  }

  if (!sheetName) {
    sheetName = labSheet.getRange("P24").getValue();

    if (!isNonEmptyString(sheetName)) {
      return "⚠️ No client name found in P24";
    }
  }

  const name = String(sheetName).trim();
  const sheet = spreadsheet.getSheetByName(name);

  if (!sheet) {
    return `⚠️ Sheet "${name}" not found in your operational spreadsheet`;
  }

  return `${spreadsheet.getUrl()}#gid=${sheet.getSheetId()}`;
}

function getClientDataByStatus(sessionId, signature, status, customSheet) {
  const { spreadsheet } = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "clients.view",
  );

  const config = CONFIG.DIALOGS.STATUS[status];

  if (!config) {
    return [];
  }

  const sheetName = String(customSheet || config.sheet).trim();

  if (!sheetName) {
    return [];
  }

  const sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    return [];
  }

  return sheet
    .getRange(config.range)
    .getValues()
    .filter((row) => row.some(Boolean));
}

function getActiveClientsPaidOwed(sessionId, signature) {
  const { spreadsheet } = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "clients.view",
  );

  try {
    const sheet = spreadsheet.getSheetByName("Paid & Owed Log");

    if (!sheet) {
      throw new Error('Sheet "Paid & Owed Log" was not found.');
    }

    const lastRow = sheet.getLastRow();

    if (lastRow < 2) {
      return [];
    }

    const values = sheet
      .getRange(2, 15, lastRow - 1, 5) // O:S
      .getValues();

    return values
      .filter((row) => row.some((value) => value !== ""))
      .map((row) => {
        const client = row[0] ?? "";
        return {
          client,
          totalOwed: Number(row[1]) || 0,
          currentMonthOwed: Number(row[2]) || 0,
          totalPaid: Number(row[3]) || 0,
          today: row[4] ?? "",
          paidOwedHistory: getClientPaidOwedDataHistoryInternal(
            spreadsheet,
            String(client || "").trim(),
          ),
        };
      });
  } catch (err) {
    throw new Error(err.message || String(err));
  }
}

function getClientHourLogData(sessionId, signature, clientName) {
  const { spreadsheet } = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "clients.view",
  );

  const name = String(clientName || "").trim();

  if (!name) {
    throw new Error("A client must be selected.");
  }

  const sheet = spreadsheet.getSheetByName(name);

  if (!sheet) {
    return [];
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < 3) {
    return [];
  }

  const values = sheet
    .getRange(3, 5, lastRow - 2, 4)
    .getValues()
    .filter((row) => row.some(Boolean));

  const timezone = spreadsheet.getSpreadsheetTimeZone();

  return values.map((row) => {
    const date = row[3];

    row[3] =
      date instanceof Date
        ? Utilities.formatDate(date, timezone, "MM/dd/yyyy")
        : String(date ?? "");

    return row;
  });
}

function getClientRecordsData(sessionId, signature, clientName) {
  const { spreadsheet } = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "clients.view",
  );

  const name = String(clientName || "").trim();

  if (!name) {
    throw new Error("A client must be selected.");
  }

  const sheet = spreadsheet.getSheetByName(name);

  if (!sheet) {
    throw new Error(
      `Client sheet "${name}" was not found in your operational spreadsheet.`,
    );
  }

  const lastRow = sheet.getLastRow();
  const timezone = spreadsheet.getSpreadsheetTimeZone();

  const sheetUrl = `${spreadsheet.getUrl()}#gid=${sheet.getSheetId()}`;

  if (lastRow < 3) {
    return {
      clientName: name,
      spreadsheetId: spreadsheet.getId(),
      sheetId: sheet.getSheetId(),
      sheetUrl,
      records: [],
    };
  }

  const values = sheet.getRange(3, 5, lastRow - 2, 5).getValues();

  const records = values
    .map((row, index) => {
      const [type, task, hours, date, status] = row;
      const rowIndex = index + 3;

      const formattedDate =
        date instanceof Date
          ? Utilities.formatDate(date, timezone, "MM/dd/yyyy")
          : String(date ?? "").trim();

      return {
        // Visible fields
        type: String(type ?? "").trim(),
        task: String(task ?? "").trim(),
        date: formattedDate,
        status: String(status ?? "")
          .trim()
          .toUpperCase(),

        // Retained for validation and safe updates
        clientName: name,
        spreadsheetId: spreadsheet.getId(),
        sheetId: sheet.getSheetId(),
        rowIndex,
        statusColumnIndex: 9,
        cellA1: `I${rowIndex}`,
        hours: hours ?? "",
        originalStatus: String(status ?? "").trim(),
        expectedType: String(type ?? "").trim(),
        expectedTask: String(task ?? "").trim(),
        expectedHours: hours ?? "",
        expectedDate:
          date instanceof Date ? date.toISOString() : String(date ?? "").trim(),
      };
    })
    .filter(
      (record) =>
        record.type ||
        record.task ||
        record.date ||
        record.status ||
        record.hours !== "",
    );

  return {
    clientName: name,
    spreadsheetId: spreadsheet.getId(),
    sheetId: sheet.getSheetId(),
    sheetUrl,
    records,
  };
}

function updateClientRecordStatus(sessionId, signature, payload) {
  const { spreadsheet } = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "clients.update_status",
  );

  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid status update payload.");
  }

  const clientName = String(payload.clientName || "").trim();
  const rowIndex = Number(payload.rowIndex);
  const statusColumnIndex = Number(payload.statusColumnIndex);
  const newStatus = String(payload.newStatus || "")
    .trim()
    .toUpperCase();

  const allowedStatuses = ["INVOICED", "PAID", "UNPAID"];

  if (!clientName) {
    throw new Error("Client name is required.");
  }

  if (!Number.isInteger(rowIndex) || rowIndex < 3 || statusColumnIndex !== 9) {
    throw new Error("Invalid record coordinates.");
  }

  if (!allowedStatuses.includes(newStatus)) {
    throw new Error(`Unsupported status: ${newStatus}`);
  }

  const lock = LockService.getScriptLock();

  lock.waitLock(10000);

  try {
    const sheet = spreadsheet.getSheetByName(clientName);

    if (!sheet) {
      throw new Error("The client sheet could not be found.");
    }

    if (
      sheet.getSheetId() !== Number(payload.sheetId) ||
      sheet.getParent().getId() !== String(payload.spreadsheetId || "")
    ) {
      throw new Error("The source sheet changed. Reload the client records.");
    }

    if (rowIndex > sheet.getLastRow()) {
      throw new Error("The record row no longer exists. Reload the records.");
    }

    // Read E:I again while holding the script lock.
    const current = sheet.getRange(rowIndex, 5, 1, 5).getValues()[0];

    const [type, task, hours, date, currentStatus] = current;

    const normalize = (value) => String(value ?? "").trim();

    const currentDate =
      date instanceof Date ? date.toISOString() : normalize(date);

    // Verify that the row still contains the original record.
    if (
      normalize(type) !== normalize(payload.expectedType) ||
      normalize(task) !== normalize(payload.expectedTask) ||
      normalize(hours) !== normalize(payload.expectedHours) ||
      currentDate !== normalize(payload.expectedDate)
    ) {
      throw new Error(
        "The record has changed or moved. Reload before updating.",
      );
    }

    const currentStatusNormalized = normalize(currentStatus).toUpperCase();

    const newStatusNormalized = newStatus;

    // A prior attempt may have succeeded even if its response was lost.
    // If the intended status is already present, treat it as success.
    if (currentStatusNormalized === newStatusNormalized) {
      return {
        success: true,
        unchanged: true,
        rowIndex,
        status: newStatus,
      };
    }

    if (
      currentStatusNormalized !==
      normalize(payload.originalStatus).toUpperCase()
    ) {
      throw new Error(
        "STATUS_CONFLICT: Another update changed this status. Reload the record.",
      );
    }

    // Write only the status cell.
    sheet.getRange(rowIndex, 9).setValue(newStatus);

    SpreadsheetApp.flush();

    return {
      success: true,
      unchanged: false,
      clientName,
      rowIndex,
      statusColumnIndex: 9,
      cellA1: `I${rowIndex}`,
      status: newStatus,
    };
  } finally {
    lock.releaseLock();
  }
}

function getClientSheetUrl(sessionId, signature, name) {
  const { spreadsheet } = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "clients.view",
  );

  if (!isNonEmptyString(name)) {
    throw new Error("No sheet name provided.");
  }

  const sheet = spreadsheet.getSheetByName(name.trim());

  if (!sheet) {
    throw new Error(
      `Sheet "${name}" was not found in your operational spreadsheet.`,
    );
  }

  if (sheet.isSheetHidden()) {
    sheet.showSheet();
  }

  return `${spreadsheet.getUrl()}#gid=${sheet.getSheetId()}`;
}

function createClientSheet(sessionId, signature, input, requestId) {
  const startedAt = Date.now();
  let sheetName = "Unknown client";
  let result;

  try {
    const { spreadsheet: ss } = getManagerWorkspaceForCapability_(
      sessionId,
      signature,
      "clients.create",
    );

    enforceUserRateLimit("client_sheet_creation", sessionId, 5, 60);
    enforceGlobalRateLimit("client_sheet_creation", 15, 60);

    Validation.requireObject(input, "Client data");
    sheetName = Validation.sheetName(input.name, "Client name");

    requestId = Validation.requiredString(requestId, "Request ID", {
      maxLength: 200,
    });
    const operationKey = `${sessionId}:${requestId}`;

    const requestHash = Utilities.base64EncodeWebSafe(
      Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, operationKey),
    ).replace(/=+$/, "");

    const temporaryName = `__GCB_CREATE_${requestHash.slice(0, 20)}`;
    const recoveryMarker = `GCB_CLIENT_CREATE:${requestHash}`;

    const lock = LockService.getScriptLock();
    lock.waitLock(30000);

    try {
      const journal = getClientCreationJournal_(ss);

      cleanupClientCreationJournal_(journal);

      let operation = findClientCreationOperation_(journal, operationKey);

      if (operation && operation.clientName !== sheetName) {
        throw new Error(
          "This request ID was already used for a different client name.",
        );
      }

      if (operation?.status === "COMPLETED") {
        const existingSheet = operation.sheetId
          ? ss
              .getSheets()
              .find(
                (sheet) =>
                  String(sheet.getSheetId()) === String(operation.sheetId),
              )
          : null;

        if (existingSheet && existingSheet.getName() === sheetName) {
          result = {
            success: true,
            alreadyCompleted: true,
            sheetName,
          };
        } else {
          throw new Error(
            "The original client sheet could not be verified. " +
              "Reconcile the client creation journal before retrying.",
          );
        }
      } else if (operation?.status === "PROCESSING") {
        const markedSheets = ss.getSheets().filter((sheet) => {
          return (
            sheet.getName() !== sheetName &&
            String(sheet.getRange("L1").getDisplayValue()).trim() ===
              recoveryMarker
          );
        });

        if (markedSheets.length > 1) {
          throw new Error(
            "Multiple sheets contain this request's recovery marker. " +
              "Reconcile the client creation journal before continuing.",
          );
        }

        const temporarySheet = markedSheets[0] || null;

        if (temporarySheet) {
          if (ss.getSheetByName(sheetName)) {
            throw new Error(
              `Sheet "${sheetName}" already exists alongside the recovery sheet. ` +
                "Reconcile this operation before continuing.",
            );
          }

          temporarySheet.setName(sheetName);
          temporarySheet.showSheet();
          temporarySheet.getRange("E1").setValue(sheetName);
          temporarySheet.getRange("L1").clearContent();

          ss.setActiveSheet(temporarySheet);
          ss.moveActiveSheet(1);
          SpreadsheetApp.flush();

          writeClientCreationOperation_(journal, operation.row, {
            ...operation,
            status: "COMPLETED",
            sheetId: String(temporarySheet.getSheetId()),
            note: "Recovered using the request-specific L1 marker.",
          });

          result = {
            success: true,
            recovered: true,
            sheetName,
          };
        } else {
          throw new Error(
            "This request is still marked PROCESSING, but no matching recovery " +
              "marker was found. Check the spreadsheet for an interrupted copy " +
              "before retrying.",
          );
        }
      } else if (operation && operation.status !== "FAILED") {
        throw new Error(
          `The client creation request has status "${operation.status || "UNKNOWN"}". ` +
            "Reconcile the journal before retrying.",
        );
      } else {
        // An existing FAILED record can be retried only if neither the
        // intended name nor this request's temporary name is present.
        if (ss.getSheetByName(sheetName) || ss.getSheetByName(temporaryName)) {
          throw new Error(
            "A sheet associated with this client name or request already exists. " +
              "Reconcile it before retrying.",
          );
        }

        const template = ss.getSheetByName("BLANK");

        if (!template) {
          throw new Error('Template sheet "BLANK" not found.');
        }

        if (!operation) {
          const row = journal.getLastRow() + 1;

          operation = {
            row,
            operationKey,
            requestId,
            clientName: sheetName,
            status: "PROCESSING",
            sheetId: "",
            createdAt: new Date(),
            note: "",
          };
        } else {
          operation.status = "PROCESSING";
          operation.sheetId = "";
          operation.note = "";
        }

        // Persist the intent before attempting the side effect.
        writeClientCreationOperation_(journal, operation.row, operation);

        let newSheet;

        try {
          newSheet = template.copyTo(ss);

          // Write the request-specific marker before renaming the copy.
          newSheet.getRange("L1").setValue(recoveryMarker);
          SpreadsheetApp.flush();

          // Rename only after the marker has been saved.
          newSheet.setName(temporaryName);
          SpreadsheetApp.flush();

          newSheet.setName(sheetName);
          newSheet.showSheet();
          newSheet.getRange("E1").setValue(sheetName);

          // Clear the marker after the sheet has its intended name and client value.
          newSheet.getRange("L1").clearContent();

          ss.setActiveSheet(newSheet);
          ss.moveActiveSheet(1);
          SpreadsheetApp.flush();

          writeClientCreationOperation_(journal, operation.row, {
            ...operation,
            status: "COMPLETED",
            sheetId: String(newSheet.getSheetId()),
            note: "",
          });

          result = {
            success: true,
            sheetName,
          };
        } catch (error) {
          // Leave PROCESSING once copyTo() has been attempted.
          // An exception does not prove that the copy was not created.
          try {
            writeClientCreationOperation_(journal, operation.row, {
              ...operation,
              status: "PROCESSING",
              sheetId: newSheet ? String(newSheet.getSheetId()) : "",
              note:
                "Outcome uncertain. Reconcile before retrying. " +
                String(error?.message || error).slice(0, 500),
            });
          } catch (journalError) {
            console.error(
              "[Client Creation] Could not update recovery journal:",
              journalError?.message || journalError,
            );
          }

          throw error;
        }
      }
    } finally {
      lock.releaseLock();
    }

    logClientSheetCreation_("SUCCESS", {
      startedAt,
      sheetName,
      message: result?.alreadyCompleted
        ? "Previously completed client creation request reused."
        : result?.recovered
          ? "Client sheet creation recovered successfully."
          : "Client sheet created successfully.",
    });

    return result;
  } catch (error) {
    logClientSheetCreation_("FAILED", {
      startedAt,
      sheetName,
      message: "Client sheet creation failed or requires reconciliation.",
      error,
    });

    throw error;
  }
}

function logClientSheetCreation_(
  status,
  { startedAt, sheetName = "Unknown client", message, error = null } = {},
) {
  try {
    const logged = recordGcbOperationLog_({
      category: "CLIENT",
      operation: "CREATE_CLIENT_SHEET",
      status,
      trigger: "MANUAL",
      durationMs: Date.now() - startedAt,
      processed: 1,
      succeeded: status === "SUCCESS" ? 1 : 0,
      failed: status === "FAILED" ? 1 : 0,
      target: sheetName,
      message,
      ...(error ? { error: String(error.message || error).slice(0, 500) } : {}),
    });

    if (logged === false) {
      console.error(
        "[Client Creation] Operation logger could not save the log.",
      );
    }
  } catch (logError) {
    console.error(
      "[Client Creation] Operation logging failed:",
      logError?.message || logError,
    );
  }
}

function getClientDirectoryData(sessionId, signature) {
  const session = requireCapability(sessionId, signature, "clients.view");

  const workspace = getManagerWorkspaceForSession_(session);
  const managerSpreadsheet = workspace.spreadsheet;

  const analyticsSheet = managerSpreadsheet.getSheetByName("Client Analytics");

  if (!analyticsSheet) {
    return [];
  }

  const lastRow = analyticsSheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  const analytics = analyticsSheet
    .getRange(2, 1, lastRow - 1, 8)
    .getValues()
    .filter((row) => row[0] !== "" && row[0] !== null);

  const externalClientMap = String(
    workspace.externalSheetsFolderId || "",
  ).trim()
    ? getExternalClientMap(managerSpreadsheet)
    : new Map();

  return analytics.map((row) => {
    const name = String(row[0] || "").trim();

    const clientSheet = managerSpreadsheet.getSheetByName(name);

    const role = clientSheet
      ? String(clientSheet.getRange("N17").getValue() || "").trim()
      : "";

    return {
      name,
      role,
      paid: Number(row[1]) || 0,
      owed: Number(row[2]) || 0,
      netPaid: Number(row[3]) || 0,
      collectionRate: Number(row[4]) || 0,
      hours: Number(row[5]) || 0,
      projects: Number(row[6]) || 0,
      debtExposure: Number(row[7]) || 0,
      externalUrl: externalClientMap.get(normalizeText(name)) || "",
    };
  });
}

function getClientPaidOwedDataHistory(sessionId, signature, clientName) {
  const session = requireCapability(sessionId, signature, "clients.view");
  const workspace = getManagerWorkspaceForSession_(session);

  return getClientPaidOwedDataHistoryInternal(
    workspace.spreadsheet,
    clientName,
  );
}

function getClientPaidOwedDataHistoryInternal(spreadsheet, clientName) {
  try {
    if (!spreadsheet || !isNonEmptyString(clientName)) {
      return [];
    }

    const sheet = spreadsheet.getSheetByName(clientName.trim());

    if (!sheet) return [];

    const lastRow = sheet.getLastRow();

    if (lastRow < 51) {
      return [];
    }

    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;

    const values = sheet.getRange(51, 11, lastRow - 50, 4).getValues();

    return values
      .filter((row) => {
        if (!row.some((value) => value !== "" && value !== null)) {
          return false;
        }

        const year = Number(row[0]);

        return year === currentYear || year === previousYear;
      })
      .map((row) => ({
        year: Number(row[0]),
        hoursPaid: Number(row[1]) || 0,
        hoursOwed: Number(row[2]) || 0,
        netHours: Number(row[3]) || 0,
      }));
  } catch (err) {
    console.warn(
      "Failed to load paid/owed history for client:",
      clientName,
      err,
    );

    return [];
  }
}

function getClientActivityTrends(sessionId, signature) {
  const { spreadsheet } = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "clients.view",
  );

  const sheet = spreadsheet.getSheetByName("Other Analytics");

  if (!sheet) {
    throw new Error(
      'The "Other Analytics" sheet was not found in your operational spreadsheet.',
    );
  }

  // P = Active Clients
  // Q = Hours Logged
  // R = Tasks Completed
  // S = Projects Active
  // T = New Clients
  // U = New Projects
  const values = sheet.getRange("P8:U8").getValues()[0];

  return {
    activeClients: Number(values[0]) || 0,
    hoursLogged: Number(values[1]) || 0,
    tasksCompleted: Number(values[2]) || 0,
    projectsActive: Number(values[3]) || 0,
    newClients: Number(values[4]) || 0,
    newProjects: Number(values[5]) || 0,
  };
}

function getClientRankings(sessionId, signature) {
  const { spreadsheet } = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "clients.view",
  );

  const sheet = spreadsheet.getSheetByName("Client Analytics");

  if (!sheet) {
    return {
      overview: {
        totalClients: 0,
        totalHours: 0,
        collectionRate: 0,
      },
      rankings: {},
    };
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return {
      overview: {
        totalClients: 0,
        totalHours: 0,
        collectionRate: 0,
      },
      rankings: {},
    };
  }

  /*
   * Client Analytics
   *
   * A = Client
   * B = Paid
   * C = Owed
   * D = Net Paid
   * E = Collection Rate
   * F = Hours
   * G = Projects
   * H = Debt Exposure
   */
  const values = sheet.getRange(2, 1, lastRow - 1, 8).getValues();

  const clients = values
    .filter((row) => row[0] !== "" && row[0] !== null)
    .map((row) => ({
      client: row[0] ?? "",
      paid: Number(row[1]) || 0,
      owed: Number(row[2]) || 0,
      netPaid: Number(row[3]) || 0,
      collectionRate: Number(row[4]) || 0,
      hours: Number(row[5]) || 0,
      projects: Number(row[6]) || 0,
      debtExposure: Number(row[7]) || 0,
    }));

  if (!clients.length) {
    return {
      overview: {
        totalClients: 0,
        totalHours: 0,
        collectionRate: 0,
      },
      rankings: {},
    };
  }

  const sortDesc = (key) =>
    [...clients].sort((a, b) => (b[key] || 0) - (a[key] || 0)).slice(0, 10);

  const totalPaid = clients.reduce((total, client) => total + client.paid, 0);

  const totalOwed = clients.reduce((total, client) => total + client.owed, 0);

  const totalHours = clients.reduce((total, client) => total + client.hours, 0);

  const collectionClients = clients.filter(
    (client) => client.paid > 0 && client.owed > 0,
  );

  const sortDescFrom = (data, key) =>
    [...data].sort((a, b) => (b[key] || 0) - (a[key] || 0)).slice(0, 10);

  return {
    overview: {
      totalClients: clients.length,
      totalHours,
      collectionRate:
        totalPaid + totalOwed > 0 ? totalPaid / (totalPaid + totalOwed) : 0,
    },

    rankings: {
      topClients: sortDesc("netPaid"),
      topPaid: sortDesc("paid"),
      highestHours: sortDesc("hours"),
      highestOwed: sortDesc("owed"),
      bestCollection: sortDescFrom(collectionClients, "collectionRate"),
      highestDebtExposure: sortDescFrom(collectionClients, "debtExposure"),
    },
  };
}

function getLegacyClients(sessionId, signature) {
  const { spreadsheet } = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "clients.view",
  );

  try {
    const sheet = spreadsheet.getSheetByName("Legacy Clients");

    if (!sheet) {
      throw new Error('Sheet "Legacy Clients" not found.');
    }

    const lastRow = sheet.getLastRow();

    if (lastRow < 2) {
      return {
        clients: [],
        total: 0,
        fixed: 0,
        hourly: 0,
        manual: 0,
      };
    }

    const values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();

    const clients = values
      .filter((row) => isNonEmptyString(row[0]))
      .map((row) => ({
        name: String(row[0]).trim(),
        type: String(row[1] || "").trim(),
      }));

    const fixed = clients.filter(
      (client) => client.type.toLowerCase() === "fixed",
    ).length;

    const hourly = clients.filter(
      (client) => client.type.toLowerCase() === "hourly",
    ).length;

    const manual = clients.filter(
      (client) => client.type.toLowerCase() === "manual",
    ).length;

    return {
      clients,
      total: clients.length,
      fixed,
      hourly,
      manual,
    };
  } catch (err) {
    logResponse(`⚠️ getLegacyClients error: ${err.message}`);

    return {
      clients: [],
      total: 0,
      fixed: 0,
      hourly: 0,
      manual: 0,
    };
  }
}

function getClientDetails(sessionId, signature, clientName) {
  const { spreadsheet } = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "clients.view",
  );

  if (!isNonEmptyString(clientName)) {
    throw new Error("Client name cannot be empty.");
  }

  const name = clientName.trim();
  const sheet = spreadsheet.getSheetByName(name);

  if (!sheet) {
    throw new Error(
      `Client sheet "${name}" was not found in your operational spreadsheet.`,
    );
  }

  const timezone = spreadsheet.getSpreadsheetTimeZone();

  const profile = {
    name,
    role: getCellValueSafe(sheet, "N17") || "",
    email: getCellValueSafe(sheet, "C11") || "",
    accountOwner: getCellValueSafe(sheet, "C12") || "",
    paymentDetails: getCellValueSafe(sheet, "C13") || "",
  };

  const summary = {
    totalRenderedTime: Number(getCellValueSafe(sheet, "B8")) || 0,
    totalPaid: Number(getCellValueSafe(sheet, "B24")) || 0,
    totalOwed: Number(getCellValueSafe(sheet, "B16")) || 0,
    totalBalanceOwed: Number(getCellValueSafe(sheet, "B16")) || 0,
    currentMonthBalanceOwed: Number(getCellValueSafe(sheet, "B20")) || 0,

    projects: Number(getCellValueSafe(sheet, "N29")) || 0,
    activeProjectsMonth: Number(getCellValueSafe(sheet, "N30")) || 0,
    activeProjectsYear: Number(getCellValueSafe(sheet, "N31")) || 0,
  };

  const tasks = {
    dev: Number(getCellValueSafe(sheet, "C3")) || 0,
    design: Number(getCellValueSafe(sheet, "C4")) || 0,
    seo: Number(getCellValueSafe(sheet, "C5")) || 0,
  };

  const currentActivity = {
    week: Number(getCellValueSafe(sheet, "N18")) || 0,
    month: Number(getCellValueSafe(sheet, "N19")) || 0,
    year: Number(getCellValueSafe(sheet, "N20")) || 0,

    weeks: [
      Number(getCellValueSafe(sheet, "N23")) || 0,
      Number(getCellValueSafe(sheet, "N24")) || 0,
      Number(getCellValueSafe(sheet, "N25")) || 0,
      Number(getCellValueSafe(sheet, "N26")) || 0,
      Number(getCellValueSafe(sheet, "N27")) || 0,
    ],
  };

  return {
    profile,
    summary,
    tasks,
    currentActivity,

    hoursByMonth: getClientMonthlyHours(sheet),
    dailyHours: getClientDailyHours(sheet),
    yearlyBilling: getClientYearlyBilling(sheet),

    projects: getClientProjects(sheet, timezone),
    activity: getClientActivity(sheet, timezone),
  };
}

function getClientMonthlyHours(sheet) {
  const lastColumn = sheet.getLastColumn();

  if (lastColumn < 12) return [];

  const values = sheet.getRange(3, 11, 13, lastColumn - 10).getValues();

  const headers = values[0];
  const results = [];

  for (let column = 1; column < headers.length; column++) {
    const year = Number(headers[column]);

    if (!year) continue;

    for (let row = 1; row < values.length; row++) {
      const month = values[row][0];

      if (!month) continue;

      results.push({
        year,
        month: String(month),
        monthIndex: row,
        hours: Number(values[row][column]) || 0,
      });
    }
  }

  return results;
}

function getClientDailyHours(sheet) {
  return sheet
    .getRange("K18:L48")
    .getValues()
    .filter((row) => row[0] !== "" && row[0] !== null)
    .map((row) => ({
      day: Number(row[0]) || 0,
      hours: Number(row[1]) || 0,
    }));
}

function getClientYearlyBilling(sheet) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 51) return [];

  return sheet
    .getRange(51, 11, lastRow - 50, 4)
    .getValues()
    .filter((row) => row[0] !== "" && row[0] !== null)
    .map((row) => ({
      year: Number(row[0]) || 0,
      hoursPaid: Number(row[1]) || 0,
      hoursOwed: Number(row[2]) || 0,
      netHours: Number(row[3]) || 0,
    }))
    .filter((row) => row.year);
}

function getClientProjects(sheet, timezone) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 51) return [];

  return sheet
    .getRange(51, 20, lastRow - 50, 5)
    .getValues()
    .filter((row) => row[0] !== "" && row[0] !== null)
    .map((row) => ({
      name: String(row[0] || "").trim(),
      totalHours: Number(row[1]) || 0,
      activeYear: row[2] || "",
      activeMonth: row[3] || "",
      startDate:
        row[4] instanceof Date
          ? Utilities.formatDate(row[4], timezone, "MM/dd/yyyy")
          : String(row[4] || ""),
    }));
}

function getClientActivity(sheet, timezone) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 3) return [];

  return sheet
    .getRange(3, 5, lastRow - 2, 5)
    .getValues()
    .filter((row) => row.some((value) => value !== ""))
    .map((row) => ({
      type: String(row[0] || ""),
      project: String(row[1] || ""),
      hours: Number(row[2]) || 0,
      date:
        row[3] instanceof Date
          ? Utilities.formatDate(row[3], timezone, "MM/dd/yyyy")
          : String(row[3] || ""),
      paymentStatus: String(row[4] || ""),
    }));
}

function updateClientInformation(
  sessionId,
  signature,
  clientName,
  field,
  value,
) {
  const { spreadsheet } = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "clients.edit",
  );

  const name = String(clientName || "").trim();

  if (!name) {
    throw new Error("Client name is required.");
  }

  const fieldMap = {
    email: "C11",
    accountOwner: "C12",
    paymentDetails: "C13",
  };

  const cell = fieldMap[field];

  if (!cell) {
    throw new Error("Invalid client information field.");
  }

  const sheet = spreadsheet.getSheetByName(name);

  if (!sheet) {
    throw new Error(`Client sheet not found: ${name}`);
  }

  sheet.getRange(cell).setValue(String(value ?? "").trim());

  return {
    success: true,
    clientName: name,
    field,
    value: String(value ?? "").trim(),
  };
}

function getDailyActivityData(sessionId, signature) {
  const session = requireCapability(sessionId, signature, "hours.view");

  const workspace = getManagerWorkspaceForSession_(session);
  const managerSS = workspace.spreadsheet;

  // Refresh shared metrics only when needed.
  refreshDailyActivityMetricsIfNeeded_(workspace);

  const sheet = managerSS.getSheetByName("Client Tracker - Today");

  if (!sheet) {
    return [];
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  const values = sheet.getRange(2, 2, lastRow - 1, 6).getValues();

  return values.filter((row) =>
    row.some((value) => value !== "" && value != null),
  );
}

function refreshDailyActivityMetrics_(workspace) {
  const SOURCE_SPREADSHEET_ID =
    PropertiesService.getScriptProperties().getProperty(
      "DAILY_ACTIVITY_SOURCE_SPREADSHEET_ID",
    );

  const DESTINATION_SHEET_NAME = "Daily Activities Metrics";

  if (!SOURCE_SPREADSHEET_ID) {
    throw new Error(
      'Missing Script Property: "DAILY_ACTIVITY_SOURCE_SPREADSHEET_ID".',
    );
  }

  const managerName = String(workspace.managerName || "").trim();

  if (!managerName) {
    throw new Error("Unable to resolve the registered manager name.");
  }

  // Example: "PM DAN" -> "DAN"
  const filterName = managerName.replace(/^PM\s+/i, "").trim();

  if (!filterName) {
    throw new Error(`Invalid manager name: "${managerName}".`);
  }

  // Example: "DAN" -> "DAN - CUSTOM FILTER"
  const sourceFilterName = `${filterName} - CUSTOM FILTER`;

  const managerSS = workspace.spreadsheet;
  const destinationSheet = managerSS.getSheetByName(DESTINATION_SHEET_NAME);

  if (!destinationSheet) {
    throw new Error(`Sheet "${DESTINATION_SHEET_NAME}" was not found.`);
  }

  const sourceSS = SpreadsheetApp.openById(SOURCE_SPREADSHEET_ID);

  let values;
  const sourceFilterSheet = sourceSS.getSheetByName(sourceFilterName);

  if (sourceFilterSheet) {
    // Prefer the existing manager-specific filter sheet.
    const lastRow = sourceFilterSheet.getLastRow();

    values =
      lastRow > 0
        ? sourceFilterSheet.getRange(1, 1, lastRow, 6).getValues()
        : [];
  } else {
    // No manager-specific filter sheet: find the appropriate year sheet.
    const currentYear = new Date().getFullYear();

    const yearSheet =
      sourceSS.getSheetByName(String(currentYear)) ||
      sourceSS.getSheetByName(String(currentYear - 1));

    if (!yearSheet) {
      throw new Error(
        `No source sheet found. Neither "${currentYear}" nor ` +
          `"${currentYear - 1}" exists in the source spreadsheet.`,
      );
    }

    const firstRow = 12;
    const lastRow = yearSheet.getLastRow();

    if (lastRow < firstRow) {
      values = [];
    } else {
      const sourceValues = yearSheet
        .getRange(firstRow, 1, lastRow - firstRow + 1, 16)
        .getDisplayValues();

      // QUERY(..., 1) treats the first row of A12:P10013 as the header.
      const headers = sourceValues[0];

      // Source columns B, C, E, M, N, P.
      const selectedColumns = [1, 2, 4, 12, 13, 15];

      values = [
        selectedColumns.map((column) => headers[column]),
        ...sourceValues
          .slice(1)
          .filter((row) => String(row[9] ?? "").trim() === filterName)
          .map((row) => selectedColumns.map((column) => row[column])),
      ];
    }
  }

  // Update imported values without clearing rows that will be overwritten.
  const existingLastRow = destinationSheet.getLastRow();

  if (values.length > 0) {
    destinationSheet.getRange(1, 1, values.length, 6).setValues(values);
  }

  // Clear only stale rows left over from a previous, larger import.
  if (existingLastRow > values.length) {
    destinationSheet
      .getRange(values.length + 1, 1, existingLastRow - values.length, 6)
      .clearContent();
  }
}

function refreshDailyActivityMetricsIfNeeded_(workspace) {
  const spreadsheetId = workspace.spreadsheet.getId();
  const cache = CacheService.getScriptCache();
  const cacheKey = `daily_activity_metrics_${spreadsheetId}`;

  // Reuse a recent successful refresh.
  if (cache.get(cacheKey)) {
    return;
  }

  const lock = LockService.getScriptLock();

  // Don't let concurrent requests pile up waiting for the import.
  if (!lock.tryLock(1000)) {
    console.warn(
      "[ActivityToday] Another refresh is in progress; using existing sheet data.",
    );
    return;
  }

  try {
    // Another request may have completed while we waited for the lock.
    if (cache.get(cacheKey)) {
      return;
    }

    refreshDailyActivityMetrics_(workspace);

    // Cache only after a successful refresh.
    cache.put(cacheKey, "1", 120);
  } finally {
    lock.releaseLock();
  }
}