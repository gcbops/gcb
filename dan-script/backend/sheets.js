function getSpreadsheet() {
  const ssId =
    PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");

  if (ssId) {
    return SpreadsheetApp.openById(ssId);
  }

  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet(name) {
  return getSpreadsheet().getSheetByName(name);
}

function getSheetSafe(name) {
  return getSheet(name) || null;
}

function sheetExists(sessionId, signature, name) {
  requireCapability(sessionId, signature, "clients.view");

  return !!getSheet(name);
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
    const ss = getSpreadsheet();

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

  const validatedCellRef = Validation.cellReference(cellRef, "Cell reference");

  const validatedFormula = Validation.formula(formula, "Formula");

  try {
    const externalSheets = getExternalSheetsInternal();

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
        const externalSS = SpreadsheetApp.openById(spreadsheetId);

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
      success: true,
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

  const validatedCellRef = Validation.cellReference(cellRef, "Cell reference");

  const validatedFormula = Validation.formula(formula, "Formula");

  try {
    const externalSheets = getExternalSheetsInternal();

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
        const externalSS = SpreadsheetApp.openById(spreadsheetId);

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
      success: true,
      cellRef,
      updated,
      failed,
    };
  } catch (err) {
    logResponse(`applyFormulaToExternalProjectSheets failed: ${err.message}`);

    throw new Error(`Failed to update external project sheets: ${err.message}`);
  }
}
