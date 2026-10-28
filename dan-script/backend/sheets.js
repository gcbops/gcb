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
    "Discord Webhook URL",
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
    String(enabledValue || "")
      .trim()
      .toLowerCase() === "true";

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

  const discordWebhookUrl = String(
    row[indexes["Discord Webhook URL"]] || "",
  ).trim();

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

function openSpreadsheetById(spreadsheetId) {
  if (!spreadsheetId) {
    throw new Error("Spreadsheet ID is required.");
  }

  return SpreadsheetApp.openById(spreadsheetId);
}

function getMainSpreadsheet() {
  const ssId =
    PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");

  if (ssId) {
    return openSpreadsheetById(ssId);
  }

  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet(name) {
  return getMainSpreadsheet().getSheetByName(name);
}

function getSheetSafe(name) {
  return getSheet(name) || null;
}

function sheetExists(sessionId, signature, name) {
  const session = requireCapability(sessionId, signature, "clients.view");

  if (!name || !String(name).trim()) {
    return false;
  }

  try {
    const workspace = getManagerWorkspaceForSession_(session);
    const managerSS = workspace.spreadsheet;
    const normalizedName = normalizeText(String(name).trim());

    return managerSS
      .getSheets()
      .some((sheet) => normalizeText(sheet.getName()) === normalizedName);
  } catch (err) {
    logResponse(`sheetExists error: ${err?.message || String(err)}`);
    return false;
  }
}

function getFirstEmptyRow(sheet, col = 1, startRow = 1) {
  const lastRow = sheet.getLastRow();

  if (lastRow < startRow) {
    return startRow;
  }

  const values = sheet
    .getRange(startRow, col, lastRow - startRow + 1, 1)
    .getValues();

  const index = values.findIndex((row) => !row[0]);

  return index >= 0 ? index + startRow : lastRow + 1;
}

function applyFormulaToMainSheets(sessionId, signature, cellRef, formula) {
  requireRole(sessionId, signature, "admin");

  const validatedCellRef = Validation.cellReference(cellRef, "Cell reference");

  const validatedFormula = Validation.formula(formula, "Formula");

  try {
    const ss = getMainSpreadsheet();

    const clientNamesSheet = ss.getSheetByName("Client Names");

    if (!clientNamesSheet) {
      throw new Error('Sheet "Client Names" was not found.');
    }

    const lastRow = clientNamesSheet.getLastRow();

    const clientNames =
      lastRow >= 2
        ? clientNamesSheet
            .getRange(`A2:A${lastRow}`)
            .getValues()
            .flat()
            .map((name) => String(name || "").trim())
            .filter(Boolean)
        : [];

    const clientNameSet = new Set(clientNames);

    let updated = 0;

    ss.getSheets().forEach((sheet) => {
      const name = sheet.getName();

      if (!clientNameSet.has(name) && name !== "BLANK") {
        return;
      }

      sheet.getRange(validatedCellRef).setFormula(validatedFormula);

      updated++;
    });

    logResponse(
      `Main formula update complete. Cell: ${validatedCellRef}, Sheets updated: ${updated}`,
    );

    return {
      success: true,
      cellRef: validatedCellRef,
      updated,
    };
  } catch (err) {
    logResponse(`applyFormulaToMainSheets failed: ${err.message}`);

    throw new Error(`Failed to apply formula to main sheets: ${err.message}`);
  }
}

function applyFormulaToExternalProjects(
  sessionId,
  signature,
  cellRef,
  formula,
) {
  requireRole(sessionId, signature, "admin");

  const session = requireCapability(sessionId, signature, "clients.manage");

  const workspace = getManagerWorkspaceForSession_(session);

  const validatedCellRef = Validation.cellReference(cellRef, "Cell reference");

  const validatedFormula = Validation.formula(formula, "Formula");

  try {
    const externalSheets = getExternalSheetsInternal(workspace.spreadsheet);

    const spreadsheetIds = new Set();

    externalSheets.forEach((external) => {
      if (external.spreadsheetId) {
        spreadsheetIds.add(external.spreadsheetId);
      }
    });

    /*
     * Always include the external template.
     */
    const templateId = PropertiesService.getScriptProperties().getProperty(
      EXTERNAL_SHEETS_CONFIG.templateProperty,
    );

    if (templateId) {
      spreadsheetIds.add(templateId);
    }

    let updated = 0;
    let failed = 0;

    spreadsheetIds.forEach((spreadsheetId) => {
      try {
        const externalSS = openSpreadsheetById(spreadsheetId);

        const projectsSheet = externalSS.getSheetByName("Projects");

        if (!projectsSheet) {
          console.warn(`No Projects sheet found in "${externalSS.getName()}".`);

          failed++;
          return;
        }

        projectsSheet.getRange(validatedCellRef).setFormula(validatedFormula);

        updated++;

        logResponse(
          `Formula applied to ${externalSS.getName()} → Projects!${cellRef}`,
        );
      } catch (err) {
        failed++;

        console.warn(
          `Unable to update external Projects sheet "${spreadsheetId}":`,
          err,
        );
      }
    });

    return {
      success: failed === 0,
      cellRef,
      updated,
      failed,
    };
  } catch (err) {
    logResponse(`applyFormulaToExternalProjects failed: ${err.message}`);

    throw new Error(
      `Failed to update external Projects sheets: ${err.message}`,
    );
  }
}

function applyFormulaToExternalProjectSheets(
  sessionId,
  signature,
  cellRef,
  formula,
) {
  requireRole(sessionId, signature, "admin");

  const session = requireCapability(sessionId, signature, "clients.manage");

  const workspace = getManagerWorkspaceForSession_(session);

  const validatedCellRef = Validation.cellReference(cellRef, "Cell reference");

  const validatedFormula = Validation.formula(formula, "Formula");

  try {
    const externalSheets = getExternalSheetsInternal(workspace.spreadsheet);

    const spreadsheetIds = new Set();

    externalSheets.forEach((external) => {
      if (external.spreadsheetId) {
        spreadsheetIds.add(external.spreadsheetId);
      }
    });

    /*
     * Always include the external template.
     */
    const templateId = PropertiesService.getScriptProperties().getProperty(
      EXTERNAL_SHEETS_CONFIG.templateProperty,
    );

    if (templateId) {
      spreadsheetIds.add(templateId);
    }

    let updated = 0;
    let failed = 0;

    spreadsheetIds.forEach((spreadsheetId) => {
      try {
        const externalSS = openSpreadsheetById(spreadsheetId);

        externalSS.getSheets().forEach((sheet) => {
          const sheetName = sheet.getName();

          /*
           * Projects is handled separately by
           * applyFormulaToExternalProjects().
           */
          if (sheetName === "Projects") {
            return;
          }

          /*
           * Include BLANK.
           *
           * BLANK is the template used when creating
           * new project sheets, so the formula must be
           * kept in sync here as well.
           */

          try {
            sheet.getRange(validatedCellRef).setFormula(validatedFormula);

            updated++;

            logResponse(
              `Formula applied to ${externalSS.getName()} → ${sheetName}!${cellRef}`,
            );
          } catch (err) {
            failed++;

            console.warn(
              `Unable to update ${externalSS.getName()} → ${sheetName}:`,
              err,
            );
          }
        });
      } catch (err) {
        failed++;

        console.warn(
          `Unable to open external spreadsheet "${spreadsheetId}":`,
          err,
        );
      }
    });

    return {
      success: failed === 0,
      cellRef,
      updated,
      failed,
    };
  } catch (err) {
    logResponse(`applyFormulaToExternalProjectSheets failed: ${err.message}`);

    throw new Error(`Failed to update external project sheets: ${err.message}`);
  }
}

function reorderActiveClientSheets() {
  const ss = getMainSpreadsheet();
  const clientNamesSheet = getSheetSafe("Client Names");

  if (!ss || !clientNamesSheet) {
    console.warn("[Client Sheets] Client Names sheet not found.");
    return;
  }

  const lastRow = clientNamesSheet.getLastRow();

  if (lastRow < 2) {
    console.warn("[Client Sheets] No client names found.");
    return;
  }

  const clientNames = [
    ...new Set(
      clientNamesSheet
        .getRange(2, 1, lastRow - 1, 1)
        .getDisplayValues()
        .flat()
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  ];

  const activeClientNames = [
    ...new Set(
      clientNamesSheet
        .getRange(2, 9, lastRow - 1, 1)
        .getDisplayValues()
        .flat()
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  ];

  if (!clientNames.length || !activeClientNames.length) {
    console.warn("[Client Sheets] Client or active client list is empty.");
    return;
  }

  const sheets = ss.getSheets();

  const clientSheetNames = new Set(clientNames);

  const sheetsByName = new Map(sheets.map((sheet) => [sheet.getName(), sheet]));

  // Keep all non-client sheets first, in their current relative order.
  const systemSheets = sheets.filter(
    (sheet) => !clientSheetNames.has(sheet.getName()),
  );

  let targetIndex = systemSheets.length + 1;
  let reorderedCount = 0;

  activeClientNames.forEach((clientName) => {
    const sheet = sheetsByName.get(clientName);

    if (!sheet) {
      console.warn(
        `[Client Sheets] Sheet not found for active client: ${clientName}`,
      );
      return;
    }

    ss.setActiveSheet(sheet);
    ss.moveActiveSheet(targetIndex++);

    reorderedCount++;
  });

  console.log(
    `[Client Sheets] Reordered ${reorderedCount} active client sheets after ${systemSheets.length} system sheets.`,
  );
}
