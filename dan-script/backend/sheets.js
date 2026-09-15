function getSpreadsheet() {
  const ssId =
    PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");

  if (ssId) {
    return SpreadsheetApp.openById(ssId);
  }

  // Fallback: use the active spreadsheet (e.g., for bound scripts / initial setup)
  return getSpreadsheet();
}

function getSheet(name) {
  return getSpreadsheet().getSheetByName(name);
}

function getSheetSafe(name) {
  return getSheet(name) || null;
}

function sheetExists(name) {
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

function applyFormulaToMainSheets(cellRef, formula) {
  // requireAuthorizedUser();

  try {
    const ss = getSpreadsheet();

    let updated = 0;

    ss.getSheets().forEach((sheet) => {
      const name = sheet.getName();

      if (!CONFIG.SHEETS.EXCLUDED.has(name) || name === "BLANK") {
        sheet.getRange(cellRef).setFormula(formula);

        updated++;
      }
    });

    logResponse(
      `Main formula update complete. Cell: ${cellRef}, Sheets updated: ${updated}`,
    );

    return {
      success: true,
      cellRef,
      updated,
    };
  } catch (err) {
    logResponse(`applyFormulaToMainSheets failed: ${err.message}`);

    throw new Error(`Failed to apply formula to main sheets: ${err.message}`);
  }
}

function applyFormulaToExternalProjects(cellRef, formula) {
  // requireAuthorizedUser();

  try {
    const externalSheets = getExternalSheets();

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

        projectsSheet.getRange(cellRef).setFormula(formula);

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

function applyFormulaToExternalProjectSheets(cellRef, formula) {
  // requireAuthorizedUser();

  try {
    const externalSheets = getExternalSheets();

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
            sheet.getRange(cellRef).setFormula(formula);

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