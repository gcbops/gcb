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

/**
 * Return all registered external spreadsheets.
 */
function getExternalSheets() {
  // requireAuthorizedUser();

  const ss = getActiveSpreadsheet();
  const sheet = ss.getSheetByName("External Sheets");

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
  const ss = getActiveSpreadsheet();

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

function reconcileExternalSheets() {
  //   requireAuthorizedUser();

  const registry = getActiveSpreadsheet().getSheetByName("External Sheets");

  if (!registry) {
    throw new Error('Sheet "External Sheets" not found.');
  }

  const folder = getExternalSheetsFolder();

  const files = folder.getFilesByType(MimeType.GOOGLE_SHEETS);

  const rows = [];
  const results = [];

  while (files.hasNext()) {
    const file = files.next();

    const spreadsheetId = file.getId();
    const spreadsheetName = file.getName();

    /*
     * Only process external sheets created
     * from the external template.
     */
    if (!spreadsheetName.endsWith(" Projects - External")) {
      continue;
    }

    const clientName = spreadsheetName
      .replace(/ Projects - External$/, "")
      .trim();

    if (!clientName) {
      continue;
    }

    try {
      const ss = SpreadsheetApp.openById(spreadsheetId);

      const projectsSheet = ss.getSheetByName("Projects");

      /*
       * Invalid external spreadsheet.
       */
      if (!projectsSheet) {
        console.warn(
          `Skipping "${spreadsheetName}": Projects sheet not found.`,
        );

        continue;
      }

      /*
       * Current total hours.
       */
      const totalHours = Number(projectsSheet.getRange("B8").getValue()) || 0;

      /*
       * Current activity/status.
       *
       * B2 > 0 = Active
       * B2 <= 0 = Inactive
       */
      const activity = Number(projectsSheet.getRange("B20").getValue()) || 0;

      const status = activity > 0 ? "Active" : "Inactive";

      rows.push([
        spreadsheetId,
        clientName,
        spreadsheetName,
        status,
        new Date(),
      ]);

      results.push({
        spreadsheetId,
        clientName,
        totalHours,
        status,
        action: "registered",
      });
    } catch (err) {
      console.error(`Failed to read external sheet "${spreadsheetName}".`, err);
    }
  }

  /*
   * Refresh the registry.
   *
   * Keep the header row.
   * Replace everything starting from row 2.
   */
  const lastRow = registry.getLastRow();

  if (lastRow >= 2) {
    registry
      .getRange(2, 1, lastRow - 1, registry.getLastColumn())
      .clearContent();
  }

  /*
   * Write the current external sheets.
   */
  if (rows.length) {
    registry.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }

  return results;
}

function createExternalClientSheet(clientName, externalSpreadsheetId) {
  //   requireAuthorizedUser();

  if (!clientName || !externalSpreadsheetId) {
    throw new Error("Client name and external spreadsheet ID are required.");
  }

  const ss = getActiveSpreadsheet();

  const blankSheet = ss.getSheetByName("BLANK");

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

  while (ss.getSheetByName(sheetName)) {
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

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const registrySheet = ss.getSheetByName("External Sheets");

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