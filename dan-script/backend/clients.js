const CLIENT_CREATION_JOURNAL = "ClientCreation_Operations";
const CLIENT_CREATION_RETENTION_DAYS = 30;

function getClientCreationJournal_() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(CLIENT_CREATION_JOURNAL);

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
    sheet = ss.insertSheet(CLIENT_CREATION_JOURNAL);
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
  requireCapability(sessionId, signature, "clients.view");

  const name = Validation.sheetName(clientName, "Client name");
  const ss = getSpreadsheet();

  return ss.getSheetByName(name) !== null;
}

function getClientSheetsList() {
  return getSpreadsheet()
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
  requireCapability(sessionId, signature, "clients.manage");

  const sheet = getSheetSafe("Client Names");

  if (!sheet) {
    logResponse('Missing "Client Names" sheet.');
    return [];
  }

  const names = getClientSheetsList();

  sheet.getRange("A2:A").clearContent();

  if (names.length) {
    sheet
      .getRange(2, 1, names.length, 1)
      .setValues(names.map((name) => [name]));
  }

  return names;
}

function getSheetByPartialName(partial) {
  const ss = getSpreadsheet();

  const normalizedPartial = normalizeText(partial);

  return (
    ss
      .getSheets()
      .find((sheet) =>
        normalizeText(sheet.getName()).includes(normalizedPartial),
      ) || null
  );
}

function getCellValueSafe(sheet, cellRange) {
  try {
    return sheet.getRange(cellRange).getValue();
  } catch (err) {
    logResponse(`Error reading ${cellRange}: ${err.message}`);

    return "";
  }
}

function getDirectCellValueSafe(sheetName, cellRange) {
  const sheet = getSheetSafe(sheetName);

  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found.`);
  }

  return sheet.getRange(cellRange).getValue();
}

function goToPresentClient(sessionId, signature, sheetName) {
  requireCapability(sessionId, signature, "clients.view");

  const ss = getSpreadsheet();
  const labSheet = getLabSheet();

  if (!labSheet) {
    return "⚠️ Lab sheet not found";
  }

  if (!sheetName) {
    sheetName = getLabCell("P24");

    if (!isNonEmptyString(sheetName)) {
      return "⚠️ No client name found in P24";
    }
  }

  const sheet = getSheetSafe(sheetName);

  if (!sheet) {
    return `⚠️ Sheet "${sheetName}" not found`;
  }

  return `${ss.getUrl()}#gid=${sheet.getSheetId()}`;
}

function getClientDataByStatus(sessionId, signature, status, customSheet) {
  requireCapability(sessionId, signature, "clients.view");

  const config = CONFIG.DIALOGS.STATUS[status];

  if (!config) {
    return [];
  }

  const sheet = getSheetSafe(customSheet || config.sheet);

  if (!sheet) {
    return [];
  }

  return sheet
    .getRange(config.range)
    .getValues()
    .filter((row) => row.some(Boolean));
}

function getActiveClientsPaidOwed(sessionId, signature) {
  requireCapability(sessionId, signature, "clients.view");

  try {
    const sheet = getSheetSafe("Paid & Owed Log");

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
          paidOwedHistory: getClientPaidOwedDataHistoryInternal(client),
        };
      });
  } catch (err) {
    throw new Error(err.message || String(err));
  }
}

function getRoleFromSheet(name) {
  try {
    const sheet = getSheetSafe(name);

    if (!sheet) {
      return "";
    }

    return sheet.getRange("N17").getValue() || "";
  } catch (err) {
    return "";
  }
}

function getClientHourLogData(sessionId, signature, clientName) {
  requireCapability(sessionId, signature, "clients.view");

  const sheet = getSheetSafe(clientName);

  if (!sheet) {
    return [];
  }

  const values = sheet
    .getRange("E3:H")
    .getValues()
    .filter((row) => row.some(Boolean));

  const timezone = getSpreadsheet().getSpreadsheetTimeZone();

  return values.map((row) => {
    const date = row[3];

    row[3] =
      date instanceof Date
        ? Utilities.formatDate(date, timezone, "MM/dd/yyyy")
        : String(date ?? "");

    return row;
  });
}

function getClientSheetUrl(sessionId, signature, name) {
  requireCapability(sessionId, signature, "clients.view");

  if (!isNonEmptyString(name)) {
    throw new Error("No sheet name provided");
  }

  const ss = getSpreadsheet();
  const sheet = getSheetSafe(name);

  if (!sheet) {
    throw new Error(`Sheet "${name}" not found`);
  }

  if (sheet.isSheetHidden()) {
    sheet.showSheet();
  }

  return `${ss.getUrl()}#gid=${sheet.getSheetId()}`;
}

function createClientSheet(sessionId, signature, input, requestId) {
  const startedAt = Date.now();
  let sheetName = "Unknown client";
  let result;

  try {
    requireCapability(sessionId, signature, "clients.create");
    enforceUserRateLimit("client_sheet_creation", sessionId, 5, 60);
    enforceGlobalRateLimit("client_sheet_creation", 15, 60);

    Validation.requireObject(input, "Client data");
    sheetName = Validation.sheetName(input.name, "Client name");

    requestId = Validation.requiredString(requestId, "Request ID", {
      maxLength: 200,
    });

    const ss = getSpreadsheet();
    const operationKey = `${sessionId}:${requestId}`;

    const requestHash = Utilities.base64EncodeWebSafe(
      Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, operationKey),
    ).replace(/=+$/, "");

    const temporaryName = `__GCB_CREATE_${requestHash.slice(0, 20)}`;
    const recoveryMarker = `GCB_CLIENT_CREATE:${requestHash}`;

    const lock = LockService.getScriptLock();
    lock.waitLock(30000);

    try {
      const journal = getClientCreationJournal_();

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

        const template = getSheetSafe("BLANK");

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
  requireCapability(sessionId, signature, "clients.view");

  const analyticsSheet = getSheetSafe("Client Analytics");

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

  const externalClientMap = getExternalClientMap();

  return analytics.map((row) => {
    const name = String(row[0] || "").trim();

    const clientSheet = getSheetSafe(name);

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
  requireCapability(sessionId, signature, "clients.view");

  return getClientPaidOwedDataHistoryInternal(client);
}

function getClientPaidOwedDataHistoryInternal(clientName) {
  try {
    const sheet = getSheetSafe(clientName);
    if (!sheet) return [];

    const lastRow = sheet.getLastRow();

    if (lastRow < 51) {
      return [];
    }

    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;

    const dataRange = sheet.getRange(51, 11, lastRow - 50, 4);

    const values = dataRange.getValues();

    return values
      .filter((r) => {
        if (!r.some((v) => v !== "" && v !== null)) {
          return false;
        }

        const year = Number(r[0]);

        return year === currentYear || year === previousYear;
      })
      .map((r) => ({
        year: Number(r[0]),
        hoursPaid: Number(r[1]) || 0,
        hoursOwed: Number(r[2]) || 0,
        netHours: Number(r[3]) || 0,
      }));
  } catch (e) {
    console.warn("Failed to load sales for client:", clientName, e);

    return [];
  }
}

function getClientActivityTrends(sessionId, signature) {
  requireCapability(sessionId, signature, "clients.view");

  try {
    const sheet = getSheetSafe("Other Analytics");

    if (!sheet) {
      throw new Error("Other Analytics sheet not found.");
    }

    // P8:U8
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
  } catch (err) {
    console.error("[getClientActivityTrends]", err);

    throw new Error(err.message || "Failed to load client activity trends.");
  }
}

function getClientRankings(sessionId, signature) {
  requireCapability(sessionId, signature, "clients.view");

  const sheet = getSheetSafe("Client Analytics");

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
  requireCapability(sessionId, signature, "clients.view");

  try {
    const sheet = getSheetSafe("Legacy Clients");

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
  requireCapability(sessionId, signature, "clients.view");

  if (!isNonEmptyString(clientName)) {
    throw new Error("Client name cannot be empty.");
  }

  const name = clientName.trim();
  const sheet = getSheetSafe(name);

  if (!sheet) {
    throw new Error(`Client sheet "${name}" not found.`);
  }

  const timezone = getSpreadsheet().getSpreadsheetTimeZone();

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
  requireCapability(sessionId, signature, "clients.edit");

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

  const sheet = getSheetSafe(name);

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
