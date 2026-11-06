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

  const index = values.findIndex(([value]) => value === "" || value == null);

  return index >= 0 ? index + startRow : lastRow + 1;
}

function reorderActiveClientSheets() {
  const managers = getManagers_();
  const results = [];

  const processedSpreadsheetIds = new Set();

  managers.forEach((manager) => {
    const spreadsheetId = String(manager?.spreadsheetId || "").trim();

    if (!manager?.managerId || !spreadsheetId) {
      results.push({
        managerId: manager?.managerId || null,
        success: false,
        error: "Manager ID or operational spreadsheet ID is missing.",
      });
      return;
    }

    if (processedSpreadsheetIds.has(spreadsheetId)) {
      results.push({
        managerId: manager.managerId,
        success: false,
        error: "Operational spreadsheet ID is assigned more than once.",
      });
      return;
    }

    processedSpreadsheetIds.add(spreadsheetId);

    try {
      const ss = openSpreadsheetById(spreadsheetId);
      const clientNamesSheet = ss.getSheetByName("Client Names");

      if (!clientNamesSheet) {
        throw new Error('Sheet "Client Names" was not found.');
      }

      const lastRow = clientNamesSheet.getLastRow();

      if (lastRow < 2) {
        results.push({
          managerId: manager.managerId,
          success: true,
          reorderedCount: 0,
          message: "No client names found.",
        });
        return;
      }

      const readNames = (column) => [
        ...new Set(
          clientNamesSheet
            .getRange(2, column, lastRow - 1, 1)
            .getDisplayValues()
            .flat()
            .map((name) => name.trim())
            .filter(Boolean),
        ),
      ];

      const clientNames = readNames(1);
      const activeClientNames = readNames(9);
      const clientSheetNames = new Set(clientNames);

      const sheets = ss.getSheets();
      const sheetsByName = new Map(
        sheets.map((sheet) => [sheet.getName(), sheet]),
      );

      // Preserve the relative order of non-client/system sheets.
      const systemSheets = sheets.filter(
        (sheet) => !clientSheetNames.has(sheet.getName()),
      );

      let targetIndex = systemSheets.length + 1;
      let reorderedCount = 0;
      let missingSheetCount = 0;

      activeClientNames.forEach((clientName) => {
        const sheet = sheetsByName.get(clientName);

        if (!sheet) {
          missingSheetCount++;

          console.warn(
            `[Client Sheets][${manager.managerId}] Sheet not found: ${clientName}`,
          );

          return;
        }

        ss.setActiveSheet(sheet);
        ss.moveActiveSheet(targetIndex++);
        reorderedCount++;
      });

      results.push({
        managerId: manager.managerId,
        success: missingSheetCount === 0,
        reorderedCount,
        missingSheetCount,
      });
    } catch (error) {
      results.push({
        managerId: manager.managerId,
        success: false,
        error: String(error?.message || error).slice(0, 300),
      });
    }
  });

  return {
    success: results.every((result) => result.success),
    results,
  };
}

function getExternalSheetTemplate_() {
  const templateId = String(
    PropertiesService.getScriptProperties().getProperty(
      "EXTERNAL_SHEET_TEMPLATE_ID",
    ) || "",
  ).trim();

  if (!templateId) {
    throw new Error("EXTERNAL_SHEET_TEMPLATE_ID is not configured.");
  }

  return {
    spreadsheetId: templateId,
    spreadsheet: openSpreadsheetById(templateId),
  };
}

function applyFormulaToMainSheets(sessionId, signature, cellRef, formula) {
  requireRole(sessionId, signature, "admin");

  const validatedCellRef = Validation.cellReference(cellRef, "Cell reference");
  const validatedFormula = Validation.formula(formula, "Formula");

  try {
    let updated = 0;
    let failed = 0;
    const results = [];

    /**
     * Apply the formula to actual client sheets and BLANK.
     */
    function applyToSpreadsheet(ss, managerId = null, spreadsheetId = "") {
      const clientNames = new Set(getClientSheetsListFromSpreadsheet_(ss));

      let spreadsheetUpdated = 0;
      let spreadsheetFailed = 0;

      ss.getSheets().forEach((sheet) => {
        const name = sheet.getName();

        if (!clientNames.has(name) && name !== "BLANK") {
          return;
        }

        try {
          sheet.getRange(validatedCellRef).setFormula(validatedFormula);

          updated++;
          spreadsheetUpdated++;
        } catch (error) {
          failed++;
          spreadsheetFailed++;

          console.warn(
            `[Main Sheets] Unable to update ${managerId || "Template"} → ` +
              `${name}!${validatedCellRef}:`,
            error,
          );
        }
      });

      results.push({
        target: managerId ? "manager" : "template",
        managerId,
        spreadsheetId,
        success: spreadsheetFailed === 0,
        updated: spreadsheetUpdated,
        failed: spreadsheetFailed,
      });

      return {
        updated: spreadsheetUpdated,
        failed: spreadsheetFailed,
      };
    }

    // ---------------------------------------------------------
    // 1. Update manager operational spreadsheets
    // ---------------------------------------------------------

    const managers = getManagers_();

    managers.forEach((manager) => {
      const managerId = manager?.managerId || null;
      const spreadsheetId = String(manager?.spreadsheetId || "").trim();

      if (!spreadsheetId) {
        failed++;

        results.push({
          target: "manager",
          managerId,
          success: false,
          updated: 0,
          failed: 1,
          error: "Manager operational spreadsheet ID is missing.",
        });

        return;
      }

      try {
        const ss = openSpreadsheetById(spreadsheetId);

        applyToSpreadsheet(ss, managerId, spreadsheetId);

        const result = results[results.length - 1];

        logResponse(
          `Main formula update: manager ${managerId}, ` +
            `cell ${validatedCellRef}, updated ${result.updated}, ` +
            `failed ${result.failed}.`,
        );
      } catch (error) {
        failed++;

        results.push({
          target: "manager",
          managerId,
          spreadsheetId,
          success: false,
          updated: 0,
          failed: 1,
          error: String(error?.message || error).slice(0, 300),
        });

        console.warn(
          `[Main Sheets] Unable to process manager ${managerId}:`,
          error,
        );
      }
    });

    // ---------------------------------------------------------
    // 2. Update the main sheet template
    // ---------------------------------------------------------

    const templateId = String(
      PropertiesService.getScriptProperties().getProperty(
        "MAIN_SHEET_TEMPLATE_ID",
      ) || "",
    ).trim();

    if (!templateId) {
      failed++;

      results.push({
        target: "template",
        success: false,
        updated: 0,
        failed: 1,
        error: "MAIN_SHEET_TEMPLATE_ID is not configured.",
      });
    } else {
      try {
        const templateSS = openSpreadsheetById(templateId);

        const templateResult = applyToSpreadsheet(templateSS, null, templateId);

        logResponse(
          `Main template formula update: cell ${validatedCellRef}, ` +
            `updated ${templateResult.updated}, ` +
            `failed ${templateResult.failed}.`,
        );
      } catch (error) {
        failed++;

        results.push({
          target: "template",
          spreadsheetId: templateId,
          success: false,
          updated: 0,
          failed: 1,
          error: String(error?.message || error).slice(0, 300),
        });

        console.warn(
          "[Main Sheets] Unable to process main sheet template:",
          error,
        );
      }
    }

    return {
      success: failed === 0,
      cellRef: validatedCellRef,
      updated,
      failed,
      results,
    };
  } catch (error) {
    logResponse(`applyFormulaToMainSheets failed: ${error?.message || error}`);

    throw new Error(
      `Failed to apply formula to main sheets: ${error?.message || error}`,
    );
  }
}

function applyFormulaToExternalProjects(
  sessionId,
  signature,
  cellRef,
  formula,
) {
  requireRole(sessionId, signature, "admin");
  requireCapability(sessionId, signature, "clients.manage");

  const validatedCellRef = Validation.cellReference(cellRef, "Cell reference");
  const validatedFormula = Validation.formula(formula, "Formula");

  try {
    const { targets, errors } = getAllManagerExternalSpreadsheetTargets_();

    let updated = 0;
    let failed = errors.length;

    const results = errors.map((item) => ({
      spreadsheetId: null,
      managerId: item.managerId,
      success: false,
      error: item.error,
    }));

    targets.forEach((target) => {
      try {
        const externalSS = openSpreadsheetById(target.spreadsheetId);
        const projectsSheet = externalSS.getSheetByName("Projects");

        if (!projectsSheet) {
          throw new Error(
            `Sheet "Projects" was not found in "${externalSS.getName()}".`,
          );
        }

        projectsSheet.getRange(validatedCellRef).setFormula(validatedFormula);

        updated++;

        results.push({
          spreadsheetId: target.spreadsheetId,
          managerId: target.managerId,
          source: target.source,
          success: true,
        });

        logResponse(
          `Formula applied to ${externalSS.getName()} → ` +
            `Projects!${validatedCellRef}`,
        );
      } catch (error) {
        failed++;

        results.push({
          spreadsheetId: target.spreadsheetId,
          managerId: target.managerId,
          source: target.source,
          success: false,
          error: String(error?.message || error).slice(0, 300),
        });

        console.warn(
          `[External Projects] Unable to update spreadsheet ` +
            `${target.spreadsheetId}:`,
          error,
        );
      }
    });

    // ---------------------------------------------------------
    // UPDATE SHARED EXTERNAL SHEET TEMPLATE → PROJECTS
    // ---------------------------------------------------------

    try {
      const { spreadsheetId, spreadsheet: templateSS } =
        getExternalSheetTemplate_();

      const projectsSheet = templateSS.getSheetByName("Projects");

      if (!projectsSheet) {
        throw new Error(
          `Sheet "Projects" was not found in the external template.`,
        );
      }

      projectsSheet.getRange(validatedCellRef).setFormula(validatedFormula);

      updated++;

      results.push({
        target: "template",
        spreadsheetId,
        source: "external-template",
        sheetName: "Projects",
        success: true,
        updated: 1,
        failed: 0,
      });

      logResponse(
        `Formula applied to External Sheet Template → ` +
          `Projects!${validatedCellRef}`,
      );
    } catch (error) {
      failed++;

      results.push({
        target: "template",
        source: "external-template",
        success: false,
        updated: 0,
        failed: 1,
        error: String(error?.message || error).slice(0, 300),
      });

      console.warn(
        "[External Projects] Unable to update external template:",
        error,
      );
    }

    return {
      success: failed === 0,
      cellRef: validatedCellRef,
      updated,
      failed,
      results,
    };
  } catch (error) {
    logResponse(
      `applyFormulaToExternalProjects failed: ${error?.message || error}`,
    );

    throw new Error(
      `Failed to update external Projects sheets: ${error?.message || error}`,
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
  requireCapability(sessionId, signature, "clients.manage");

  const validatedCellRef = Validation.cellReference(cellRef, "Cell reference");
  const validatedFormula = Validation.formula(formula, "Formula");

  try {
    const { targets, errors } = getAllManagerExternalSpreadsheetTargets_();

    let updated = 0;
    let failed = errors.length;

    const results = errors.map((item) => ({
      spreadsheetId: null,
      managerId: item.managerId,
      success: false,
      error: item.error,
    }));

    targets.forEach((target) => {
      let externalSS;
      let projectSheets;

      try {
        externalSS = openSpreadsheetById(target.spreadsheetId);
        projectSheets = getExternalProjectSheets_(externalSS);
      } catch (error) {
        failed++;

        results.push({
          spreadsheetId: target.spreadsheetId,
          managerId: target.managerId,
          source: target.source,
          success: false,
          updated: 0,
          failed: 1,
          error: String(error?.message || error).slice(0, 300),
        });

        console.warn(
          `[External Project Sheets] Unable to access spreadsheet ` +
            `${target.spreadsheetId}:`,
          error,
        );

        return;
      }

      let spreadsheetUpdated = 0;
      let spreadsheetFailed = 0;

      projectSheets.forEach((sheet) => {
        try {
          sheet.getRange(validatedCellRef).setFormula(validatedFormula);

          updated++;
          spreadsheetUpdated++;

          logResponse(
            `Formula applied to ${externalSS.getName()} → ` +
              `${sheet.getName()}!${validatedCellRef}`,
          );
        } catch (error) {
          failed++;
          spreadsheetFailed++;

          console.warn(
            `[External Project Sheets] Unable to update ` +
              `${externalSS.getName()} → ${sheet.getName()}:`,
            error,
          );
        }
      });

      results.push({
        spreadsheetId: target.spreadsheetId,
        managerId: target.managerId,
        source: target.source,
        success: spreadsheetFailed === 0,
        updated: spreadsheetUpdated,
        failed: spreadsheetFailed,
      });
    });

    // ---------------------------------------------------------
    // UPDATE SHARED EXTERNAL SHEET TEMPLATE → INTERNAL TABS
    // ---------------------------------------------------------

    try {
      const { spreadsheetId, spreadsheet: templateSS } =
        getExternalSheetTemplate_();

      const projectSheets = getExternalProjectSheets_(templateSS);

      if (!projectSheets.length) {
        throw new Error(
          "No eligible internal project tabs were found in the external template.",
        );
      }

      let templateUpdated = 0;
      let templateFailed = 0;

      projectSheets.forEach((sheet) => {
        try {
          sheet.getRange(validatedCellRef).setFormula(validatedFormula);

          updated++;
          templateUpdated++;

          logResponse(
            `Formula applied to External Sheet Template → ` +
              `${sheet.getName()}!${validatedCellRef}`,
          );
        } catch (error) {
          failed++;
          templateFailed++;

          console.warn(
            `[External Template] Unable to update ${sheet.getName()}:`,
            error,
          );
        }
      });

      results.push({
        target: "template",
        spreadsheetId,
        source: "external-template",
        success: templateFailed === 0,
        updated: templateUpdated,
        failed: templateFailed,
      });
    } catch (error) {
      failed++;

      results.push({
        target: "template",
        source: "external-template",
        success: false,
        updated: 0,
        failed: 1,
        error: String(error?.message || error).slice(0, 300),
      });

      console.warn(
        "[External Project Sheets] Unable to update external template:",
        error,
      );
    }

    return {
      success: failed === 0,
      cellRef: validatedCellRef,
      updated,
      failed,
      results,
    };
  } catch (error) {
    logResponse(
      `applyFormulaToExternalProjectSheets failed: ` +
        `${error?.message || error}`,
    );

    throw new Error(
      `Failed to update external project sheets: ` +
        `${error?.message || error}`,
    );
  }
}

function applyFormulaInjection(
  sessionId,
  signature,
  target,
  scope,
  sheetName,
  cellRef,
  formula,
) {
  requireRole(sessionId, signature, "admin");

  const validatedTarget = String(target || "").trim();
  const validatedScope = String(scope || "").trim();
  const validatedSheetName = String(sheetName || "").trim();

  const validScopes = {
    main: ["all", "individual"],
    "external-main": ["all", "project", "individual"],
  };

  if (!Object.prototype.hasOwnProperty.call(validScopes, validatedTarget)) {
    throw new Error("Invalid formula injection target.");
  }

  if (!validScopes[validatedTarget].includes(validatedScope)) {
    throw new Error("Invalid deployment scope for the selected target.");
  }

  if (validatedScope === "individual" && !validatedSheetName) {
    throw new Error("Please enter a sheet tab name.");
  }

  // ---------------------------------------------------------
  // MAIN SHEET
  // ---------------------------------------------------------

  if (validatedTarget === "main") {
    if (validatedScope === "all") {
      return applyFormulaToMainSheets(sessionId, signature, cellRef, formula);
    }

    if (validatedScope === "individual") {
      return applyFormulaToMainSheetTab_(
        sessionId,
        signature,
        validatedSheetName,
        cellRef,
        formula,
      );
    }
  }

  // ---------------------------------------------------------
  // EXTERNAL CLIENT SHEET
  // ---------------------------------------------------------

  if (validatedTarget === "external-main") {
    // All internal client/project tabs.
    if (validatedScope === "all") {
      return applyFormulaToExternalProjectSheets(
        sessionId,
        signature,
        cellRef,
        formula,
      );
    }

    // External spreadsheet's Projects tab.
    if (validatedScope === "project") {
      return applyFormulaToExternalProjects(
        sessionId,
        signature,
        cellRef,
        formula,
      );
    }

    // Any exact existing tab in each external spreadsheet.
    if (validatedScope === "individual") {
      return applyFormulaToExternalProjectTab_(
        sessionId,
        signature,
        validatedSheetName,
        cellRef,
        formula,
      );
    }
  }

  throw new Error("Unable to process formula injection request.");
}

function applyFormulaToMainSheetTab_(
  sessionId,
  signature,
  sheetName,
  cellRef,
  formula,
) {
  requireRole(sessionId, signature, "admin");

  const validatedCellRef = Validation.cellReference(cellRef, "Cell reference");
  const validatedFormula = Validation.formula(formula, "Formula");
  const validatedSheetName = String(sheetName || "").trim();

  if (!validatedSheetName) {
    throw new Error("Please enter a sheet tab name.");
  }

  let updated = 0;
  let failed = 0;
  const results = [];

  function applyToSpreadsheet(ss, managerId, spreadsheetId) {
    try {
      // Individual deployment: allow ANY existing sheet tab.
      const sheet = ss.getSheetByName(validatedSheetName);

      if (!sheet) {
        throw new Error(
          `Sheet tab "${validatedSheetName}" was not found in this spreadsheet.`,
        );
      }

      sheet.getRange(validatedCellRef).setFormula(validatedFormula);

      updated++;

      results.push({
        target: managerId ? "manager" : "template",
        managerId,
        spreadsheetId,
        sheetName: validatedSheetName,
        success: true,
        updated: 1,
        failed: 0,
      });
    } catch (error) {
      failed++;

      results.push({
        target: managerId ? "manager" : "template",
        managerId,
        spreadsheetId,
        sheetName: validatedSheetName,
        success: false,
        updated: 0,
        failed: 1,
        error: String(error?.message || error).slice(0, 300),
      });
    }
  }

  getManagers_().forEach((manager) => {
    const managerId = manager?.managerId || null;
    const spreadsheetId = String(manager?.spreadsheetId || "").trim();

    if (!spreadsheetId) {
      failed++;

      results.push({
        target: "manager",
        managerId,
        success: false,
        updated: 0,
        failed: 1,
        error: "Manager operational spreadsheet ID is missing.",
      });

      return;
    }

    try {
      applyToSpreadsheet(
        openSpreadsheetById(spreadsheetId),
        managerId,
        spreadsheetId,
      );
    } catch (error) {
      failed++;

      results.push({
        target: "manager",
        managerId,
        spreadsheetId,
        success: false,
        updated: 0,
        failed: 1,
        error: String(error?.message || error).slice(0, 300),
      });
    }
  });

  const templateId = String(
    PropertiesService.getScriptProperties().getProperty(
      "MAIN_SHEET_TEMPLATE_ID",
    ) || "",
  ).trim();

  if (!templateId) {
    failed++;

    results.push({
      target: "template",
      success: false,
      updated: 0,
      failed: 1,
      error: "MAIN_SHEET_TEMPLATE_ID is not configured.",
    });
  } else {
    try {
      applyToSpreadsheet(openSpreadsheetById(templateId), null, templateId);
    } catch (error) {
      failed++;

      results.push({
        target: "template",
        spreadsheetId: templateId,
        success: false,
        updated: 0,
        failed: 1,
        error: String(error?.message || error).slice(0, 300),
      });
    }
  }

  return {
    success: failed === 0,
    target: "main",
    scope: "individual",
    sheetName: validatedSheetName,
    cellRef: validatedCellRef,
    updated,
    failed,
    results,
  };
}

function applyFormulaToExternalProjectTab_(
  sessionId,
  signature,
  sheetName,
  cellRef,
  formula,
) {
  requireRole(sessionId, signature, "admin");
  requireCapability(sessionId, signature, "clients.manage");

  const validatedSheetName = String(sheetName || "").trim();
  const validatedCellRef = Validation.cellReference(cellRef, "Cell reference");
  const validatedFormula = Validation.formula(formula, "Formula");

  const { targets, errors } = getAllManagerExternalSpreadsheetTargets_();

  let updated = 0;
  let failed = errors.length;

  const results = errors.map((item) => ({
    managerId: item.managerId,
    success: false,
    updated: 0,
    failed: 1,
    error: item.error,
  }));

  targets.forEach((target) => {
    try {
      const ss = openSpreadsheetById(target.spreadsheetId);
      const sheet = ss.getSheetByName(validatedSheetName);

      if (!sheet) {
        throw new Error(`Sheet tab "${validatedSheetName}" was not found.`);
      }

      sheet.getRange(validatedCellRef).setFormula(validatedFormula);
      updated++;

      results.push({
        managerId: target.managerId,
        spreadsheetId: target.spreadsheetId,
        source: target.source,
        sheetName: validatedSheetName,
        success: true,
        updated: 1,
        failed: 0,
      });
    } catch (error) {
      failed++;

      results.push({
        managerId: target.managerId,
        spreadsheetId: target.spreadsheetId,
        source: target.source,
        sheetName: validatedSheetName,
        success: false,
        updated: 0,
        failed: 1,
        error: String(error?.message || error).slice(0, 300),
      });
    }
  });

  // ---------------------------------------------------------
  // UPDATE SHARED EXTERNAL SHEET TEMPLATE → SPECIFIC TAB
  // ---------------------------------------------------------

  try {
    const { spreadsheetId, spreadsheet: templateSS } =
      getExternalSheetTemplate_();

    const sheet = templateSS.getSheetByName(validatedSheetName);

    if (!sheet) {
      throw new Error(
        `Sheet tab "${validatedSheetName}" was not found in the external template.`,
      );
    }

    sheet.getRange(validatedCellRef).setFormula(validatedFormula);

    updated++;

    results.push({
      target: "template",
      spreadsheetId,
      source: "external-template",
      sheetName: validatedSheetName,
      success: true,
      updated: 1,
      failed: 0,
    });

    logResponse(
      `Formula applied to External Sheet Template → ` +
        `${validatedSheetName}!${validatedCellRef}`,
    );
  } catch (error) {
    failed++;

    results.push({
      target: "template",
      source: "external-template",
      success: false,
      updated: 0,
      failed: 1,
      error: String(error?.message || error).slice(0, 300),
    });

    console.warn(
      "[External Project Tab] Unable to update external template:",
      error,
    );
  }

  return {
    success: failed === 0,
    target: "external-main",
    scope: "individual",
    sheetName: validatedSheetName,
    cellRef: validatedCellRef,
    updated,
    failed,
    results,
  };
}


