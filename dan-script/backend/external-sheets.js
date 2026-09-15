const EXTERNAL_SHEETS_CONFIG = {
  registrySheet: "External Sheets",

  templateProperty: "EXTERNAL_SHEET_TEMPLATE_ID",

  folderProperty: "MAIN_SHEETS_FOLDER_ID",

  headers: ["Spreadsheet ID", "Client Name", "Verified", "Status"],
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
function getExternalSheets() {
  // requireAuthorizedUser();

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

/**
 * Create a new external spreadsheet from the template.
 */
function createExternalSheet(data) {
  //   requireAuthorizedUser();

  if (!data || typeof data !== "object") {
    throw new Error("Invalid external sheet data.");
  }

  const clientName = String(data.clientName || "").trim();

  if (!clientName) {
    throw new Error("Client name is required.");
  }

  if (clientName.length > 100) {
    throw new Error("Client name is too long.");
  }

  const projects = normalizeProjectNames(data.projects);

  if (!projects.length) {
    throw new Error("At least one project is required.");
  }

  const templateId = getExternalSheetTemplateId();

  const templateFile = DriveApp.getFileById(templateId);

  const destinationFolder = getExternalSheetsFolder();

  /*
   * Duplicate the external spreadsheet
   * into the designated folder.
   */
  const newFile = templateFile.makeCopy(
    `${clientName} Projects - External`,
    destinationFolder,
  );

  /*
   * Set:
   * Anyone with the link → Editor
   */
  try {
    newFile.setSharing(DriveApp.Access.ANYONE, DriveApp.Permission.EDIT);
  } catch (err) {
    /*
     * The spreadsheet was created, but
     * public editor sharing failed.
     */
    newFile.setTrashed(true);

    throw new Error(
      "External spreadsheet was created, but " +
        "Google Drive did not allow Anyone → Editor sharing.",
    );
  }

  const externalSpreadsheetId = newFile.getId();

  const spreadsheet = SpreadsheetApp.openById(externalSpreadsheetId);

  const projectsSheet = spreadsheet.getSheetByName("Projects");

  const blankSheet = spreadsheet.getSheetByName("BLANK");

  if (!projectsSheet) {
    newFile.setTrashed(true);

    throw new Error('Template is missing the "Projects" sheet.');
  }

  if (!blankSheet) {
    newFile.setTrashed(true);

    throw new Error('Template is missing the "BLANK" sheet.');
  }

  /*
   * Client name.
   */
  projectsSheet.getRange("E1").setValue(clientName);

  blankSheet.getRange("E1").setValue(clientName);

  /*
   * Create project sheets.
   */
  createExternalProjectSheets(spreadsheet, blankSheet, projects);

  /*
   * Register in main spreadsheet.
   */
  registerExternalSheet({
    spreadsheetId: externalSpreadsheetId,
    clientName,
    spreadsheetName: newFile.getName(),
  });

  /*
   * Create client data on main spreadsheet.
   */
  createExternalClientSheet(clientName, externalSpreadsheetId);

  return {
    success: true,
    spreadsheetId: externalSpreadsheetId,
    clientName,
    projects,
    url: newFile.getUrl(),
  };
}

/**
 * Duplicate BLANK for each project.
 */
function createExternalProjectSheets(spreadsheet, blankSheet, projects) {
  projects.forEach((projectName) => {
    /*
     * Don't duplicate if it already exists.
     */
    if (spreadsheet.getSheetByName(projectName)) {
      return;
    }

    const newSheet = blankSheet.copyTo(spreadsheet);

    newSheet.setName(projectName);

    newSheet.showSheet();

    /*
     * Keep the client name on every
     * newly-created project sheet.
     */
    newSheet.getRange("E1").setValue(blankSheet.getRange("E1").getValue());
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
        .map(sanitizeSheetName)
        .filter(Boolean),
    ),
  ];
}

/**
 * Make project name safe for a Google Sheet tab.
 */
function sanitizeSheetName(name) {
  return String(name)
    .trim()
    .replace(/[\[\]\*\?\/\\:]/g, "-")
    .substring(0, 100)
    .trim();
}

/**
 * Register the external spreadsheet
 * in the main spreadsheet.
 */
function registerExternalSheet({ spreadsheetId, clientName, spreadsheetName }) {
  const ss = getSpreadsheet();

  let sheet = getSheetSafe("External Sheets");

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

  sheet.appendRow([
    spreadsheetId,
    clientName,
    spreadsheetName,
    "Active",
    new Date(),
  ]);
}

/**
 * Calculate summary information
 * from an external spreadsheet.
 */
function getExternalSheetSummary(spreadsheetId) {
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);

  const projectsSheet = spreadsheet.getSheetByName("Projects");

  if (!projectsSheet) {
    throw new Error('External spreadsheet is missing the "Projects" sheet.');
  }

  const totalHours = Number(projectsSheet.getRange("B8").getValue()) || 0;

  const projectCount = spreadsheet
    .getSheets()
    .filter(
      (sheet) => sheet.getName() !== "Projects" && sheet.getName() !== "BLANK",
    ).length;

  return {
    totalHours,
    projectCount,
    accessible: true,
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

function reconcileExternalSheets() {
  // requireAuthorizedUser();

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
  //   requireAuthorizedUser();

  if (!clientName || !externalSpreadsheetId) {
    throw new Error("Client name and external spreadsheet ID are required.");
  }

  const ss = getSpreadsheet();

  const blankSheet = getSheetSafe("BLANK");

  if (!blankSheet) {
    throw new Error('Main sheet "BLANK" template was not found.');
  }

  /*
   * Duplicate the hidden BLANK template.
   */
  const clientSheet = blankSheet.copyTo(ss);

  /*
   * Use the client name as the sheet name.
   */
  let sheetName = String(clientName).trim();

  /*
   * Prevent duplicate sheet names.
   */
  let baseName = sheetName;
  let counter = 2;

  while (getSheetSafe(sheetName)) {
    sheetName = `${baseName} ${counter}`;
    counter++;
  }

  clientSheet.setName(sheetName);

  /*
   * Show the newly created client sheet.
   */
  clientSheet.showSheet();

  /*
   * E1:
   * Client name + link to the actual external spreadsheet.
   */
  const externalUrl = `https://docs.google.com/spreadsheets/d/${externalSpreadsheetId}/edit`;

  const richText = SpreadsheetApp.newRichTextValue()
    .setText(`${clientName} - Go to actual sheet`)
    .setLinkUrl(externalUrl)
    .build();

  clientSheet.getRange("E1").setRichTextValue(richText);

  /*
   * E3:
   * Import the external Projects data.
   */
  clientSheet
    .getRange("E3")
    .setFormula(`=IMPORTRANGE("${externalSpreadsheetId}","Projects!E3:I")`);

  return {
    sheetName,
    externalSpreadsheetId,
    externalUrl,
  };
}

function isExternalClient(clientName) {
  if (!clientName) {
    return false;
  }

  const ss = getSpreadsheet();

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
    if (sheet.getName() === "Projects") {
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