function getSpreadsheet() {
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

function getActiveSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
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

function applyFormulaToSheets(cellRef, formula) {
  // requireAuthorizedUser();

  try {
    const ss = getActiveSpreadsheet();

    /*
     * Main spreadsheet
     */
    ss.getSheets().forEach((sheet) => {
      const name = sheet.getName();

      if (!CONFIG.SHEETS.EXCLUDED.has(name) || name === "BLANK") {
        sheet.getRange(cellRef).setFormula(formula);
      }
    });

    /*
     * External spreadsheets
     *
     * Only update their "Projects" sheet.
     */
    const externalSheets = getExternalSheets();

    externalSheets.forEach((external) => {
      const spreadsheetId = external.spreadsheetId;

      if (!spreadsheetId) {
        return;
      }

      try {
        const externalSS = SpreadsheetApp.openById(spreadsheetId);

        const projectsSheet = externalSS.getSheetByName("Projects");

        if (!projectsSheet) {
          console.warn(
            `External spreadsheet "${spreadsheetId}" has no Projects sheet.`,
          );

          return;
        }

        projectsSheet.getRange(cellRef).setFormula(formula);
      } catch (err) {
        console.warn(
          `Unable to update external spreadsheet "${spreadsheetId}":`,
          err,
        );
      }
    });

    return `Formula applied at ${cellRef}`;
  } catch (err) {
    logResponse(err);

    return `Error: ${err.message}`;
  }
}
