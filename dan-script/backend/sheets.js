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

// custom formula for main sheet - client sheets
// function applyMonthlyBillingFormulasToMainClientSheets() {
//   // requireAuthorizedUser();

//   try {
//     const ss = getSpreadsheet();

//     const headers = [
//       [
//         "Month",
//         "Total Hours",
//         "Paid Hours",
//         "Unpaid Hours",
//         "Invoiced Hours",
//         "Outstanding Hours",
//         "Collection Rate",
//         "Unpaid Rate",
//         "Invoiced Rate",
//       ],
//     ];

//     const formulas = {
//       AD51: `=SORT(UNIQUE(FILTER(DATE(YEAR($H$3:$H),MONTH($H$3:$H),1),$H$3:$H<>"")))`,

//       AE51: `=MAP($AD51:$AD100,LAMBDA(m,IF(m="","",SUMPRODUCT((IFERROR(DATE(YEAR($H$3:$H),MONTH($H$3:$H),1),0)=m)*N($G$3:$G)))))`,

//       AF51: `=MAP($AD51:$AD100,LAMBDA(m,IF(m="","",SUMPRODUCT((IFERROR(DATE(YEAR($H$3:$H),MONTH($H$3:$H),1),0)=m)*N($G$3:$G)*--REGEXMATCH(TO_TEXT($I$3:$I),"(^|[^A-Z])PAID([^A-Z]|$)")))))`,

//       AG51: `=MAP($AD51:$AD100,LAMBDA(m,IF(m="","",SUMPRODUCT((IFERROR(DATE(YEAR($H$3:$H),MONTH($H$3:$H),1),0)=m)*N($G$3:$G)*--REGEXMATCH(TO_TEXT($I$3:$I),"(^|[^A-Z])UNPAID([^A-Z]|$)")))))`,

//       AH51: `=MAP($AD51:$AD100,LAMBDA(m,IF(m="","",SUMPRODUCT((IFERROR(DATE(YEAR($H$3:$H),MONTH($H$3:$H),1),0)=m)*N($G$3:$G)*--REGEXMATCH(TO_TEXT($I$3:$I),"(^|[^A-Z])INVOICED([^A-Z]|$)")))))`,

//       AI51: `=ARRAYFORMULA(IF($AD51:$AD100="","",$AG51:$AG100+$AH51:$AH100))`,

//       AJ51: `=ARRAYFORMULA(IF($AD51:$AD100="","",IFERROR($AF51:$AF100/$AE51:$AE100,0)))`,

//       AK51: `=ARRAYFORMULA(IF($AD51:$AD100="","",IFERROR($AG51:$AG100/$AE51:$AE100,0)))`,

//       AL51: `=ARRAYFORMULA(IF($AD51:$AD100="","",IFERROR($AH51:$AH100/$AE51:$AE100,0)))`,
//     };

//     let updated = 0;

//     ss.getSheets().forEach((sheet) => {
//       const name = sheet.getName();

//       /*
//        * Skip system/excluded sheets.
//        */
//       if (CONFIG.SHEETS.EXCLUDED.has(name) && name !== "BLANK") {
//         return;
//       }

//       /*
//        * Skip the BLANK template if it isn't a client sheet.
//        */
//       if (name === "BLANK") {
//         return;
//       }

//       /*
//        * Headers
//        */
//       sheet.getRange("AD50:AL50").setValues(headers);

//       /*
//        * Monthly billing formulas
//        */
//       Object.entries(formulas).forEach(([cellRef, formula]) => {
//         sheet.getRange(cellRef).setFormula(formula);
//       });

//       /*
//        * Number formatting
//        */
//       sheet.getRange("AD51:AD100").setNumberFormat("MMM yyyy");

//       sheet.getRange("AE51:AI100").setNumberFormat("0.##");

//       sheet.getRange("AJ51:AL100").setNumberFormat("0.00%");

//       const lastCol = sheet.getDataRange().getLastColumn();
//       const maxCols = sheet.getMaxColumns();

//       if (lastCol < maxCols) {
//         const startCol = lastCol + 1;
//         const countToHide = maxCols - startCol + 1;

//         // Optional: Prevent hiding if calculated count is 0 or negative
//         if (countToHide > 0) {
//           sheet.hideColumns(startCol, countToHide);
//         }
//       }

//       updated++;
//     });

//     logResponse(
//       `Monthly billing formulas applied to main client sheets. Sheets updated: ${updated}`,
//     );

//     return {
//       success: true,
//       updated,
//     };
//   } catch (err) {
//     logResponse(
//       `applyMonthlyBillingFormulasToMainClientSheets failed: ${err.message}`,
//     );

//     throw new Error(
//       `Failed to apply monthly billing formulas to main client sheets: ${err.message}`,
//     );
//   }
// }

// for external - project sheet
// function applyMonthlyBillingFormulasToExternalProjects() {
//   // requireAuthorizedUser();

//   try {
//     const externalSheets = getExternalSheets();

//     const spreadsheetIds = new Set();

//     externalSheets.forEach((external) => {
//       if (external.spreadsheetId) {
//         spreadsheetIds.add(external.spreadsheetId);
//       }
//     });

//     // Always include the external template.
//     const templateId = PropertiesService.getScriptProperties().getProperty(
//       EXTERNAL_SHEETS_CONFIG.templateProperty,
//     );

//     if (templateId) {
//       spreadsheetIds.add(templateId);
//     }

//     const headers = [
//       [
//         "Month",
//         "Total Hours",
//         "Paid Hours",
//         "Unpaid Hours",
//         "Invoiced Hours",
//         "Outstanding Hours",
//         "Collection Rate",
//         "Unpaid Rate",
//         "Invoiced Rate",
//       ],
//     ];

//     let updated = 0;
//     let failed = 0;

//     spreadsheetIds.forEach((spreadsheetId) => {
//       try {
//         const externalSS = SpreadsheetApp.openById(spreadsheetId);
//         const projectsSheet = externalSS.getSheetByName("Projects");

//         if (!projectsSheet) {
//           console.warn(`No Projects sheet found in "${externalSS.getName()}".`);

//           failed++;
//           return;
//         }

//         /*
//          * Headers
//          */
//         projectsSheet.getRange("AD50:AL50").setValues(headers);

//         /*
//          * Month
//          */
//         projectsSheet
//           .getRange("AD51")
//           .setFormula(
//             `=SORT(UNIQUE(FILTER(DATE(YEAR($H$3:$H),MONTH($H$3:$H),1),$H$3:$H<>"")))`,
//           );

//         /*
//          * Total Hours
//          */
//         projectsSheet
//           .getRange("AE51")
//           .setFormula(
//             `=MAP($AD51:$AD100,LAMBDA(m,IF(m="","",SUMPRODUCT((IFERROR(DATE(YEAR($H$3:$H),MONTH($H$3:$H),1),0)=m)*N($G$3:$G)))))`,
//           );

//         /*
//          * Paid Hours
//          */
//         projectsSheet
//           .getRange("AF51")
//           .setFormula(
//             `=MAP($AD51:$AD100,LAMBDA(m,IF(m="","",SUMPRODUCT((IFERROR(DATE(YEAR($H$3:$H),MONTH($H$3:$H),1),0)=m)*N($G$3:$G)*--REGEXMATCH(TO_TEXT($I$3:$I),"(^|[^A-Z])PAID([^A-Z]|$)")))))`,
//           );

//         /*
//          * Unpaid Hours
//          */
//         projectsSheet
//           .getRange("AG51")
//           .setFormula(
//             `=MAP($AD51:$AD100,LAMBDA(m,IF(m="","",SUMPRODUCT((IFERROR(DATE(YEAR($H$3:$H),MONTH($H$3:$H),1),0)=m)*N($G$3:$G)*--REGEXMATCH(TO_TEXT($I$3:$I),"(^|[^A-Z])UNPAID([^A-Z]|$)")))))`,
//           );

//         /*
//          * Invoiced Hours
//          */
//         projectsSheet
//           .getRange("AH51")
//           .setFormula(
//             `=MAP($AD51:$AD100,LAMBDA(m,IF(m="","",SUMPRODUCT((IFERROR(DATE(YEAR($H$3:$H),MONTH($H$3:$H),1),0)=m)*N($G$3:$G)*--REGEXMATCH(TO_TEXT($I$3:$I),"(^|[^A-Z])INVOICED([^A-Z]|$)")))))`,
//           );

//         /*
//          * Outstanding Hours
//          */
//         projectsSheet
//           .getRange("AI51")
//           .setFormula(
//             `=ARRAYFORMULA(IF($AD51:$AD100="","",$AG51:$AG100+$AH51:$AH100))`,
//           );

//         /*
//          * Collection Rate
//          */
//         projectsSheet
//           .getRange("AJ51")
//           .setFormula(
//             `=ARRAYFORMULA(IF($AD51:$AD100="","",IFERROR($AF51:$AF100/$AE51:$AE100,0)))`,
//           );

//         /*
//          * Unpaid Rate
//          */
//         projectsSheet
//           .getRange("AK51")
//           .setFormula(
//             `=ARRAYFORMULA(IF($AD51:$AD100="","",IFERROR($AG51:$AG100/$AE51:$AE100,0)))`,
//           );

//         /*
//          * Invoiced Rate
//          */
//         projectsSheet
//           .getRange("AL51")
//           .setFormula(
//             `=ARRAYFORMULA(IF($AD51:$AD100="","",IFERROR($AH51:$AH100/$AE51:$AE100,0)))`,
//           );

//         /*
//          * Formatting
//          */
//         projectsSheet.getRange("AD51:AD100").setNumberFormat("MMM yyyy");

//         projectsSheet.getRange("AE51:AI100").setNumberFormat("0.##");

//         projectsSheet.getRange("AJ51:AL").setNumberFormat("0.00%");

//         projectsSheet.getRange("AD51:AD100").setNumberFormat("MMM yyyy");

//         projectsSheet.getRange("AE51:AI100").setNumberFormat("0.##");

//         projectsSheet.getRange("AJ51:AL100").setNumberFormat("0.00%");

//         const lastCol = projectsSheet.getDataRange().getLastColumn();
//         const maxCols = projectsSheet.getMaxColumns();

//         if (lastCol < maxCols) {
//           const startCol = lastCol + 1;
//           const countToHide = maxCols - startCol + 1;

//           // Optional: Prevent hiding if calculated count is 0 or negative
//           if (countToHide > 0) {
//             projectsSheet.hideColumns(startCol, countToHide);
//           }
//         }

//         updated++;

//         logResponse(
//           `Monthly billing formulas applied to ${externalSS.getName()} → Projects`,
//         );
//       } catch (err) {
//         failed++;

//         console.warn(
//           `Unable to update external Projects sheet "${spreadsheetId}":`,
//           err,
//         );
//       }
//     });

//     logResponse(
//       `External monthly billing formula update complete. Updated: ${updated}, Failed: ${failed}`,
//     );

//     return {
//       success: true,
//       updated,
//       failed,
//     };
//   } catch (err) {
//     logResponse(
//       `applyMonthlyBillingFormulasToExternalProjects failed: ${err.message}`,
//     );

//     throw new Error(
//       `Failed to apply monthly billing formulas to external Projects sheets: ${err.message}`,
//     );
//   }
// }