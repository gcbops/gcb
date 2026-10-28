function getManagerReportWorkspace_(manager) {
  if (!manager?.managerId || !manager?.spreadsheetId) {
    throw new Error("A valid manager registry entry is required.");
  }

  if (!manager.reportsFolderId) {
    throw new Error(
      `Reports Folder ID is missing for manager "${manager.managerId}".`,
    );
  }

  const workspace = {
    managerId: manager.managerId,
    managerName: manager.managerName || manager.managerId,
    email: String(manager.email || "").trim(),
    discordWebhookUrl: String(manager.discordWebhookUrl || "").trim(),
    spreadsheetId: manager.spreadsheetId,
    reportsFolderId: manager.reportsFolderId,
    spreadsheet: openSpreadsheetById(manager.spreadsheetId),
  };

  // Verify the manager's configured Reports Folder is accessible.
  getReportFolder(workspace);

  return workspace;
}

function cleanupOldReports() {
  const startedAt = Date.now();

  try {
    const result = cleanupOldReportsInternal();

    const failed = result.missing + result.managerErrors;

    recordGcbOperationLog_({
      category: "REPORT",
      operation: "CLEANUP_OLD_REPORTS",
      status: failed > 0 ? "PARTIAL" : "SUCCESS",
      trigger: "SCHEDULED_OR_MANUAL",
      durationMs: Date.now() - startedAt,
      processed: result.processed,
      succeeded: result.deleted + result.kept,
      failed,
      message:
        `Deleted ${result.deleted}; kept ${result.kept}; ` +
        `missing or inaccessible ${result.missing}; ` +
        `manager errors ${result.managerErrors}.`,
    });

    return result;
  } catch (error) {
    recordGcbOperationLog_({
      category: "REPORT",
      operation: "CLEANUP_OLD_REPORTS",
      status: "FAILED",
      trigger: "SCHEDULED_OR_MANUAL",
      durationMs: Date.now() - startedAt,
      message: "Old report cleanup failed.",
      error: String(error?.message || error),
    });

    throw error;
  }
}

function cleanupOldReportsInternal() {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 3);

  const managers = getBackupManagers_();

  let processed = 0;
  let deleted = 0;
  let kept = 0;
  let missing = 0;
  let managerErrors = 0;

  // Prevent duplicate processing if folders are accidentally shared.
  const processedFileIds = new Set();

  managers.forEach((manager) => {
    try {
      const workspace = getManagerReportWorkspace_(manager);
      const reportsFolder = getReportFolder(workspace);
      const files = reportsFolder.getFiles();

      while (files.hasNext()) {
        const file = files.next();

        try {
          if (file.isTrashed()) {
            continue;
          }

          const fileId = file.getId();

          if (processedFileIds.has(fileId)) {
            continue;
          }

          processedFileIds.add(fileId);
          processed++;

          // Includes PDFs, CSVs, spreadsheets, and other direct files.
          // The configured manager Reports Folder defines the scope.
          if (file.getDateCreated() < cutoff) {
            file.setTrashed(true);
            deleted++;
          } else {
            kept++;
          }
        } catch (error) {
          missing++;

          recordGcbOperationLog_({
            category: "REPORT",
            operation: "CLEANUP_REPORT_FILE",
            status: "FAILED",
            trigger: "SCHEDULED_OR_MANUAL",
            target: manager.managerId,
            processed: 1,
            failed: 1,
            message:
              "Unable to process a file in the manager's Reports Folder.",
            error: String(error?.message || error),
          });
        }
      }
    } catch (error) {
      managerErrors++;

      recordGcbOperationLog_({
        category: "REPORT",
        operation: "CLEANUP_MANAGER_REPORTS",
        status: "FAILED",
        trigger: "SCHEDULED_OR_MANUAL",
        target: manager.managerId,
        processed: 0,
        failed: 1,
        message: "Unable to clean up files for this manager.",
        error: String(error?.message || error),
      });
    }
  });

  const result = {
    processed,
    deleted,
    kept,
    missing,
    managerErrors,
  };

  Logger.log(JSON.stringify(result));
  return result;
}

function getReportFolder(workspace) {
  const folderId = String(workspace?.reportsFolderId || "").trim();

  if (!folderId) {
    throw new Error(
      `No Reports Folder ID is configured for manager "${workspace?.managerId || "unknown"}".`,
    );
  }

  let folder;

  try {
    folder = DriveApp.getFolderById(folderId);

    if (folder.isTrashed()) {
      throw new Error("The configured reports folder is in the trash.");
    }

    folder.getName();
  } catch (error) {
    throw new Error(
      `Unable to access the reports folder for manager "${workspace?.managerId || "unknown"}": ` +
        `${error?.message || error}`,
    );
  }

  return folder;
}

function saveReportPDF(config, workspace) {
  const startedAt = Date.now();
  const reportType = String(config?.reportType || "UNKNOWN")
    .trim()
    .toUpperCase();

  try {
    if (!workspace?.managerId || !workspace?.spreadsheet) {
      throw new Error(
        "A valid manager workspace is required to generate a report.",
      );
    }

    const fileUrl = saveReportPDFInternal(config, workspace);

    recordGcbOperationLog_({
      category: "REPORT",
      operation: "GENERATE_PDF",
      status: "SUCCESS",
      trigger: "MANUAL_OR_SCHEDULED",
      durationMs: Date.now() - startedAt,
      processed: 1,
      succeeded: 1,
      target: reportType,
      message: "Report PDF generated successfully.",
    });

    return fileUrl;
  } catch (error) {
    recordGcbOperationLog_({
      category: "REPORT",
      operation: "GENERATE_PDF",
      status: "FAILED",
      trigger: "MANUAL_OR_SCHEDULED",
      durationMs: Date.now() - startedAt,
      processed: 1,
      failed: 1,
      target: reportType,
      message: "Report PDF generation failed.",
      error: String(error?.message || error),
    });

    throw error;
  }
}

function saveReportPDFInternal(config, workspace) {
  Validation.requireObject(config, "Report configuration");

  if (!workspace?.managerId || !workspace?.spreadsheet) {
    throw new Error("A valid manager workspace is required.");
  }

  const ss = workspace.spreadsheet;

  const reportType = String(config.reportType || "")
    .trim()
    .toLowerCase();

  Validation.enumValue(reportType, "report type", ["monthly", "yearly"]);

  const reportSheetName = Validation.requiredString(
    config.reportSheet,
    "Report sheet",
    { maxLength: 100 },
  );

  const logSheetName = Validation.requiredString(
    config.logSheet,
    "Report log sheet",
    { maxLength: 100 },
  );

  const latestLinkCell = config.latestLinkCell
    ? Validation.requiredString(config.latestLinkCell, "Latest link cell", {
        maxLength: 20,
        rejectFormula: false,
      })
    : "";

  const sheet = ss.getSheetByName(reportSheetName);

  if (!sheet) {
    throw new Error(`Report sheet "${reportSheetName}" not found.`);
  }

  const reportLogSheet = ss.getSheetByName(logSheetName);

  if (!reportLogSheet) {
    throw new Error(`Report log sheet "${logSheetName}" not found.`);
  }

  const folder = getReportFolder(workspace);

  const reportNum = sheet.getRange("G1").getValue();
  const reportName = sheet.getRange("B1").getValue();
  const pdfName = `${reportType}Report_${reportNum}_${reportName}.pdf`;

  const range = sheet.getDataRange();
  const originalValues = range.getValues();
  const formulas = range.getFormulas();
  const wasHidden = sheet.isSheetHidden();

  let blob = null;
  let success = false;
  let createdNewFile = false;

  try {
    if (wasHidden) {
      sheet.showSheet();
      SpreadsheetApp.flush();
      Utilities.sleep(1000);
    }

    // Preserve the existing export behavior: temporarily freeze formulas.
    range.setValues(range.getDisplayValues());
    SpreadsheetApp.flush();
    Utilities.sleep(5000);

    const gid = sheet.getSheetId();

    const url =
      `https://docs.google.com/spreadsheets/d/${ss.getId()}/export` +
      `?exportFormat=pdf` +
      `&format=pdf` +
      `&gid=${gid}` +
      `&portrait=true` +
      `&size=A4` +
      `&sheetnames=false` +
      `&printtitle=false` +
      `&pagenumbers=false` +
      `&gridlines=false` +
      `&fzr=false`;

    const token = ScriptApp.getOAuthToken();

    // Primary export: retry up to three times.
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = UrlFetchApp.fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          muteHttpExceptions: true,
        });

        if (response.getResponseCode() === 200) {
          blob = response.getBlob().setName(pdfName);
          success = true;

          logResponse(`Success on primary PDF export, attempt ${attempt}.`);
          break;
        }

        logResponse(
          `Primary PDF export attempt ${attempt} failed ` +
            `(${response.getResponseCode()}): ${response.getContentText()}`,
        );
      } catch (error) {
        logResponse(
          `Primary PDF export attempt ${attempt} error: ${error?.message || error}`,
        );
      }

      if (attempt < 3) {
        Utilities.sleep(2000);
      }
    }

    if (!success) {
      logResponse("Primary PDF export failed. Trying fallback 1.");

      try {
        blob = saveReportPDF_Fallback1(config, pdfName, workspace);

        if (blob) {
          success = true;
        }
      } catch (error) {
        logResponse(`Fallback 1 failed: ${error?.message || error}`);
      }
    }

    if (!success) {
      logResponse("Fallback 1 failed. Trying fallback 2.");

      try {
        blob = saveReportPDF_Fallback2(config, pdfName, workspace);

        if (blob) {
          success = true;
        }
      } catch (error) {
        logResponse(`Fallback 2 failed: ${error?.message || error}`);
      }
    }

    if (!success || !blob) {
      throw new Error("Failed to export PDF after all attempts.");
    }

    const operationKey = String(config.operationKey || "").trim();
    const operationRow = Number(config.operationRow) || 0;

    let file;
    let fileUrl;

    if (operationKey && operationRow >= 2) {
      const savedKey = String(
        reportLogSheet.getRange(operationRow, 5).getDisplayValue(),
      ).trim();

      const savedStatus = String(
        reportLogSheet.getRange(operationRow, 6).getDisplayValue(),
      ).trim();

      if (savedKey !== operationKey || savedStatus !== "PROCESSING") {
        throw new Error(
          "The reserved PDF operation record is missing or has changed.",
        );
      }

      // Search only this manager's Reports Folder.
      file = findCustomReportFileByOperationKey_(workspace, operationKey);

      if (!file) {
        file = folder.createFile(blob);
        createdNewFile = true;
        markCustomReportFile_(file, operationKey);
      }

      fileUrl = file.getUrl();

      reportLogSheet
        .getRange(operationRow, 1, 1, 7)
        .setValues([
          [
            new Date(),
            reportNum,
            reportName,
            fileUrl,
            operationKey,
            "COMPLETED",
            file.getId(),
          ],
        ]);
    } else {
      file = folder.createFile(blob);
      createdNewFile = true;
      fileUrl = file.getUrl();

      reportLogSheet.appendRow([new Date(), reportNum, reportName, fileUrl]);
    }

    if (latestLinkCell) {
      const labSheet = ss.getSheetByName("Lab 3.0");

      if (!labSheet) {
        throw new Error(
          `Manager ${workspace.managerId} is missing the "Lab 3.0" sheet.`,
        );
      }

      // Update the latest report link in this manager's spreadsheet only.
      labSheet.getRange(latestLinkCell).setValue(fileUrl);

      // Scheduled monthly: AX27 -> AX30
      // Scheduled yearly:  AY27 -> AY30
      // Custom monthly/yearly: AZ27/BA27 -> AZ30
      const normalizedLinkCell = latestLinkCell.toUpperCase();

      const counterCellByLinkCell = {
        AX27: "AX30",
        AY27: "AY30",
        AZ27: "AZ30",
        BA27: "AZ30",
      };

      const counterCell = counterCellByLinkCell[normalizedLinkCell];

      if (!counterCell) {
        throw new Error(
          `No report counter is configured for latest-link cell "${latestLinkCell}".`,
        );
      }

      // Do not count a custom report twice when recovering an existing operation.
      if (createdNewFile) {
        const counterRange = labSheet.getRange(counterCell);
        const currentCount = Number(counterRange.getValue()) || 0;

        counterRange.setValue(currentCount + 1);
      }

      SpreadsheetApp.flush();
    }

    logResponse(
      `PDF saved successfully for manager ${workspace.managerId}: ${fileUrl}`,
    );

    return fileUrl;
  } finally {
    range.setValues(originalValues);

    formulas.forEach((row, rowIndex) => {
      row.forEach((formula, columnIndex) => {
        if (formula) {
          sheet.getRange(rowIndex + 1, columnIndex + 1).setFormula(formula);
        }
      });
    });

    SpreadsheetApp.flush();

    if (wasHidden && !sheet.isSheetHidden()) {
      sheet.hideSheet();
    }
  }
}

function getCustomReportOperationMarker_(operationKey) {
  return `GCB_REPORT_OPERATION_KEY=${encodeURIComponent(operationKey)}`;
}

function findCustomReportFileByOperationKey_(workspace, operationKey) {
  if (!workspace?.managerId || !workspace?.spreadsheet) {
    throw new Error(
      "A valid manager workspace is required for report recovery.",
    );
  }

  if (!operationKey) {
    return null;
  }

  const folder = getReportFolder(workspace);
  const marker = getCustomReportOperationMarker_(operationKey);
  const files = folder.getFiles();

  while (files.hasNext()) {
    const file = files.next();

    if (file.isTrashed()) {
      continue;
    }

    const description = String(file.getDescription() || "");
    const markers = description.split(/\r?\n/);

    if (markers.includes(marker)) {
      return file;
    }
  }

  return null;
}

function markCustomReportFile_(file, operationKey) {
  const marker = getCustomReportOperationMarker_(operationKey);
  const description = String(file.getDescription() || "");
  const markers = description.split(/\r?\n/);

  if (!markers.includes(marker)) {
    file.setDescription(description ? `${description}\n${marker}` : marker);
  }

  return file;
}

function recoverCustomReportOperation_(workspace, sheet, operation) {
  if (!workspace?.managerId || !workspace?.spreadsheet) {
    throw new Error(
      "A valid manager workspace is required for report recovery.",
    );
  }

  if (!operation?.row || !operation.operationKey) {
    return null;
  }

  let file = null;

  if (operation.fileId) {
    try {
      const candidate = DriveApp.getFileById(operation.fileId);

      if (!candidate.isTrashed()) {
        // Confirm the file belongs to this manager's Reports Folder.
        const folderId = getReportFolder(workspace).getId();
        const parents = candidate.getParents();

        while (parents.hasNext()) {
          if (parents.next().getId() === folderId) {
            file = candidate;
            break;
          }
        }
      }
    } catch (_) {
      file = null;
    }
  }

  if (!file) {
    file = findCustomReportFileByOperationKey_(
      workspace,
      operation.operationKey,
    );
  }

  if (!file || file.isTrashed()) {
    return null;
  }

  const marker = getCustomReportOperationMarker_(operation.operationKey);
  const markers = String(file.getDescription() || "").split(/\r?\n/);

  if (!markers.includes(marker)) {
    return null;
  }

  const fileUrl = file.getUrl();

  sheet
    .getRange(operation.row, 1, 1, 7)
    .setValues([
      [
        operation.date || new Date(),
        operation.reportNum,
        operation.reportName,
        fileUrl,
        operation.operationKey,
        "COMPLETED",
        file.getId(),
      ],
    ]);

  SpreadsheetApp.flush();

  return {
    success: true,
    reusedExisting: true,
    reportName: String(operation.reportName || ""),
    reportNum: operation.reportNum,
    reportUrl: fileUrl,
    reportId: file.getId(),
  };
}

function saveMonthlyReportPDF() {
  return saveScheduledReportsForManagers_({
    reportType: "Monthly",
    reportSheet: "Monthly Report PDF",
    logSheet: "MonthlyReport_Log",
    latestLinkCell: "AX27",
  });
}

function saveYearlyReportPDF() {
  return saveScheduledReportsForManagers_({
    reportType: "Yearly",
    reportSheet: "Yearly Report PDF",
    logSheet: "YearlyReport_Log",
    latestLinkCell: "AY27",
  });
}

function saveScheduledReportsForManagers_(config) {
  const managers = getBackupManagers_();
  const results = [];

  managers.forEach((manager) => {
    try {
      const workspace = getManagerReportWorkspace_(manager);

      const reportUrl = saveReportPDF(config, workspace);

      results.push({
        managerId: manager.managerId,
        success: true,
        reportUrl,
      });
    } catch (error) {
      const message = String(error?.message || error);

      results.push({
        managerId: manager.managerId,
        success: false,
        error: message,
      });

      recordGcbOperationLog_({
        category: "REPORT",
        operation: `SAVE_${String(config.reportType).toUpperCase()}_REPORT`,
        status: "FAILED",
        trigger: "SCHEDULED_REPORT",
        processed: 1,
        failed: 1,
        target: manager.managerId,
        message: "Scheduled report generation failed for this manager.",
        error: message,
      });
    }
  });

  return {
    success: results.every((result) => result.success),
    processed: results.length,
    succeeded: results.filter((result) => result.success).length,
    failed: results.filter((result) => !result.success).length,
    results,
  };
}

function saveCustomReportPDF(sessionId, signature, type) {
  const { workspace } = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "reports.generate",
  );

  const reportType = Validation.enumValue(type, "Report type", [
    "monthly",
    "yearly",
  ]);

  enforceUserRateLimit("report_generation", sessionId, 3, 60);
  enforceGlobalRateLimit("report_generation", 5, 60);

  SpreadsheetApp.flush();
  Utilities.sleep(5000);
  SpreadsheetApp.flush();

  const configs = {
    monthly: {
      reportType: "monthly",
      reportSheet: "Monthly Report PDF Generator",
      logSheet: "MonthlyReport_Log",
      latestLinkCell: "AZ27",
    },
    yearly: {
      reportType: "yearly",
      reportSheet: "Yearly Report PDF Generator",
      logSheet: "YearlyReport_Log",
      latestLinkCell: "BA27",
    },
  };

  const config = configs[reportType];

  return saveReportPDF(config, workspace);
}

function updateCustomReportPDF(sessionId, signature, type, month, year) {
  const { spreadsheet: ss } = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "reports.generate",
  );

  const reportType = Validation.enumValue(type, "report type", [
    "monthly",
    "yearly",
  ]);

  const reportYear = Validation.number(year, "Report year", {
    min: 2024,
    max: new Date().getFullYear(),
  });

  const settings = ss.getSheetByName("Settings");

  if (!settings) {
    throw new Error('Sheet "Settings" not found.');
  }

  if (reportType === "monthly") {
    const reportMonth = Validation.requiredString(month, "Report month", {
      maxLength: 20,
    });

    const validation = validateCustomMonthlyReport(
      sessionId,
      signature,
      reportMonth,
      reportYear,
      ss,
    );

    if (!validation.valid) {
      throw new Error(validation.message);
    }

    settings.getRange("A3").setValue(reportMonth);
    settings.getRange("A5").setValue(reportYear);
  } else {
    const validation = validateCustomYearlyReport(
      sessionId,
      signature,
      reportYear,
      ss,
    );

    if (!validation.valid) {
      throw new Error(validation.message);
    }

    settings.getRange("A11").setValue(reportYear);
  }

  SpreadsheetApp.flush();

  return true;
}

function isReportReady(type = "monthly", spreadsheet) {
  if (!spreadsheet) {
    throw new Error("A manager spreadsheet is required.");
  }

  const settings = spreadsheet.getSheetByName("Settings");

  if (!settings) {
    throw new Error('Sheet "Settings" not found.');
  }

  const configs = {
    monthly: {
      generatorSheet: "Month Log Generator",
      pdfSheet: "Monthly Report PDF Generator",
      expectedTitle: () =>
        `${settings.getRange("A3").getDisplayValue().trim()} ${settings.getRange("A5").getDisplayValue().trim()}`,
    },

    yearly: {
      generatorSheet: "Year Log Generator",
      pdfSheet: "Yearly Report PDF Generator",
      expectedTitle: () => settings.getRange("A11").getDisplayValue().trim(),
    },
  };

  const config = configs[type];

  if (!config) {
    throw new Error(`Unknown report type: ${type}`);
  }

  const generator = spreadsheet.getSheetByName(config.generatorSheet);
  const pdf = spreadsheet.getSheetByName(config.pdfSheet);

  if (!generator || !pdf) {
    throw new Error(`Required sheets for "${type}" report not found.`);
  }

  const expectedTitle = config.expectedTitle();

  if (!expectedTitle) {
    return false;
  }

  const actualTitle = pdf.getRange("B1").getDisplayValue().trim();

  if (!actualTitle.includes(expectedTitle)) {
    return false;
  }

  const generatorClients = generator
    .getRange("J3:J")
    .getDisplayValues()
    .flat()
    .map((value) => String(value).trim())
    .filter(Boolean);

  const pdfClients = pdf
    .getRange("C5:C")
    .getDisplayValues()
    .flat()
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (generatorClients.length !== pdfClients.length) {
    return false;
  }

  return generatorClients.every(
    (client, index) => client === pdfClients[index],
  );
}

function saveReportPDF_Fallback1(config, pdfName, workspace) {
  const ss = workspace?.spreadsheet;

  if (!workspace?.managerId || !ss) {
    throw new Error("A valid manager workspace is required for PDF export.");
  }

  const sourceSheet = ss.getSheetByName(config.reportSheet);
  const tempName = `TempExport_${Date.now()}`;
  const tempSS = SpreadsheetApp.create(tempName);
  const tempId = tempSS.getId();

  try {
    // 🚀 copy full sheet with styles
    const defaultSheet = tempSS.getSheets()[0];

    const copiedSheet = sourceSheet.copyTo(tempSS);
    copiedSheet.setName("Report");
    copiedSheet.showSheet();
    tempSS.setActiveSheet(copiedSheet);

    SpreadsheetApp.flush();

    tempSS.deleteSheet(defaultSheet);

    // remove any broken references (to avoid #REF in pdf)
    const range = copiedSheet.getDataRange();
    range.setValues(range.getDisplayValues());

    SpreadsheetApp.flush();
    Utilities.sleep(2500);

    // 🧾 export as pdf
    const exportUrl =
      `https://docs.google.com/spreadsheets/d/${tempId}/export` +
      `?exportFormat=pdf&format=pdf&portrait=true&size=A4&sheetnames=false&printtitle=false` +
      `&pagenumbers=false&gridlines=false&fzr=false`;

    const token = ScriptApp.getOAuthToken();
    let blob = null;

    for (let i = 1; i <= 3; i++) {
      const res = UrlFetchApp.fetch(exportUrl, {
        headers: { Authorization: `Bearer ${token}` },
        muteHttpExceptions: true,
      });
      if (res.getResponseCode() === 200) {
        blob = res.getBlob().setName(pdfName);
        logResponse(`✅ Fallback 1 (sheet copy) success on attempt ${i}`);
        break;
      } else {
        logResponse(`Fallback 1 Attempt ${i} failed: ${res.getResponseCode()}`);
        Utilities.sleep(1500);
      }
    }

    if (!blob) throw new Error("Fallback 1 export failed.");

    DriveApp.getFileById(tempId).setTrashed(true);
    return blob;
  } catch (err) {
    logResponse("❌ Fallback 1 error: " + err.message);
    try {
      DriveApp.getFileById(tempId).setTrashed(true);
    } catch (_) {}
    throw err;
  }
}

function saveReportPDF_Fallback2(config, pdfName, workspace) {
  const ss = workspace?.spreadsheet;

  if (!workspace?.managerId || !ss) {
    throw new Error("A valid manager workspace is required for PDF export.");
  }

  const sheet = ss.getSheetByName(config.reportSheet);

  const range = sheet.getDataRange();
  const formulas = range.getFormulas();

  const wasHidden = sheet.isSheetHidden();

  try {
    if (wasHidden) {
      sheet.showSheet();
      SpreadsheetApp.flush();
      Utilities.sleep(1000);
    }

    range.setValues(range.getDisplayValues());
    SpreadsheetApp.flush();

    const gid = sheet.getSheetId();

    const exportUrl =
      `https://docs.google.com/spreadsheets/d/${ss.getId()}/export` +
      `?exportFormat=pdf&format=pdf&gid=${gid}` +
      `&portrait=true&size=A4&sheetnames=false&printtitle=false` +
      `&pagenumbers=false&gridlines=false&fzr=false`;

    const token = ScriptApp.getOAuthToken();

    // refresh...
    // export...
    // return blob...
  } finally {
    range.setFormulas(formulas);

    SpreadsheetApp.flush();

    if (wasHidden) {
      sheet.hideSheet();
    }
  }
}

function generateCustomReportPDF(
  sessionId,
  signature,
  type,
  month,
  year,
  requestId,
) {
  const { workspace, spreadsheet: ss } = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "reports.generate",
  );

  const reportType = Validation.enumValue(type, "Report type", [
    "monthly",
    "yearly",
  ]);

  const stableRequestId = Validation.requiredString(requestId, "Request ID", {
    maxLength: 200,
  });

  const operationKey = `${sessionId}:${stableRequestId}`;

  const configs = {
    monthly: {
      reportType: "monthly",
      reportSheet: "Monthly Report PDF Generator",
      logSheet: "MonthlyReport_Log",
      latestLinkCell: "AZ27",
    },
    yearly: {
      reportType: "yearly",
      reportSheet: "Yearly Report PDF Generator",
      logSheet: "YearlyReport_Log",
      latestLinkCell: "BA27",
    },
  };

  const config = configs[reportType];

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const logSheet = ss.getSheetByName(config.logSheet);

    if (!logSheet) {
      throw new Error(`Report log sheet "${config.logSheet}" not found.`);
    }

    ensureCustomReportOperationColumns_(logSheet);

    // Idempotency check must happen before rate limiting.
    const existingOperation = findCustomReportOperation_(
      logSheet,
      operationKey,
    );

    if (existingOperation?.status === "COMPLETED") {
      return {
        ...getCompletedCustomReportResult_(workspace, existingOperation),
        type: reportType,
      };
    }

    if (existingOperation?.status === "PROCESSING") {
      const recovered = recoverCustomReportOperation_(
        workspace,
        logSheet,
        existingOperation,
      );

      if (recovered) {
        return {
          ...recovered,
          type: reportType,
        };
      }

      throw new Error(
        "This report request is still marked PROCESSING, but no matching saved PDF could be verified. " +
          "The operation requires reconciliation before it can be retried safely.",
      );
    }

    if (existingOperation) {
      throw new Error(
        `This report request has status "${existingOperation.status || "UNKNOWN"}". ` +
          "Reconcile the operation before retrying.",
      );
    }

    enforceUserRateLimit("report_generation", sessionId, 3, 60);
    enforceGlobalRateLimit("report_generation", 5, 60);

    const settings = ss.getSheetByName("Settings");

    if (!settings) {
      throw new Error('Sheet "Settings" not found.');
    }

    const reportYear = Validation.number(year, "Report year", {
      min: 2024,
      max: new Date().getFullYear(),
    });

    if (reportType === "monthly") {
      const reportMonth = Validation.requiredString(month, "Report month", {
        maxLength: 20,
      });

      const validation = validateCustomMonthlyReport(
        sessionId,
        signature,
        reportMonth,
        reportYear,
        ss,
      );

      if (!validation.valid) {
        throw new Error(validation.message);
      }

      settings.getRange("A3").setValue(reportMonth);
      settings.getRange("A5").setValue(reportYear);
    } else {
      const validation = validateCustomYearlyReport(
        sessionId,
        signature,
        reportYear,
        ss,
      );

      if (!validation.valid) {
        throw new Error(validation.message);
      }

      settings.getRange("A11").setValue(reportYear);
    }

    SpreadsheetApp.flush();

    // Wait for the matching report to finish updating.
    // The lock protects the shared Settings/report-sheet workflow.
    const maxAttempts = 60;
    const checkIntervalMs = 5000;
    let ready = false;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (isReportReady(reportType, ss)) {
        ready = true;
        break;
      }

      Utilities.sleep(checkIntervalMs);
    }

    if (!ready) {
      // No file creation has been attempted yet. Do not leave a
      // PROCESSING record; a deliberate retry can start cleanly.
      throw new Error(
        "Timed out waiting for the report to become ready. No PDF save was attempted.",
      );
    }

    // Record the operation before attempting to create the file.
    // If execution becomes uncertain, retries will not blindly create
    // another PDF.
    const reportSheet = ss.getSheetByName(config.reportSheet);

    if (!reportSheet) {
      throw new Error(`Report sheet "${config.reportSheet}" not found.`);
    }

    const reportNum = reportSheet.getRange("G1").getValue();
    const reportName = reportSheet.getRange("B1").getValue();

    const operationRow = logSheet.getLastRow() + 1;

    logSheet
      .getRange(operationRow, 1, 1, 7)
      .setValues([
        [new Date(), reportNum, reportName, "", operationKey, "PROCESSING", ""],
      ]);

    SpreadsheetApp.flush();

    // saveReportPDF() will be updated in Step 2 to pass this
    // operation key and reserved row through to the file-save logic.
    const fileUrl = saveReportPDF(
      {
        ...config,
        operationKey,
        operationRow,
      },
      workspace,
    );

    const operation = findCustomReportOperation_(logSheet, operationKey);

    if (
      !operation ||
      operation.status !== "COMPLETED" ||
      !operation.fileId ||
      operation.fileUrl !== fileUrl
    ) {
      throw new Error(
        "The PDF save returned, but the operation log was not completed correctly. Reconcile the operation before retrying.",
      );
    }

    return {
      success: true,
      reusedExisting: false,
      type: reportType,
      reportName: String(operation.reportName || ""),
      reportNum: operation.reportNum,
      reportUrl: operation.fileUrl,
      reportId: operation.fileId,
      year: reportYear,
      ...(reportType === "monthly" ? { month: String(month).trim() } : {}),
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Finds a custom PDF generation operation by its stable request ID.
 *
 * Existing report history remains in columns A:D.
 * Operation tracking uses columns E:G:
 * E = Operation Key
 * F = Operation Status
 * G = Drive File ID
 */
function findCustomReportOperation_(sheet, operationKey) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return null;
  }

  // Read only the operation-tracking column.
  const keys = sheet.getRange(2, 5, lastRow - 1, 1).getDisplayValues();

  for (let i = keys.length - 1; i >= 0; i--) {
    if (keys[i][0] === operationKey) {
      const row = i + 2;

      return {
        row,
        operationKey,
        date: sheet.getRange(row, 1).getValue(),
        reportNum: sheet.getRange(row, 2).getValue(),
        reportName: sheet.getRange(row, 3).getValue(),
        fileUrl: sheet.getRange(row, 4).getValue(),
        status: sheet.getRange(row, 6).getDisplayValue(),
        fileId: sheet.getRange(row, 7).getDisplayValue(),
      };
    }
  }

  return null;
}

/**
 * Ensures operation tracking columns exist without changing
 * the existing report-history columns A:D.
 */
function ensureCustomReportOperationColumns_(sheet) {
  sheet
    .getRange(1, 5, 1, 3)
    .setValues([["Operation Key", "Operation Status", "Drive File ID"]]);
}

function getCompletedCustomReportResult_(workspace, operation) {
  if (!workspace?.managerId || !workspace?.spreadsheet) {
    throw new Error("A valid manager workspace is required.");
  }

  if (!operation?.fileId || !operation?.fileUrl) {
    throw new Error(
      "The report operation is marked completed but its saved file details are missing. " +
        "Reconcile the report before retrying.",
    );
  }

  let file;

  try {
    file = DriveApp.getFileById(operation.fileId);
  } catch (_) {
    throw new Error(
      "The previously generated report file is unavailable. " +
        "Reconcile the report before retrying.",
    );
  }

  if (file.isTrashed() || file.getUrl() !== operation.fileUrl) {
    throw new Error(
      "The previously generated report file is unavailable. " +
        "Reconcile the report before retrying.",
    );
  }

  const folderId = getReportFolder(workspace).getId();
  const parents = file.getParents();
  let belongsToManager = false;

  while (parents.hasNext()) {
    if (parents.next().getId() === folderId) {
      belongsToManager = true;
      break;
    }
  }

  if (!belongsToManager) {
    throw new Error(
      "The saved report does not belong to this manager's Reports Folder. " +
        "Reconcile the report before retrying.",
    );
  }

  const marker = getCustomReportOperationMarker_(operation.operationKey);

  const markers = String(file.getDescription() || "").split(/\r?\n/);

  if (!markers.includes(marker)) {
    throw new Error(
      "The saved PDF does not contain the expected operation marker. " +
        "Reconcile the report before retrying.",
    );
  }

  return {
    success: true,
    reusedExisting: true,
    reportName: String(operation.reportName || ""),
    reportNum: operation.reportNum,
    reportUrl: operation.fileUrl,
    reportId: operation.fileId,
  };
}

function sendReport(config, workspace) {
  if (!workspace?.managerId || !workspace?.spreadsheet) {
    throw new Error("A valid manager workspace is required.");
  }

  const ss = workspace.spreadsheet;
  const sheet = ss.getSheetByName("Lab 3.0");

  if (!sheet) {
    throw new Error(
      `Sheet "Lab 3.0" not found for manager "${workspace.managerId}".`,
    );
  }

  const properties = PropertiesService.getScriptProperties();

  const webhookPropertyKey = getManagerIntegrationPropertyKey_(
    workspace.managerId,
    "DISCORD_WEBHOOK_URL",
  );

  const emailPropertyKey = getManagerIntegrationPropertyKey_(
    workspace.managerId,
    "NOTIFICATION_EMAIL",
  );

  const webhookUrl = String(
    properties.getProperty(webhookPropertyKey) || "",
  ).trim();

  const emailTo = String(properties.getProperty(emailPropertyKey) || "").trim();

  const reportLink = String(
    sheet.getRange(config.latestLinkCell).getDisplayValue() || "",
  ).trim();

  if (!reportLink) {
    throw new Error(
      `No ${config.reportType} report link found for manager "${workspace.managerId}".`,
    );
  }

  const now = new Date();
  const formatted = formatDateSafe(now, "MMMM dd, yyyy HH:mm:ss");

  const embed = {
    title: `${config.reportType} Report - ${formatted}`,
    description: `**${config.reportType} Report:**\n${reportLink}`,
    color: config.color,
    timestamp: now.toISOString(),
  };

  const result = {
    managerId: workspace.managerId,
    discord: "SKIPPED",
    email: "SKIPPED",
  };

  // Discord notification.
  if (webhookUrl) {
    try {
      sendDiscordMessage(webhookUrl, embed);
      result.discord = "SUCCESS";

      recordGcbOperationLog_({
        category: "DISCORD",
        operation: "SEND_REPORT_NOTIFICATION",
        status: "SUCCESS",
        trigger: "REPORT_WORKFLOW",
        processed: 1,
        succeeded: 1,
        target: workspace.managerId,
        message: `${config.reportType} report notification sent to Discord.`,
      });
    } catch (error) {
      result.discord = "FAILED";

      recordGcbOperationLog_({
        category: "DISCORD",
        operation: "SEND_REPORT_NOTIFICATION",
        status: "FAILED",
        trigger: "REPORT_WORKFLOW",
        processed: 1,
        failed: 1,
        target: workspace.managerId,
        message: `${config.reportType} report notification failed on Discord.`,
        error: String(error?.message || error),
      });
    }
  }

  // Email notification.
  if (emailTo) {
    try {
      MailApp.sendEmail({
        to: emailTo,
        subject: `${config.reportType} Report - ${formatted}`,
        htmlBody: `
          <p>Hello,</p>
          <p>Your latest <b>${config.reportType}</b> report is ready.</p>
          <p><a href="${reportLink}">View ${config.reportType} Report</a></p>
          <p>Generated on ${formatted}</p>
        `,
      });

      result.email = "SUCCESS";

      recordGcbOperationLog_({
        category: "EMAIL",
        operation: "SEND_REPORT_NOTIFICATION",
        status: "SUCCESS",
        trigger: "REPORT_WORKFLOW",
        processed: 1,
        succeeded: 1,
        target: workspace.managerId,
        message: `${config.reportType} report email accepted by MailApp.`,
      });
    } catch (error) {
      result.email = "FAILED";

      recordGcbOperationLog_({
        category: "EMAIL",
        operation: "SEND_REPORT_NOTIFICATION",
        status: "FAILED",
        trigger: "REPORT_WORKFLOW",
        processed: 1,
        failed: 1,
        target: workspace.managerId,
        message: `${config.reportType} report email failed.`,
        error: String(error?.message || error),
      });
    }
  }

  return result;
}

function sendMonthlyReport(sessionId, signature) {
  const { workspace } = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "reports.view",
  );

  return sendReport(
    {
      reportType: "Monthly",
      latestLinkCell: "AX27",
      color: 0x3498db,
    },
    workspace,
  );
}

function sendYearlyReport(sessionId, signature) {
  const { workspace } = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "reports.view",
  );

  return sendReport(
    {
      reportType: "Yearly",
      latestLinkCell: "AY27",
      color: 0x2ecc71,
    },
    workspace,
  );
}

function getReportById(sessionId, signature, reportId) {
  const { spreadsheet } = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "reports.view",
  );

  return getReportByIdInternal(spreadsheet, reportId);
}

function getReportByIdInternal(spreadsheet, reportId) {
  const report = getReportLogs(spreadsheet).find(
    (item) => item.id === reportId,
  );

  if (!report) {
    throw new Error("Report not found.");
  }

  return report;
}

function checkExistingReport(sessionId, signature, type, reportName) {
  const { spreadsheet } = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "reports.view",
  );

  const normalizedType = type === "monthly" ? "Monthly" : "Yearly";

  const report = getReportLogs(spreadsheet).find((log) => {
    if (log.type !== normalizedType) {
      return false;
    }

    return normalizeText(log.name) === normalizeText(reportName);
  });

  return {
    exists: !!report,
    report: report || null,
  };
}

function getFirstAvailableReportMonth(spreadsheet) {
  if (!spreadsheet) {
    throw new Error("A manager spreadsheet is required.");
  }

  const sheet = spreadsheet.getSheetByName("Monthly Hours Log");

  if (!sheet) {
    throw new Error('Sheet "Monthly Hours Log" not found.');
  }

  const lastColumn = sheet.getLastColumn();

  if (lastColumn < 13) {
    throw new Error("No available months found in Monthly Hours Log.");
  }

  const headers = sheet
    .getRange(1, 13, 1, lastColumn - 12)
    .getDisplayValues()[0];

  const firstMonthText = headers.find((value) => value);

  if (!firstMonthText) {
    throw new Error("No available months found in Monthly Hours Log.");
  }

  const firstDate = new Date(`1 ${firstMonthText}`);

  if (isNaN(firstDate.getTime())) {
    throw new Error(
      `Invalid first month found in Monthly Hours Log: ${firstMonthText}`,
    );
  }

  firstDate.setDate(1);

  return firstDate;
}

function validateCustomMonthlyReport(
  sessionId,
  signature,
  month,
  year,
  spreadsheet,
) {
  let ss = spreadsheet;

  if (!ss) {
    const result = getManagerWorkspaceForCapability_(
      sessionId,
      signature,
      "reports.generate",
    );

    ss = result.spreadsheet;
  } else {
    requireCapability(sessionId, signature, "reports.generate");
  }

  const firstDate = getFirstAvailableReportMonth(ss);
  const selectedDate = new Date(`1 ${month} ${year}`);

  if (isNaN(selectedDate.getTime())) {
    return {
      valid: false,
      message: "Invalid month or year.",
    };
  }

  selectedDate.setDate(1);

  const today = new Date();
  const currentDate = new Date(today.getFullYear(), today.getMonth(), 1);

  if (selectedDate < firstDate) {
    return {
      valid: false,
      message:
        `Reports are only available starting from ` +
        `${formatDateSafe(firstDate, "MMMM yyyy")}.`,
    };
  }

  if (selectedDate > currentDate) {
    return {
      valid: false,
      message: "You cannot generate a report for a future month.",
    };
  }

  return { valid: true };
}

function validateCustomYearlyReport(sessionId, signature, year, spreadsheet) {
  let ss = spreadsheet;

  if (!ss) {
    const result = getManagerWorkspaceForCapability_(
      sessionId,
      signature,
      "reports.generate",
    );

    ss = result.spreadsheet;
  } else {
    requireCapability(sessionId, signature, "reports.generate");
  }

  const firstDate = getFirstAvailableReportMonth(ss);
  const firstYear = firstDate.getFullYear();
  const selectedYear = Number(year);
  const currentYear = new Date().getFullYear();

  if (!Number.isFinite(selectedYear)) {
    return {
      valid: false,
      message: "Invalid year.",
    };
  }

  if (selectedYear < firstYear) {
    return {
      valid: false,
      message: `Reports are only available starting from ${firstYear}.`,
    };
  }

  if (selectedYear > currentYear) {
    return {
      valid: false,
      message: "You cannot generate a report for a future year.",
    };
  }

  return { valid: true };
}

function getReportLogs(spreadsheet) {
  if (!spreadsheet) {
    throw new Error("Manager spreadsheet is required to read report logs.");
  }

  const sources = [
    {
      sheet: "MonthlyReport_Log",
      type: "Monthly",
      format: "report",
    },
    {
      sheet: "YearlyReport_Log",
      type: "Yearly",
      format: "report",
    },
    {
      sheet: "BillingRecordsExport_Log",
      type: "Billing",
      format: "billingExport",
    },
  ];

  const logs = [];

  sources.forEach(({ sheet: sheetName, type, format }) => {
    const sheet = spreadsheet.getSheetByName(sheetName);

    if (!sheet) return;

    const lastRow = sheet.getLastRow();

    if (lastRow <= 1) return;

    if (format === "billingExport") {
      const values = sheet.getRange(2, 1, lastRow - 1, 7).getDisplayValues();

      values.forEach(
        ([
          date,
          startDate,
          endDate,
          recordCount,
          fileName,
          fileUrl,
          fileId,
        ]) => {
          if (!date || !fileUrl || !fileId) return;

          const name = fileName
            ? String(fileName)
                .replace(/\.csv$/i, "")
                .replace(/_/g, " ")
            : startDate && endDate
              ? `Billing Records ${startDate} to ${endDate}`
              : "";

          logs.push({
            date,
            id: fileId,
            name,
            link: fileUrl,
            type,
            recordCount,
          });
        },
      );

      return;
    }

    const values = sheet.getRange(2, 1, lastRow - 1, 4).getDisplayValues();

    values.forEach(([date, id, name, link]) => {
      if (!date || !id || !link) return;

      logs.push({
        date,
        id,
        name,
        link,
        type,
      });
    });
  });

  logs.sort((a, b) => new Date(b.date) - new Date(a.date));

  return logs;
}

function getMonthlyReportHistory(sessionId, signature) {
  const { spreadsheet } = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "reports.view",
  );

  return {
    reportLogs: getReportLogs(spreadsheet).filter(
      (report) => report.type === "Monthly",
    ),
  };
}

function getYearlyReportHistory(sessionId, signature) {
  const { spreadsheet } = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "reports.view",
  );

  return {
    reportLogs: getReportLogs(spreadsheet).filter(
      (report) => report.type === "Yearly",
    ),
  };
}

function getReportsOverview(sessionId, signature) {
  const { workspace, spreadsheet: ss } = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "reports.view",
  );

  const recentLogs = getReportLogs(ss);

  // Manager-specific analytics sheet.
  const analytics = ss.getSheetByName("Lab 3.0");

  const getAnalyticsValue = (cell, fallback = 0) => {
    if (!analytics) return fallback;

    const value = analytics.getRange(cell).getValue();

    return value === "" || value === null ? fallback : value;
  };

  const monthlyCount = Number(getAnalyticsValue("AX30", 0)) || 0;
  const yearlyCount = Number(getAnalyticsValue("AY30", 0)) || 0;
  const pdfGenerated = Number(getAnalyticsValue("AZ30", 0)) || 0;

  const properties = PropertiesService.getScriptProperties();

  const notificationEmailKey = getManagerIntegrationPropertyKey_(
    workspace.managerId,
    "NOTIFICATION_EMAIL",
  );

  const discordWebhookKey = getManagerIntegrationPropertyKey_(
    workspace.managerId,
    "DISCORD_WEBHOOK_URL",
  );

  const email = Boolean(
    String(properties.getProperty(notificationEmailKey) || "").trim(),
  );

  const discord = Boolean(
    String(properties.getProperty(discordWebhookKey) || "").trim(),
  );

  let driveStorage = false;

  try {
    getReportFolder(workspace);
    driveStorage = true;
  } catch (error) {
    Logger.log(
      `Reports Folder unavailable for ${workspace.managerId}: ` +
        String(error?.message || error),
    );
  }

  const automationActive = driveStorage && discord && email;

  const today = new Date();
  const nextMonthly = new Date(today.getFullYear(), today.getMonth(), 15);

  if (today.getDate() >= 15) {
    nextMonthly.setMonth(nextMonthly.getMonth() + 1);
  }

  return {
    logs: recentLogs,

    counts: {
      monthly: monthlyCount,
      yearly: yearlyCount,
      pdfGenerated,
      automation: automationActive,
    },

    discord,
    email,
    driveStorage,

    nextScheduled: Utilities.formatDate(
      nextMonthly,
      Session.getScriptTimeZone(),
      "MMMM dd, yyyy",
    ),
  };
}
