const EXTERNAL_SHEETS_CONFIG = {
  registrySheet: "External Sheets",
  templateProperty: "EXTERNAL_SHEET_TEMPLATE_ID",

  headers: [
    "Spreadsheet ID",
    "Client Name",
    "Spreadsheet Name",
    "Status",
    "Verified",
  ],
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

function getExternalSheetsFolder(workspace) {
  if (!workspace || !workspace.managerId) {
    throw new Error("A valid manager workspace is required.");
  }

  const folderId = String(workspace.externalSheetsFolderId || "").trim();

  if (!folderId) {
    throw new Error(
      `External Sheets Folder ID is not configured for manager "${workspace.managerId}".`,
    );
  }

  try {
    const folder = DriveApp.getFolderById(folderId);

    // Verify the folder is accessible and not trashed.
    if (folder.isTrashed()) {
      throw new Error("The configured folder is in the trash.");
    }

    return folder;
  } catch (error) {
    console.error(
      `[External Sheets] Folder access failed for manager ${workspace.managerId}.`,
      error,
    );

    throw new Error(
      `The External Sheets folder for manager "${workspace.managerId}" ` +
        "could not be accessed. Verify the folder ID and Shared Drive permissions.",
    );
  }
}

function getExternalClientMap(spreadsheet) {
  if (!spreadsheet || typeof spreadsheet.getSheetByName !== "function") {
    throw new Error("The target operational spreadsheet is required.");
  }

  const sheet = spreadsheet.getSheetByName(
    EXTERNAL_SHEETS_CONFIG.registrySheet,
  );

  if (!sheet) {
    return new Map();
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return new Map();
  }

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
}

function getExternalSheets(sessionId, signature) {
  const session = requireCapability(sessionId, signature, "clients.view");

  const workspace = getManagerWorkspaceForSession_(session);

  if (!workspace || !workspace.spreadsheet) {
    throw new Error(
      "No operational spreadsheet is assigned to the authenticated manager.",
    );
  }

  if (!String(workspace.externalSheetsFolderId || "").trim()) {
    return [];
  }

  return getExternalSheetsInternal(workspace.spreadsheet);
}

function getExternalSheetsInternal(managerSpreadsheet) {
  if (
    !managerSpreadsheet ||
    typeof managerSpreadsheet.getSheetByName !== "function"
  ) {
    throw new Error("The manager operational spreadsheet is required.");
  }

  const spreadsheet = managerSpreadsheet;

  const sheet = spreadsheet.getSheetByName(
    EXTERNAL_SHEETS_CONFIG.registrySheet,
  );

  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();

  return values
    .filter((row) => row[0] && row[1])
    .map((row) => {
      const spreadsheetId = String(row[0]).trim();
      const clientName = String(row[1]);
      const spreadsheetName = String(row[2] || "");

      let totalHours = 0;
      let projectCount = 0;
      let statusValue = 0;
      let status = "Inactive";
      let accessible = false;

      try {
        const externalSS = openSpreadsheetById(spreadsheetId);
        const projectsSheet = externalSS.getSheetByName("Projects");

        if (projectsSheet) {
          totalHours = Number(projectsSheet.getRange("B8").getValue()) || 0;

          statusValue = Number(projectsSheet.getRange("B20").getValue()) || 0;

          status = statusValue > 0 ? "Active" : "Inactive";
        }

        projectCount = externalSS
          .getSheets()
          .filter(
            (externalSheet) =>
              externalSheet.getName() !== "Projects" &&
              externalSheet.getName() !== "BLANK" &&
              externalSheet.getName() !==
                GCB_HOURS_REQUEST_LEDGER_CONFIG.sheetName &&
              externalSheet.getName() !==
                GCB_TODAY_HOURS_OPERATION_LEDGER.sheetName,
          ).length;

        accessible = true;
      } catch (err) {
        console.warn(
          `Unable to access registered external spreadsheet ${spreadsheetId}:`,
          err,
        );
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

function getExternalProjectSheets_(externalSS) {
  const excludedSheetNames = new Set([
    "Projects",
    "BLANK",
    GCB_HOURS_REQUEST_LEDGER_CONFIG.sheetName,
    GCB_TODAY_HOURS_OPERATION_LEDGER.sheetName,
  ]);

  return externalSS
    .getSheets()
    .filter((sheet) => !excludedSheetNames.has(sheet.getName()));
}

function getExternalCreationJournal_(spreadsheet) {
  if (!spreadsheet || typeof spreadsheet.getSheetByName !== "function") {
    throw new Error(
      "The manager operational spreadsheet is required for the creation journal.",
    );
  }

  const config = EXTERNAL_CREATION_JOURNAL_CONFIG;

  let sheet = spreadsheet.getSheetByName(config.sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(config.sheetName);

    sheet.getRange(1, 1, 1, config.headers.length).setValues([config.headers]);

    sheet.setFrozenRows(1);
    return sheet;
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, config.headers.length).setValues([config.headers]);

    sheet.setFrozenRows(1);
    return sheet;
  }

  const actualHeaders = sheet
    .getRange(1, 1, 1, config.headers.length)
    .getDisplayValues()[0];

  const schemaMatches = config.headers.every(
    (header, index) => actualHeaders[index] === header,
  );

  if (!schemaMatches) {
    throw new Error(
      `Invalid schema in "${config.sheetName}". ` +
        "The existing creation journal was not modified.",
    );
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

function createExternalSheet(sessionId, signature, data, requestId) {
  requireRole(sessionId, signature, "manager");

  const session = requireCapability(sessionId, signature, "clients.create");
  const workspace = getManagerWorkspaceForSession_(session);

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

  const normalizedRequestId = requestId.trim();

  const operationKey = `${workspace.managerId}:${normalizedRequestId}`;

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
    const journal = getExternalCreationJournal_(workspace.spreadsheet);

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
    const destinationFolder = getExternalSheetsFolder(workspace);

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

    updateExternalCreationOperation_(journal, rowNumber, operation, {
      stage: "SHARING_CONFIGURED",
    });

    /*
     * ---------------------------------------------------------
     * 3. Validate and configure the template.
     * ---------------------------------------------------------
     */
    const spreadsheet = openSpreadsheetById(operation.spreadsheetId);

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
      spreadsheet: workspace.spreadsheet,
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
      workspace.spreadsheet,
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
      const journal = getExternalCreationJournal_(workspace.spreadsheet);

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

function normalizeProjectNames(projects) {
  if (Array.isArray(projects)) {
    projects = projects.join(",");
  }

  if (typeof projects !== "string") {
    return [];
  }

  const projectsByNormalizedName = new Map();

  projects
    .split(",")
    .map((project) => project.trim())
    .filter(Boolean)
    .map(Validation.sanitizeSheetName)
    .filter(Boolean)
    .map((project) => Validation.sheetName(project, "Project name"))
    .forEach((project) => {
      const key = normalizeText(project);

      if (!projectsByNormalizedName.has(key)) {
        projectsByNormalizedName.set(key, project);
      }
    });

  return [...projectsByNormalizedName.values()];
}

function registerExternalSheet({
  spreadsheet,
  spreadsheetId,
  clientName,
  spreadsheetName,
}) {
  if (!spreadsheet || typeof spreadsheet.getSheetByName !== "function") {
    throw new Error("The manager operational spreadsheet is required.");
  }

  if (!spreadsheetId || !clientName || !spreadsheetName) {
    throw new Error(
      "Spreadsheet ID, client name, and spreadsheet name are required.",
    );
  }

  let sheet = spreadsheet.getSheetByName(EXTERNAL_SHEETS_CONFIG.registrySheet);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(EXTERNAL_SHEETS_CONFIG.registrySheet);

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

    sheet.setFrozenRows(1);
  }

  const normalizedClient = normalizeText(clientName);
  const targetId = String(spreadsheetId).trim();

  const lastRow = sheet.getLastRow();

  // Keep these variables available throughout the function.
  const matchingIdRows = [];
  const matchingClientRows = [];

  if (lastRow >= 2) {
    const rows = sheet.getRange(2, 1, lastRow - 1, 2).getDisplayValues();

    rows.forEach((row, index) => {
      const existingId = String(row[0] || "").trim();
      const existingClient = normalizeText(String(row[1] || ""));

      if (existingId === targetId) {
        matchingIdRows.push({
          rowNumber: index + 2,
          clientName: String(row[1] || "").trim(),
        });
      }

      if (existingClient === normalizedClient && existingId) {
        matchingClientRows.push({
          rowNumber: index + 2,
          spreadsheetId: existingId,
        });
      }
    });
  }

  // Reject duplicate or conflicting registry entries.
  if (matchingIdRows.length > 1 || matchingClientRows.length > 1) {
    throw new Error(
      "Conflicting external registry entries were found. " +
        "Manual reconciliation is required.",
    );
  }

  if (
    matchingIdRows.length === 1 &&
    normalizeText(matchingIdRows[0].clientName) !== normalizedClient
  ) {
    throw new Error(
      "This external spreadsheet is already registered to another client.",
    );
  }

  if (
    matchingClientRows.length === 1 &&
    matchingClientRows[0].spreadsheetId !== targetId
  ) {
    throw new Error(
      "This client is already registered to a different external spreadsheet.",
    );
  }

  // Update an existing registration instead of appending a duplicate.
  if (matchingIdRows.length === 1) {
    const row = matchingIdRows[0].rowNumber;

    sheet
      .getRange(row, 1, 1, 5)
      .setValues([
        [targetId, clientName, spreadsheetName, "Active", new Date()],
      ]);

    return { created: false, row };
  }

  // No matching registration: append a new entry.
  const row = Math.max(sheet.getLastRow() + 1, 2);

  sheet
    .getRange(row, 1, 1, 5)
    .setValues([[targetId, clientName, spreadsheetName, "Active", new Date()]]);

  return { created: true, row };
}

function ensureExternalClientOnMainSheet(
  clientName,
  externalSpreadsheetId,
  managerSpreadsheet,
) {
  if (
    !managerSpreadsheet ||
    typeof managerSpreadsheet.getSheetByName !== "function"
  ) {
    throw new Error("The manager operational spreadsheet is required.");
  }

  const ss = managerSpreadsheet;
  const clientNamesSheet = ss.getSheetByName("Client Names");

  if (!clientNamesSheet) {
    throw new Error('Sheet "Client Names" not found.');
  }

  const normalizedClientName = normalizeText(clientName);
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

  const existingSheet = ss
    .getSheets()
    .find((sheet) => normalizeText(sheet.getName()) === normalizedClientName);

  if (clientInList && existingSheet) {
    const result = createExternalClientSheet(
      clientName,
      externalSpreadsheetId,
      ss,
    );

    return {
      created: false,
      clientName,
      clientInList: true,
      clientSheetExists: true,
      reason: "verified-existing-client-sheet",
      ...result,
    };
  }

  if (clientInList && !existingSheet) {
    const result = createExternalClientSheet(
      clientName,
      externalSpreadsheetId,
      ss,
    );

    return {
      created: true,
      clientName,
      clientInList: true,
      clientSheetExists: false,
      reason: "client-sheet-created",
      ...result,
    };
  }

  if (!clientInList && existingSheet) {
    const result = createExternalClientSheet(
      clientName,
      externalSpreadsheetId,
      ss,
    );

    return {
      created: false,
      clientName,
      clientInList: false,
      clientSheetExists: true,
      reason: "client-list-entry-missing",
      ...result,
    };
  }

  const result = createExternalClientSheet(
    clientName,
    externalSpreadsheetId,
    ss,
  );

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
  const session = requireCapability(sessionId, signature, "clients.manage");

  const workspace = getManagerWorkspaceForSession_(session);
  const managerSpreadsheet = workspace.spreadsheet;

  const registry = managerSpreadsheet.getSheetByName("External Sheets");
  const clientNamesSheet = managerSpreadsheet.getSheetByName("Client Names");

  if (!registry) {
    throw new Error('Sheet "External Sheets" not found.');
  }

  if (!clientNamesSheet) {
    throw new Error('Sheet "Client Names" not found.');
  }

  const folder = getExternalSheetsFolder(workspace);

  /*
   * ---------------------------------------------------------
   * 1. Load existing registry entries.
   * Preserve existing rows unless a file is successfully
   * verified and its corresponding row can be refreshed.
   * ---------------------------------------------------------
   */
  const width = Math.max(registry.getLastColumn(), 5);
  const lastRow = registry.getLastRow();

  const existingRows =
    lastRow >= 2 ? registry.getRange(2, 1, lastRow - 1, width).getValues() : [];

  const registryRowsById = new Map();

  existingRows.forEach((row, index) => {
    const spreadsheetId = String(row[0] || "").trim();

    if (!spreadsheetId) return;

    if (registryRowsById.has(spreadsheetId)) {
      throw new Error(
        `Duplicate external spreadsheet ID "${spreadsheetId}" ` +
          `found in the registry at row ${index + 2}. ` +
          "Resolve the duplicate entries before reconciling.",
      );
    }

    registryRowsById.set(spreadsheetId, row.slice());
  });

  /*
   * ---------------------------------------------------------
   * 2. Load existing Client Names.
   * ---------------------------------------------------------
   */
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
  const results = [];

  /*
   * ---------------------------------------------------------
   * 3. Scan only this manager's External Sheets folder.
   * ---------------------------------------------------------
   */
  const files = folder.getFilesByType(MimeType.GOOGLE_SHEETS);

  let fileCount = 0;
  let matchingFileCount = 0;
  let validExternalCount = 0;

  while (files.hasNext()) {
    const file = files.next();

    fileCount++;

    const spreadsheetId = file.getId();
    const spreadsheetName = file.getName();

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
      const externalSpreadsheet = openSpreadsheetById(spreadsheetId);
      const projectsSheet = externalSpreadsheet.getSheetByName("Projects");

      if (!projectsSheet) {
        console.warn(
          `[External Sheets] Skipping "${spreadsheetName}": ` +
            'missing "Projects" sheet. Existing registry entry preserved.',
        );
        continue;
      }

      const totalHours = Number(projectsSheet.getRange("B8").getValue()) || 0;

      const activity = Number(projectsSheet.getRange("B20").getValue()) || 0;

      const status = activity > 0 ? "Active" : "Inactive";

      /*
       * Ensure the client tab exists in this manager's
       * operational spreadsheet, never the global spreadsheet.
       */
      const mainSheetResult = ensureExternalClientOnMainSheet(
        clientName,
        spreadsheetId,
        managerSpreadsheet,
      );

      /*
       * Add the client name only if it does not already exist.
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

      /*
       * Refresh the existing row for this ID, or append a new
       * entry. Any additional existing columns are preserved.
       */
      const existingRow = registryRowsById.get(spreadsheetId);

      const updatedRow = existingRow
        ? existingRow.slice()
        : Array(width).fill("");

      while (updatedRow.length < width) {
        updatedRow.push("");
      }

      updatedRow[0] = spreadsheetId;
      updatedRow[1] = clientName;
      updatedRow[2] = spreadsheetName;
      updatedRow[3] = status;
      updatedRow[4] = new Date();

      registryRowsById.set(spreadsheetId, updatedRow);

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
      /*
       * Do not remove the existing registry entry when a file
       * cannot be opened or reconciled.
       */
      console.error(
        `[External Sheets] Failed to reconcile "${spreadsheetName}". ` +
          "Existing registry entry, if any, is preserved.",
        err,
      );
    }
  }

  /*
   * ---------------------------------------------------------
   * 4. Add missing Client Names entries.
   * ---------------------------------------------------------
   */
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
   * 5. Safely refresh the registry.
   *
   * Existing entries not verified during this scan remain.
   * A zero-valid-file scan never clears the registry.
   * ---------------------------------------------------------
   */
  if (validExternalCount === 0) {
    console.warn(
      `[External Sheets] No valid files reconciled for ` +
        `${workspace.managerId}. Existing registry preserved. ` +
        `Files scanned: ${fileCount}; matching filenames: ${matchingFileCount}.`,
    );

    return results;
  }

  const mergedRows = Array.from(registryRowsById.values());

  if (lastRow >= 2) {
    registry.getRange(2, 1, lastRow - 1, width).clearContent();
  }

  if (mergedRows.length) {
    registry.getRange(2, 1, mergedRows.length, width).setValues(mergedRows);
  }

  logResponse(
    `[External Sheets] Reconciled ${validExternalCount} file(s) for ` +
      `${workspace.managerId}. Preserved ${mergedRows.length} registry entry/entries.`,
  );

  return results;
}

function createExternalClientSheet(
  clientName,
  externalSpreadsheetId,
  managerSpreadsheet,
) {
  if (!clientName || !externalSpreadsheetId) {
    throw new Error("Client name and external spreadsheet ID are required.");
  }

  if (
    !managerSpreadsheet ||
    typeof managerSpreadsheet.getSheetByName !== "function"
  ) {
    throw new Error("The manager operational spreadsheet is required.");
  }

  const ss = managerSpreadsheet;
  const blankSheet = ss.getSheetByName("BLANK");

  if (!blankSheet) {
    throw new Error('Manager spreadsheet "BLANK" template was not found.');
  }

  const normalizedClientName = normalizeText(clientName);

  let clientSheet = ss
    .getSheets()
    .find((sheet) => normalizeText(sheet.getName()) === normalizedClientName);

  const externalUrl = `https://docs.google.com/spreadsheets/d/${externalSpreadsheetId}/edit`;

  const linkText = `${clientName} - Go to actual sheet`;

  if (clientSheet) {
    const e1 = clientSheet.getRange("E1");
    const richText = e1.getRichTextValue();
    const existingUrl = richText ? richText.getLinkUrl() : null;
    const existingText = String(e1.getDisplayValue() || "").trim();

    const isCorrectLink =
      existingUrl &&
      existingUrl.includes(`/spreadsheets/d/${externalSpreadsheetId}`);

    const isExpectedUnlinkedText =
      !existingUrl &&
      (existingText === linkText ||
        existingText === `${clientName} - Go to actual sheet here`);

    const isBlankCell = !existingText && !existingUrl;

    if (isCorrectLink || isExpectedUnlinkedText || isBlankCell) {
      // Safe to repair or refresh the expected client link.
    } else {
      throw new Error(
        `A manager client tab named "${clientSheet.getName()}" contains ` +
          "conflicting content or a different external link. " +
          "Manual reconciliation is required.",
      );
    }
  } else {
    clientSheet = ss.insertSheet(clientName, {
      template: blankSheet,
    });
  }

  const richText = SpreadsheetApp.newRichTextValue()
    .setText(linkText)
    .setLinkUrl(externalUrl)
    .build();

  clientSheet.getRange("E1").setRichTextValue(richText);

  // Read Projects!E3:I directly through Apps Script.
  const syncResult = syncExternalClientSheetData_(
    clientSheet,
    externalSpreadsheetId,
  );

  clientSheet.showSheet();

  return {
    sheetName: clientSheet.getName(),
    externalSpreadsheetId,
    externalUrl,
    syncedRows: syncResult.rows,
  };
}

function refreshExistingExternalClientSnapshot_(
  clientName,
  externalSpreadsheetId,
  managerSpreadsheet,
) {
  const normalizedClient = normalizeText(String(clientName).trim());

  const clientSheet = managerSpreadsheet
    .getSheets()
    .find((sheet) => normalizeText(sheet.getName()) === normalizedClient);

  // If the internal tab doesn't exist yet, use the normal creation workflow.
  if (!clientSheet) {
    return createExternalClientSheet(
      clientName,
      externalSpreadsheetId,
      managerSpreadsheet,
    );
  }

  // Protect an existing tab linked to a different workbook.
  const e1 = clientSheet.getRange("E1");
  const richText = e1.getRichTextValue();
  const existingUrl = richText ? richText.getLinkUrl() : null;
  const existingText = String(e1.getDisplayValue() || "").trim();

  const expectedUrlPart = `/spreadsheets/d/${externalSpreadsheetId}`;
  const linkMatches = existingUrl && existingUrl.includes(expectedUrlPart);

  const expectedUnlinkedText =
    !existingUrl && existingText === `${clientName} - Go to actual sheet`;

  const blankCell = !existingText && !existingUrl;

  if (!linkMatches && !expectedUnlinkedText && !blankCell) {
    logResponse(
      `External snapshot refresh skipped for "${clientName}": ` +
        "the internal tab's E1 link needs manual reconciliation.",
    );

    return {
      success: true,
      synced: false,
      reason: "conflicting_internal_link",
      sheetName: clientSheet.getName(),
    };
  }

  // Refresh E3:I only. Do not modify E1 or recreate the tab.
  const syncResult = syncExternalClientSheetData_(
    clientSheet,
    externalSpreadsheetId,
  );

  return {
    ...syncResult,
    synced: true,
  };
}

function isExternalClient(sessionId, signature, clientName) {
  const session = requireCapability(sessionId, signature, "hours.add");

  if (!clientName) {
    return false;
  }

  const workspace = getManagerWorkspaceForSession_(session);

  if (!String(workspace.externalSheetsFolderId || "").trim()) {
    return false;
  }

  const registrySheet = workspace.spreadsheet.getSheetByName(
    EXTERNAL_SHEETS_CONFIG.registrySheet,
  );

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

function combineExternalSheetData_(spreadsheetId) {
  const id = String(spreadsheetId || "").trim();

  if (!id) {
    throw new Error("An external spreadsheet ID is required.");
  }

  const ss = openSpreadsheetById(id);
  const dest = ss.getSheetByName("Projects");

  if (!dest) {
    throw new Error('External spreadsheet is missing the "Projects" sheet.');
  }

  const destStartRow = 3;
  const destStartCol = 5; // E
  const numCols = 5; // E:I
  const rows = [];

  // Collect source data before modifying Projects.
  getExternalProjectSheets_(ss).forEach((sheet) => {
    const lastRow = sheet.getLastRow();

    if (lastRow < destStartRow) return;

    const values = sheet
      .getRange(destStartRow, destStartCol, lastRow - destStartRow + 1, numCols)
      .getValues()
      .filter((row) => row.some((value) => value !== "" && value !== null));

    rows.push(...values);
  });

  const requiredLastRow = destStartRow + rows.length - 1;
  const currentMaxRows = dest.getMaxRows();

  if (rows.length > 0 && requiredLastRow > currentMaxRows) {
    dest.insertRowsAfter(currentMaxRows, requiredLastRow - currentMaxRows);
  }

  // Clear the previous aggregate throughout E:I, including stale rows.
  const existingMaxRows = dest.getMaxRows();

  if (existingMaxRows >= destStartRow) {
    dest
      .getRange(
        destStartRow,
        destStartCol,
        existingMaxRows - destStartRow + 1,
        numCols,
      )
      .clearContent();
  }

  // Write the refreshed aggregate.
  if (rows.length > 0) {
    dest
      .getRange(destStartRow, destStartCol, rows.length, numCols)
      .setValues(rows);

    SpreadsheetApp.flush();
  }

  return {
    success: true,
    spreadsheetId: id,
    rows: rows.length,
  };
}

function syncExternalClientSheetData_(
  internalClientSheet,
  externalSpreadsheetId,
) {
  if (
    !internalClientSheet ||
    typeof internalClientSheet.getRange !== "function"
  ) {
    throw new Error("A valid internal client sheet is required.");
  }

  if (!externalSpreadsheetId) {
    throw new Error("External spreadsheet ID is required.");
  }

  const externalSS = openSpreadsheetById(externalSpreadsheetId);
  const projectsSheet = externalSS.getSheetByName("Projects");

  if (!projectsSheet) {
    throw new Error('External spreadsheet is missing the "Projects" sheet.');
  }

  // Ensure pending summary formulas have been calculated before reading.
  SpreadsheetApp.flush();

  const sourceLastRow = projectsSheet.getLastRow();
  const destinationLastRow = internalClientSheet.getLastRow();

  const sourceRowCount = Math.max(0, sourceLastRow - 2);
  const destinationRowCount = Math.max(0, destinationLastRow - 2);

  let values = [];

  if (sourceRowCount > 0) {
    // Same source range as the former IMPORTRANGE formula.
    values = projectsSheet.getRange(3, 5, sourceRowCount, 5).getValues();
  }

  // Clear stale imported values if the source has fewer rows now.
  // Only E:I from row 3 downward is affected.
  const rowsToClear = Math.max(sourceRowCount, destinationRowCount);

  if (rowsToClear > 0) {
    internalClientSheet.getRange(3, 5, rowsToClear, 5).clearContent();
  }

  if (values.length > 0) {
    internalClientSheet.getRange(3, 5, values.length, 5).setValues(values);
  }

  return {
    success: true,
    rows: values.length,
    spreadsheetId: externalSpreadsheetId,
    sheetName: internalClientSheet.getName(),
  };
}
