const EXTERNAL_SHEETS_CONFIG = {
  registrySheet: "External Sheets",

  templateProperty: "EXTERNAL_SHEET_TEMPLATE_ID",

  folderProperty: "MAIN_SHEETS_FOLDER_ID",

  headers: ["Spreadsheet ID", "Client Name", "Verified", "Status"],
};

const EXTERNAL_CREATION_JOURNAL_CONFIG = {
  sheetName: "ExternalSheetCreation_Operations",

  headers: [
    "Created At",
    "Operation Key",
    "Request ID",
    "Status",
    "Client Name",
    "Request Hash",
    "Spreadsheet ID",
    "Temporary File Name",
    "Projects JSON",
    "Stage",
    "Updated At",
    "Error / Reconciliation Note",
  ],
};

function getExternalSheetTemplateId() {
  const id = PropertiesService.getScriptProperties().getProperty(
    EXTERNAL_SHEETS_CONFIG.templateProperty,
  );

  if (!id) {
    throw new Error("EXTERNAL_SHEET_TEMPLATE_ID is not configured.");
  }

  return id;
}

function getExternalSheetsRegistry() {
  const sheet = getSheetSafe(EXTERNAL_SHEETS_CONFIG.registrySheet);

  if (!sheet) {
    throw new Error(
      `Sheet "${EXTERNAL_SHEETS_CONFIG.registrySheet}" not found.`,
    );
  }

  return sheet;
}

function getExternalSheetsFolder() {
  const folderId = PropertiesService.getScriptProperties().getProperty(
    EXTERNAL_SHEETS_CONFIG.folderProperty,
  );

  if (!folderId) {
    throw new Error("MAIN_SHEETS_FOLDER_ID is not configured.");
  }

  try {
    return DriveApp.getFolderById(folderId);
  } catch (err) {
    throw new Error("The external sheets Drive folder could not be accessed.");
  }
}

function getExternalClientMap() {
  try {
    const sheet = getSheetSafe("External Sheets");

    if (!sheet) {
      return new Map();
    }

    const lastRow = sheet.getLastRow();

    if (lastRow < 2) {
      return new Map();
    }

    // A = Spreadsheet ID
    // B = Client Name
    const values = sheet.getRange(2, 1, lastRow - 1, 2).getValues();

    const externalMap = new Map();

    values.forEach((row) => {
      const spreadsheetId = String(row[0] ?? "").trim();
      const name = String(row[1] ?? "").trim();

      if (!spreadsheetId || !name) {
        return;
      }

      const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

      externalMap.set(normalizeText(name), url);
    });

    return externalMap;
  } catch (err) {
    throw new Error(err.message || String(err));
  }
}

/**
 * Return all registered external spreadsheets.
 */
function getExternalSheets(sessionId, signature) {
  requireCapability(sessionId, signature, "clients.view");

  return getExternalSheetsInternal();
}

function getExternalSheetsInternal() {

  const sheet = getSheetSafe("External Sheets");

  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();

  return values
    .filter((row) => row[0] && row[1])
    .map((row) => {
      const spreadsheetId = String(row[0]);
      const clientName = String(row[1]);
      const spreadsheetName = String(row[2] || "");

      let totalHours = 0;
      let projectCount = 0;
      let statusValue = 0;
      let status = "Inactive";
      let accessible = false;

      try {
        const externalSS = SpreadsheetApp.openById(spreadsheetId);

        const projectsSheet = externalSS.getSheetByName("Projects");

        if (projectsSheet) {
          totalHours = Number(projectsSheet.getRange("B8").getValue()) || 0;

          statusValue = Number(projectsSheet.getRange("B20").getValue()) || 0;

          status = statusValue > 0 ? "Active" : "Inactive";
        }

        projectCount = externalSS
          .getSheets()
          .filter(
            (sheet) =>
              sheet.getName() !== "Projects" && sheet.getName() !== "BLANK",
          ).length;

        accessible = true;
      } catch (err) {
        console.warn(`Unable to access external sheet ${spreadsheetId}:`, err);
      }

      return {
        spreadsheetId,
        clientName,
        spreadsheetName,
        status,
        totalHours,
        projectCount,
        accessible,
      };
    });
}

function getExternalCreationJournal_() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(EXTERNAL_CREATION_JOURNAL_CONFIG.sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(EXTERNAL_CREATION_JOURNAL_CONFIG.sheetName);

    sheet
      .getRange(1, 1, 1, EXTERNAL_CREATION_JOURNAL_CONFIG.headers.length)
      .setValues([EXTERNAL_CREATION_JOURNAL_CONFIG.headers]);

    sheet.setFrozenRows(1);
  }

  return sheet;
}

function hashExternalCreationPayload_(value) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify(value),
    Utilities.Charset.UTF_8,
  );

  return bytes
    .map((byte) => (byte + 256) % 256)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function findExternalCreationOperation_(sheet, operationKey) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return null;
  }

  const values = sheet.getRange(2, 1, lastRow - 1, 12).getValues();

  const matches = [];

  values.forEach((row, index) => {
    if (String(row[1] || "") === operationKey) {
      matches.push({
        rowNumber: index + 2,
        values: row,
      });
    }
  });

  if (matches.length > 1) {
    throw new Error(
      "Multiple external-creation journal entries match this request. " +
        "Manual reconciliation is required.",
    );
  }

  return matches[0] || null;
}

function writeExternalCreationOperation_(sheet, rowNumber, operation) {
  const now = new Date();

  const values = [
    operation.createdAt || now,
    operation.operationKey,
    operation.requestId,
    operation.status,
    operation.clientName,
    operation.requestHash,
    operation.spreadsheetId || "",
    operation.temporaryFileName,
    JSON.stringify(operation.projects),
    operation.stage,
    now,
    operation.error || "",
  ];

  if (rowNumber) {
    sheet.getRange(rowNumber, 1, 1, values.length).setValues([values]);

    return rowNumber;
  }

  const newRow = Math.max(sheet.getLastRow() + 1, 2);

  sheet.getRange(newRow, 1, 1, values.length).setValues([values]);

  return newRow;
}

function updateExternalCreationOperation_(
  sheet,
  rowNumber,
  operation,
  updates = {},
) {
  Object.assign(operation, updates);

  writeExternalCreationOperation_(sheet, rowNumber, operation);
}

function getExternalCreationMarker_(requestHash) {
  return `GCB_EXTERNAL_CREATE:${requestHash}`;
}

function findExternalCreationFiles_(folder, marker, temporaryFileName) {
  const files = folder.getFilesByType(MimeType.GOOGLE_SHEETS);

  const matches = [];

  while (files.hasNext()) {
    const file = files.next();

    if (file.isTrashed()) {
      continue;
    }

    const isTemporaryFile = file.getName() === temporaryFileName;

    const hasRequestMarker = String(file.getDescription() || "").includes(
      marker,
    );

    if (isTemporaryFile || hasRequestMarker) {
      matches.push(file);
    }
  }

  return matches;
}

/**
 * Create a new external spreadsheet from the template.
 */
function createExternalSheet(sessionId, signature, data, requestId) {
  requireRole(sessionId, signature, "admin");
  requireCapability(sessionId, signature, "clients.create");

  if (
    typeof requestId !== "string" ||
    !requestId.trim() ||
    requestId.length > 200
  ) {
    throw new Error("A valid RequestManager request ID is required.");
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("External client data is required.");
  }

  const clientName = Validation.sheetName(data.clientName, "Client name");

  const projects = normalizeProjectNames(data.projects);

  if (!projects.length) {
    throw new Error("At least one project is required.");
  }

  const operationKey = `${sessionId}:${requestId}`;

  const requestHash = hashExternalCreationPayload_({
    clientName: normalizeText(clientName),
    projects: [...projects].sort(),
  });

  const operationToken = hashExternalCreationPayload_({
    operationKey,
  });

  const temporaryFileName = `__GCB_EXT_CREATE_${operationToken.slice(0, 24)}`;

  const marker = getExternalCreationMarker_(operationToken);

  /*
   * Serialize external creation operations so two executions
   * cannot create resources for the same request concurrently.
   */
  const lock = LockService.getScriptLock();

  lock.waitLock(30000);

  try {
    const journal = getExternalCreationJournal_();

    let entry = findExternalCreationOperation_(journal, operationKey);

    let operation;
    let rowNumber;

    if (entry) {
      rowNumber = entry.rowNumber;

      const row = entry.values;

      operation = {
        createdAt: row[0],
        operationKey: String(row[1]),
        requestId: String(row[2]),
        status: String(row[3]),
        clientName: String(row[4]),
        requestHash: String(row[5]),
        spreadsheetId: String(row[6] || ""),
        temporaryFileName: String(row[7]),
        projects: JSON.parse(String(row[8] || "[]")),
        stage: String(row[9] || "STARTED"),
        error: String(row[11] || ""),
      };

      if (operation.requestHash !== requestHash) {
        throw new Error(
          "This request ID was already used with different external " +
            "client data. Submit a new request instead.",
        );
      }

      if (operation.status === "COMPLETED") {
        if (!operation.spreadsheetId) {
          throw new Error(
            "The completed operation has no spreadsheet ID. " +
              "Manual reconciliation is required.",
          );
        }

        const completedFile = DriveApp.getFileById(operation.spreadsheetId);

        return {
          success: true,
          spreadsheetId: operation.spreadsheetId,
          clientName: operation.clientName,
          projects: operation.projects,
          url: completedFile.getUrl(),
          alreadyCompleted: true,
        };
      }

      if (operation.status === "RECONCILIATION_REQUIRED") {
        throw new Error(
          operation.error ||
            "This external-sheet operation requires manual reconciliation.",
        );
      }

      /*
       * Existing PROCESSING operations resume below.
       */
      operation.status = "PROCESSING";
      operation.error = "";
    } else {
      /*
       * Apply rate limits only when creating a new operation.
       * A retry of an existing request should not consume another
       * creation slot just because the earlier attempt was interrupted.
       */
      enforceUserRateLimit("external_sheet_creation", sessionId, 3, 60);

      enforceGlobalRateLimit("external_sheet_creation", 5, 60);

      operation = {
        createdAt: new Date(),
        operationKey,
        requestId,
        status: "PROCESSING",
        clientName,
        requestHash,
        spreadsheetId: "",
        temporaryFileName,
        projects,
        stage: "STARTED",
        error: "",
      };

      rowNumber = writeExternalCreationOperation_(journal, null, operation);
    }

    updateExternalCreationOperation_(journal, rowNumber, operation, {
      status: "PROCESSING",
      error: "",
    });

    /*
     * ---------------------------------------------------------
     * 1. Recover or create the external spreadsheet.
     * ---------------------------------------------------------
     */
    const destinationFolder = getExternalSheetsFolder();

    let newFile = null;

    if (operation.spreadsheetId) {
      try {
        newFile = DriveApp.getFileById(operation.spreadsheetId);

        if (newFile.isTrashed()) {
          throw new Error("The recorded spreadsheet is trashed.");
        }

        if (!String(newFile.getDescription() || "").includes(marker)) {
          throw new Error(
            "The recorded spreadsheet does not contain the expected " +
              "request marker. Manual reconciliation is required.",
          );
        }
      } catch (error) {
        operation.status = "RECONCILIATION_REQUIRED";
        operation.error =
          "The journal references a spreadsheet that cannot be " +
          "verified. No replacement was created. " +
          (error.message || String(error));

        writeExternalCreationOperation_(journal, rowNumber, operation);

        throw new Error(operation.error);
      }
    } else {
      const matches = findExternalCreationFiles_(
        destinationFolder,
        marker,
        temporaryFileName,
      );

      if (matches.length > 1) {
        operation.status = "RECONCILIATION_REQUIRED";
        operation.error =
          "Multiple Drive files match this external creation request.";

        writeExternalCreationOperation_(journal, rowNumber, operation);

        throw new Error(operation.error);
      }

      if (matches.length === 1) {
        newFile = matches[0];
      } else {
        updateExternalCreationOperation_(journal, rowNumber, operation, {
          stage: "COPYING_TEMPLATE",
        });

        const templateFile = DriveApp.getFileById(getExternalSheetTemplateId());

        newFile = templateFile.makeCopy(temporaryFileName, destinationFolder);
      }

      /*
       * Persist a marker so later retries can find the same file
       * even if execution stopped before the ID reached the journal.
       */
      const currentDescription = String(newFile.getDescription() || "");

      if (!currentDescription.includes(marker)) {
        newFile.setDescription(
          [currentDescription, marker].filter(Boolean).join("\n"),
        );
      }

      operation.spreadsheetId = newFile.getId();

      updateExternalCreationOperation_(journal, rowNumber, operation, {
        stage: "TEMPLATE_COPIED",
      });
    }

    /*
     * ---------------------------------------------------------
     * 2. Apply and verify Drive sharing.
     * ---------------------------------------------------------
     *
     * Do not trash the spreadsheet if this fails. A retry can
     * resume configuration on the same resource.
     */
    newFile.setSharing(DriveApp.Access.ANYONE, DriveApp.Permission.EDIT);

    updateExternalCreationOperation_(journal, rowNumber, operation, {
      stage: "SHARING_CONFIGURED",
    });

    /*
     * ---------------------------------------------------------
     * 3. Validate and configure the template.
     * ---------------------------------------------------------
     */
    const spreadsheet = SpreadsheetApp.openById(operation.spreadsheetId);

    const projectsSheet = spreadsheet.getSheetByName("Projects");
    const blankSheet = spreadsheet.getSheetByName("BLANK");

    if (!projectsSheet) {
      throw new Error('External template is missing the "Projects" sheet.');
    }

    if (!blankSheet) {
      throw new Error('External template is missing the "BLANK" sheet.');
    }

    projectsSheet.getRange("E1").setValue(clientName);
    blankSheet.getRange("E1").setValue(clientName);

    updateExternalCreationOperation_(journal, rowNumber, operation, {
      stage: "TEMPLATE_CONFIGURED",
    });

    /*
     * ---------------------------------------------------------
     * 4. Create or recover project sheets.
     * ---------------------------------------------------------
     */
    createExternalProjectSheets(spreadsheet, blankSheet, projects, clientName);

    updateExternalCreationOperation_(journal, rowNumber, operation, {
      stage: "PROJECTS_CREATED",
    });

    /*
     * ---------------------------------------------------------
     * 5. Assign the final file name.
     * ---------------------------------------------------------
     */
    const finalFileName = `${clientName} Projects - External`;

    if (newFile.getName() !== finalFileName) {
      newFile.setName(finalFileName);
    }

    /*
     * ---------------------------------------------------------
     * 6. Register the external spreadsheet.
     * ---------------------------------------------------------
     */
    registerExternalSheet({
      spreadsheetId: operation.spreadsheetId,
      clientName,
      spreadsheetName: finalFileName,
    });

    updateExternalCreationOperation_(journal, rowNumber, operation, {
      stage: "REGISTRY_UPDATED",
    });

    /*
     * ---------------------------------------------------------
     * 7. Create or reconcile the main client tab.
     * ---------------------------------------------------------
     */
    const clientSheetResult = createExternalClientSheet(
      clientName,
      operation.spreadsheetId,
    );

    updateExternalCreationOperation_(journal, rowNumber, operation, {
      stage: "CLIENT_SHEET_CREATED",
    });

    /*
     * ---------------------------------------------------------
     * 8. Mark completion only after all required steps succeed.
     * ---------------------------------------------------------
     */
    updateExternalCreationOperation_(journal, rowNumber, operation, {
      status: "COMPLETED",
      stage: "COMPLETED",
      error: "",
    });

    return {
      success: true,
      spreadsheetId: operation.spreadsheetId,
      clientName,
      projects,
      url: newFile.getUrl(),
      mainClientSheetName: clientSheetResult.sheetName,
      alreadyCompleted: false,
    };
  } catch (error) {
    /*
     * Preserve the journal's last successful stage so the same
     * request can resume after a transient failure.
     */
    try {
      const journal = getExternalCreationJournal_();

      const entry = findExternalCreationOperation_(journal, operationKey);

      if (
        entry &&
        String(entry.values[3]) !== "COMPLETED" &&
        String(entry.values[3]) !== "RECONCILIATION_REQUIRED"
      ) {
        journal.getRange(entry.rowNumber, 4).setValue("PROCESSING");
        journal.getRange(entry.rowNumber, 11).setValue(new Date());
        journal
          .getRange(entry.rowNumber, 12)
          .setValue(String(error.message || error).slice(0, 2000));
      }
    } catch (journalError) {
      console.error(
        "[ExternalSheetCreation] Failed to update journal:",
        journalError,
      );
    }

    throw error;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Duplicate BLANK for each project.
 */
function createExternalProjectSheets(
  spreadsheet,
  blankSheet,
  projects,
  clientName,
) {
  projects.forEach((projectName) => {
    let projectSheet = spreadsheet.getSheetByName(projectName);

    if (projectSheet) {
      /*
       * A project tab created by an earlier attempt may already
       * exist. Resume configuring it if its client marker is
       * blank or already matches this client.
       */
      const existingClientName = String(
        projectSheet.getRange("E1").getDisplayValue() || "",
      ).trim();

      if (
        existingClientName &&
        normalizeText(existingClientName) !== normalizeText(clientName)
      ) {
        throw new Error(
          `Project sheet "${projectName}" already exists with a ` +
            "different client name. Manual reconciliation is required.",
        );
      }
    } else {
      /*
       * Insert directly from the template under the intended name,
       * avoiding the intermediate "Copy of BLANK" sheet name.
       */
      projectSheet = spreadsheet.insertSheet(projectName, {
        template: blankSheet,
      });
    }

    projectSheet.getRange("E1").setValue(clientName);
    projectSheet.showSheet();
  });

  blankSheet.hideSheet();
}

/**
 * Normalize comma-separated projects.
 */
function normalizeProjectNames(projects) {
  if (Array.isArray(projects)) {
    projects = projects.join(",");
  }

  if (typeof projects !== "string") {
    return [];
  }

  return [
    ...new Set(
      projects
        .split(",")
        .map((project) => project.trim())
        .filter(Boolean)
        .map(Validation.sanitizeSheetName)
        .filter(Boolean)
        .map((project) => Validation.sheetName(project, "Project name")),
    ),
  ];
}

/**
 * Register the external spreadsheet
 * in the main spreadsheet.
 */
function registerExternalSheet({ spreadsheetId, clientName, spreadsheetName }) {
  if (!spreadsheetId || !clientName || !spreadsheetName) {
    throw new Error(
      "Spreadsheet ID, client name, and spreadsheet name are required.",
    );
  }

  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName("External Sheets");

  if (!sheet) {
    sheet = ss.insertSheet("External Sheets");

    sheet
      .getRange(1, 1, 1, 5)
      .setValues([
        [
          "Spreadsheet ID",
          "Client Name",
          "Spreadsheet Name",
          "Status",
          "Verified",
        ],
      ]);
  }

  const lastRow = sheet.getLastRow();

  if (lastRow >= 2) {
    const ids = sheet
      .getRange(2, 1, lastRow - 1, 1)
      .getDisplayValues()
      .flat()
      .map((value) => value.trim());

    const matchingRows = [];

    ids.forEach((id, index) => {
      if (id === String(spreadsheetId)) {
        matchingRows.push(index + 2);
      }
    });

    if (matchingRows.length > 1) {
      throw new Error(
        "Multiple registry rows already reference this external " +
          "spreadsheet. Manual reconciliation is required.",
      );
    }

    if (matchingRows.length === 1) {
      const row = matchingRows[0];

      sheet
        .getRange(row, 1, 1, 5)
        .setValues([
          [spreadsheetId, clientName, spreadsheetName, "Active", new Date()],
        ]);

      return {
        created: false,
        row,
      };
    }
  }

  const row = Math.max(sheet.getLastRow() + 1, 2);

  sheet
    .getRange(row, 1, 1, 5)
    .setValues([
      [spreadsheetId, clientName, spreadsheetName, "Active", new Date()],
    ]);

  return {
    created: true,
    row,
  };
}

function ensureExternalClientOnMainSheet(clientName, externalSpreadsheetId) {
  const ss = getSpreadsheet();
  const clientNamesSheet = getSheetSafe("Client Names");

  if (!clientNamesSheet) {
    throw new Error('Sheet "Client Names" not found.');
  }

  const normalizedClientName = normalizeText(clientName);

  /*
   * Check Client Names!A2:A.
   */
  const lastRow = clientNamesSheet.getLastRow();

  let clientInList = false;

  if (lastRow >= 2) {
    const values = clientNamesSheet
      .getRange(2, 1, lastRow - 1, 1)
      .getValues()
      .flat();

    clientInList = values.some(
      (value) => normalizeText(value) === normalizedClientName,
    );
  }

  /*
   * Check the actual main client sheet.
   */
  const existingSheet = ss
    .getSheets()
    .find((sheet) => normalizeText(sheet.getName()) === normalizedClientName);

  /*
   * Both already exist.
   */
  if (clientInList && existingSheet) {
    return {
      created: false,
      clientName,
      clientInList: true,
      clientSheetExists: true,
      reason: "already-exists",
    };
  }

  /*
   * Client is in Client Names but its actual
   * client sheet is missing.
   */
  if (clientInList && !existingSheet) {
    const result = createExternalClientSheet(clientName, externalSpreadsheetId);

    return {
      created: true,
      clientName,
      clientInList: true,
      clientSheetExists: false,
      reason: "client-sheet-created",
      ...result,
    };
  }

  /*
   * Client sheet exists but Client Names entry
   * is missing.
   *
   * IMPORTANT:
   * Do NOT create another sheet.
   */
  if (!clientInList && existingSheet) {
    return {
      created: false,
      clientName,
      clientInList: false,
      clientSheetExists: true,
      reason: "client-list-entry-missing",
    };
  }

  /*
   * Neither exists.
   */
  const result = createExternalClientSheet(clientName, externalSpreadsheetId);

  return {
    created: true,
    clientName,
    clientInList: false,
    clientSheetExists: false,
    reason: "client-created",
    ...result,
  };
}

function reconcileExternalSheets(sessionId, signature) {
  requireCapability(sessionId, signature, "clients.manage");

  const registry = getSheetSafe("External Sheets");
  const clientNamesSheet = getSheetSafe("Client Names");

  if (!registry) {
    throw new Error('Sheet "External Sheets" not found.');
  }

  if (!clientNamesSheet) {
    throw new Error('Sheet "Client Names" not found.');
  }

  const folder = getExternalSheetsFolder();

  if (!folder) {
    throw new Error("External Sheets folder not found.");
  }

  const files = folder.getFilesByType(MimeType.GOOGLE_SHEETS);

  const rows = [];
  const results = [];

  const clientNamesLastRow = clientNamesSheet.getLastRow();

  const existingClientNames =
    clientNamesLastRow >= 2
      ? clientNamesSheet
          .getRange(2, 1, clientNamesLastRow - 1, 1)
          .getValues()
          .flat()
          .filter((value) => String(value ?? "").trim() !== "")
      : [];

  const clientNameSet = new Set(
    existingClientNames.map((value) => normalizeText(value)),
  );

  const clientNamesToAdd = [];

  let fileCount = 0;
  let matchingFileCount = 0;
  let validExternalCount = 0;

  /*
   * ---------------------------------------------------------
   * Scan external folder.
   * ---------------------------------------------------------
   */
  while (files.hasNext()) {
    const file = files.next();

    fileCount++;

    const spreadsheetId = file.getId();
    const spreadsheetName = file.getName();

    /*
     * -------------------------------------------------------
     * Check filename.
     * -------------------------------------------------------
     */
    if (!spreadsheetName.endsWith(" Projects - External")) {
      continue;
    }

    matchingFileCount++;

    const clientName = spreadsheetName
      .replace(/ Projects - External$/, "")
      .trim();

    if (!clientName) {
      continue;
    }

    try {
      const ss = SpreadsheetApp.openById(spreadsheetId);

      const projectsSheet = ss.getSheetByName("Projects");

      if (!projectsSheet) {
        continue;
      }

      const totalHours = Number(projectsSheet.getRange("B8").getValue()) || 0;

      const activity = Number(projectsSheet.getRange("B20").getValue()) || 0;

      const status = activity > 0 ? "Active" : "Inactive";

      const mainSheetResult = ensureExternalClientOnMainSheet(
        clientName,
        spreadsheetId,
      );

      /*
       * -------------------------------------------------------
       * Make sure Client Names!A contains client.
       * -------------------------------------------------------
       */
      const normalizedClientName = normalizeText(clientName);

      let clientNameAdded = false;

      if (!clientNameSet.has(normalizedClientName)) {
        clientNamesToAdd.push([clientName]);

        clientNameSet.add(normalizedClientName);

        clientNameAdded = true;
      } else {
        logResponse(`[${clientName}] Client Names entry already exists.`);
      }

      rows.push([
        spreadsheetId,
        clientName,
        spreadsheetName,
        status,
        new Date(),
      ]);

      validExternalCount++;

      results.push({
        spreadsheetId,
        clientName,
        totalHours,
        status,

        mainSheetCreated: mainSheetResult.created,
        mainSheetAction: mainSheetResult.reason,

        clientNameAdded,

        action: "registered",
      });
    } catch (err) {
      console.error(`Failed to read external sheet "${spreadsheetName}".`, err);
    }
  }

  if (clientNamesToAdd.length) {
    const startRow = Math.max(clientNamesSheet.getLastRow() + 1, 2);

    clientNamesSheet
      .getRange(startRow, 1, clientNamesToAdd.length, 1)
      .setValues(clientNamesToAdd);

    logResponse("Client Names entries added successfully.");
  } else {
    logResponse("No missing Client Names entries to add.");
  }

  /*
   * ---------------------------------------------------------
   * SAFETY CHECK
   * ---------------------------------------------------------
   *
   * Never clear the registry if the scan found zero
   * valid external spreadsheets.
   */
  if (!rows.length) {
    return results;
  }

  /*
   * ---------------------------------------------------------
   * Refresh External Sheets registry.
   * ---------------------------------------------------------
   */
  const lastRow = registry.getLastRow();
  const lastColumn = registry.getLastColumn();

  if (lastRow >= 2) {
    registry.getRange(2, 1, lastRow - 1, lastColumn).clearContent();
  }

  registry.getRange(2, 1, rows.length, rows[0].length).setValues(rows);

  return results;
}

function createExternalClientSheet(clientName, externalSpreadsheetId) {
  if (!clientName || !externalSpreadsheetId) {
    throw new Error("Client name and external spreadsheet ID are required.");
  }

  const ss = getSpreadsheet();
  const blankSheet = ss.getSheetByName("BLANK");

  if (!blankSheet) {
    throw new Error('Main spreadsheet "BLANK" template was not found.');
  }

  const normalizedClientName = normalizeText(clientName);

  let clientSheet = ss
    .getSheets()
    .find((sheet) => normalizeText(sheet.getName()) === normalizedClientName);

  const externalUrl = `https://docs.google.com/spreadsheets/d/${externalSpreadsheetId}/edit`;

  const linkText = `${clientName} - Go to actual sheet`;

  if (clientSheet) {
    /*
     * An existing tab may be the result of an interrupted attempt.
     * Reuse it only when its existing external link matches this
     * operation, or when its E1 cell is still blank.
     */
    const e1 = clientSheet.getRange("E1");
    const richText = e1.getRichTextValue();
    const existingUrl = richText ? richText.getLinkUrl() : null;

    const existingText = String(e1.getDisplayValue() || "").trim();

    if (
      existingUrl &&
      existingUrl.includes(`/spreadsheets/d/${externalSpreadsheetId}`)
    ) {
      // This tab already points to the correct external spreadsheet.
    } else if (!existingText && !existingUrl) {
      // An earlier attempt created the tab but did not configure E1.
    } else {
      throw new Error(
        `A main client tab named "${clientSheet.getName()}" already ` +
          "exists but is not linked to this external spreadsheet. " +
          "No duplicate tab was created; manual reconciliation is required.",
      );
    }
  } else {
    /*
     * Create directly from BLANK with the final name.
     * Do not silently append a numeric suffix to an existing client.
     */
    clientSheet = ss.insertSheet(clientName, {
      template: blankSheet,
    });
  }

  /*
   * Idempotently configure the client link and imported data.
   */
  const richText = SpreadsheetApp.newRichTextValue()
    .setText(linkText)
    .setLinkUrl(externalUrl)
    .build();

  clientSheet.getRange("E1").setRichTextValue(richText);

  clientSheet
    .getRange("E3")
    .setFormula(`=IMPORTRANGE("${externalSpreadsheetId}","Projects!E3:I")`);

  clientSheet.showSheet();

  return {
    sheetName: clientSheet.getName(),
    externalSpreadsheetId,
    externalUrl,
  };
}

function isExternalClient(sessionId, signature, clientName) {
  requireCapability(sessionId, signature, "hours.add");
  
  if (!clientName) {
    return false;
  }

  const registrySheet = getSheetSafe("External Sheets");

  if (!registrySheet || registrySheet.getLastRow() < 2) {
    return false;
  }

  const values = registrySheet
    .getRange(2, 1, registrySheet.getLastRow() - 1, 5)
    .getValues();

  const normalizedClient = normalizeText(clientName);

  return values.some(
    (row) =>
      normalizeText(String(row[1] || "")) === normalizedClient &&
      String(row[0] || "").trim() !== "",
  );
}

function combineExternalSheetData(spreadsheetId) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const dest = ss.getSheetByName("Projects");

  if (!dest) {
    throw new Error('External spreadsheet is missing the "Projects" sheet.');
  }

  dest.getRange("E3:I").clearContent();

  let destRow = 3;
  
  ss.getSheets().forEach((sheet) => {
    const sheetName = sheet.getName();
    
    if (
      sheetName === "Projects" ||
      sheetName === "BLANK" ||
      sheetName === GCB_HOURS_REQUEST_LEDGER_CONFIG.sheetName
    ) {
      return;
    }

    const lastRow = sheet.getLastRow();

    if (lastRow < 3) {
      return;
    }

    const values = sheet
      .getRange(`E3:I${lastRow}`)
      .getValues()
      .filter((row) => row.some((value) => value !== ""));

    if (!values.length) {
      return;
    }

    dest
      .getRange(destRow, 5, values.length, values[0].length)
      .setValues(values);

    destRow += values.length;
  });

  return {
    success: true,
    spreadsheetId,
    rows: destRow - 3,
  };
}