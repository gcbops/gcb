function cleanupOldReports() {
  const startedAt = Date.now();

  try {
    const result = cleanupOldReportsInternal();

    recordGcbOperationLog_({
      category: "REPORT",
      operation: "CLEANUP_OLD_REPORTS",
      status: result.missing > 0 ? "PARTIAL" : "SUCCESS",
      trigger: "SCHEDULED_OR_MANUAL",
      durationMs: Date.now() - startedAt,
      processed: result.processed,
      succeeded: result.deleted + result.kept,
      failed: result.missing,
      message:
        `Deleted ${result.deleted}; kept ${result.kept}; ` +
        `missing or inaccessible ${result.missing}.`,
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

  const logs = getReportLogs();

  let processed = 0;
  let deleted = 0;
  let kept = 0;
  let missing = 0;

  logs.forEach((report) => {
    const match = report.link.match(/\/d\/([a-zA-Z0-9_-]+)/);

    if (!match) {
      return;
    }

    const fileId = match[1];

    try {
      const file = DriveApp.getFileById(fileId);

      processed++;

      if (file.getDateCreated() < cutoff) {
        file.setTrashed(true);
        deleted++;
      } else {
        kept++;
      }
    } catch (err) {
      // File may already be deleted or inaccessible.
      missing++;
    }
  });

  const result = {
    processed,
    deleted,
    kept,
    missing,
  };

  Logger.log(result);

  return result;
}

function getReportFolder() {
  const folderId =
    PropertiesService.getScriptProperties().getProperty("REPORT_FOLDER_ID");

  if (!folderId) {
    throw new Error("REPORT_FOLDER_ID is not configured.");
  }

  return DriveApp.getFolderById(folderId);
}

function saveReportPDF(config) {
  const startedAt = Date.now();
  const reportType = String(config?.reportType || "UNKNOWN")
    .trim()
    .toUpperCase();

  try {
    const fileUrl = saveReportPDFInternal(config);

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

function saveReportPDFInternal(config) {
  Validation.requireObject(config, "Report configuration");

  const reportType = String(config.reportType || "")
    .trim()
    .toLowerCase();

  Validation.enumValue(reportType, "report type", ["monthly", "yearly"]);

  const reportSheet = Validation.requiredString(
    config.reportSheet,
    "Report sheet",
    { maxLength: 100 },
  );

  const logSheet = Validation.requiredString(
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

  const ss = getSpreadsheet();
  const sheet = getSheetSafe(reportSheet);

  if (!sheet) {
    throw new Error(`Report sheet "${reportSheet}" not found.`);
  }

  const folder = getReportFolder();

  const reportNum = sheet.getRange("G1").getValue();
  const reportName = sheet.getRange("B1").getValue();
  const pdfName = `${reportType}Report_${reportNum}_${reportName}.pdf`;

  const range = sheet.getDataRange();
  const formulas = range.getFormulas();

  const wasHidden = sheet.isSheetHidden();

  let blob = null;
  let success = false;

  try {
    // 👀 Unhide temporarily if needed
    if (wasHidden) {
      sheet.showSheet();
      SpreadsheetApp.flush();
      Utilities.sleep(1000);
    }

    // Freeze formulas as values for export
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

    // ==========================
    // Try 1
    // ==========================

    for (let i = 1; i <= 3; i++) {
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

          logResponse(`✅ Success on Try 1 (attempt ${i})`);

          break;
        }

        logResponse(
          `Try 1 Attempt ${i} failed (${response.getResponseCode()})\n` +
            response.getContentText(),
        );
      } catch (err) {
        logResponse(`Try 1 Attempt ${i} error: ${err}`);
      }

      Utilities.sleep(2000);
    }

    // ==========================
    // Try 2
    // ==========================

    if (!success) {
      logResponse("⚠️ Try 1 failed. Running Fallback 1...");

      try {
        blob = saveReportPDF_Fallback1(config, pdfName);

        if (blob) {
          success = true;
          logResponse("✅ Fallback 1 succeeded!");
        }
      } catch (err) {
        logResponse("❌ Fallback 1 failed: " + err.message);
      }
    }

    // ==========================
    // Try 3
    // ==========================

    if (!success) {
      logResponse("⚠️ Fallback 1 failed. Running Fallback 2...");

      try {
        blob = saveReportPDF_Fallback2(config, pdfName);

        if (blob) {
          success = true;
          logResponse("✅ Fallback 2 succeeded!");
        }
      } catch (err) {
        logResponse("❌ Fallback 2 failed: " + err.message);
      }
    }

    if (!success) {
      throw new Error("❌ Failed to export PDF after 3 layered attempts.");
    }

    // ==========================
    // Save PDF
    // ==========================

    
    const reportLogSheet = getSheetSafe(logSheet);

    if (!reportLogSheet) {
      throw new Error(`Report log sheet "${logSheet}" not found.`);
    }

    const operationKey = String(config.operationKey || "").trim();
    const operationRow = Number(config.operationRow) || 0;

    let file;
    let fileUrl;

    if (operationKey && operationRow >= 2) {
      // Custom queued request: use its pre-reserved log row.
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

      // Create the Drive file only after validating the reserved record.
      file = findCustomReportFileByOperationKey_(operationKey);

      if (!file) {
        file = folder.createFile(blob);
        markCustomReportFile_(file, operationKey);
      }

      fileUrl = file.getUrl();

      // Write the file details and completion status to the same row.
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
      // Preserve the existing scheduled/manual report behavior.
      file = folder.createFile(blob);
      fileUrl = file.getUrl();

      reportLogSheet.appendRow([new Date(), reportNum, reportName, fileUrl]);
    }

    if (latestLinkCell) {
      getLabSheet()?.getRange(latestLinkCell).setValue(fileUrl);
    }

    const lab = getLabSheet();

    if (lab) {
      const cell = lab.getRange("AZ30");

      cell.setValue((Number(cell.getValue()) || 0) + 1);
    }

    logResponse(`✅ PDF saved successfully: ${fileUrl}`);

    return fileUrl;
  } finally {
    // Always restore formulas
    range.setFormulas(formulas);

    SpreadsheetApp.flush();

    // Restore hidden state
    if (wasHidden) {
      sheet.hideSheet();
    }
  }
}

function getCustomReportOperationMarker_(operationKey) {
  return `GCB_REPORT_OPERATION_KEY=${encodeURIComponent(operationKey)}`;
}

function findCustomReportFileByOperationKey_(operationKey) {
  if (!operationKey) {
    return null;
  }

  const folder = getReportFolder();
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

/**
 * Reconciles a previously created PDF with its reserved operation row.
 */
function recoverCustomReportOperation_(sheet, operation) {
  if (!operation?.row || !operation.operationKey) {
    return null;
  }

  let file = null;

  if (operation.fileId) {
    try {
      file = DriveApp.getFileById(operation.fileId);

      if (file.isTrashed()) {
        file = null;
      }
    } catch (_) {
      file = null;
    }
  }

  if (!file) {
    file = findCustomReportFileByOperationKey_(operation.operationKey);
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
  return saveReportPDF({
    reportType: "Monthly",
    reportSheet: "Monthly Report PDF",
    logSheet: "MonthlyReport_Log",
    latestLinkCell: "AX27",
  });
}

function saveYearlyReportPDF() {
  return saveReportPDF({
    reportType: "Yearly",
    reportSheet: "Yearly Report PDF",
    logSheet: "YearlyReport_Log",
    latestLinkCell: "AY27",
  });
}

function saveCustomReportPDF(sessionId, signature, type) {
  requireCapability(sessionId, signature, "reports.generate");

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

  const config = configs[type];

  if (!config) {
    throw new Error(`Unknown report type: ${type}`);
  }

  return saveReportPDF(config);
}

function updateCustomReportPDF(sessionId, signature, type, month, year) {
  requireCapability(sessionId, signature, "reports.generate");

  const reportType = Validation.enumValue(type, "report type", [
    "monthly",
    "yearly",
  ]);

  const reportYear = Validation.number(year, "Report year", {
    min: 2024,
    max: new Date().getFullYear(),
  });

  const settings = getSheetSafe("Settings");

  if (!settings) {
    throw new Error('Sheet "Settings" not found.');
  }

  if (reportType === "monthly") {
    const reportMonth = Validation.requiredString(month, "Report month", {
      maxLength: 20,
    });

    settings.getRange("A3").setValue(reportMonth);
    settings.getRange("A5").setValue(reportYear);
  } else {
    settings.getRange("A11").setValue(reportYear);
  }

  SpreadsheetApp.flush();

  return true;
}

function isReportReady(type = "monthly") {
  const settings = getSheetSafe("Settings");

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

  const generator = getSheetSafe(config.generatorSheet);
  const pdf = getSheetSafe(config.pdfSheet);

  if (!generator || !pdf) {
    throw new Error(`Required sheets for "${type}" report not found.`);
  }

  // Expected title
  const expectedTitle = config.expectedTitle();

  // Current PDF title
  const actualTitle = pdf.getRange("B1").getDisplayValue().trim();

  // Wait until the title has updated
  if (!actualTitle.includes(expectedTitle)) {
    return false;
  }

  // Compare client lists
  const generatorClients = generator
    .getRange("J3:J")
    .getDisplayValues()
    .flat()
    .map((v) => String(v).trim())
    .filter(Boolean);

  const pdfClients = pdf
    .getRange("C5:C")
    .getDisplayValues()
    .flat()
    .map((v) => String(v).trim())
    .filter(Boolean);

  if (generatorClients.length !== pdfClients.length) {
    return false;
  }

  return generatorClients.every((client, i) => client === pdfClients[i]);
}

function saveReportPDF_Fallback1(config, pdfName) {
  const ss = getSpreadsheet();
  const sourceSheet = getSheetSafe(config.reportSheet);
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

function saveReportPDF_Fallback2(config, pdfName) {
  const ss = getSpreadsheet();
  const sheet = getSheetSafe(config.reportSheet);

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
  requireCapability(sessionId, signature, "reports.generate");

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
    const logSheet = getSheetSafe(config.logSheet);

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
        ...getCompletedCustomReportResult_(existingOperation),
        type: reportType,
      };
    }

    if (existingOperation?.status === "PROCESSING") {
      const recovered = recoverCustomReportOperation_(logSheet, existingOperation);

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

    const settings = getSheetSafe("Settings");

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
      if (isReportReady(reportType)) {
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
    const reportSheet = getSheetSafe(config.reportSheet);

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
    const fileUrl = saveReportPDF({
      ...config,
      operationKey,
      operationRow,
    });

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
  sheet.getRange(1, 5, 1, 3).setValues([
    ["Operation Key", "Operation Status", "Drive File ID"],
  ]);
}

/**
 * Returns a completed operation's saved result.
 */
function getCompletedCustomReportResult_(operation) {
  if (!operation?.fileId || !operation?.fileUrl) {
    throw new Error(
      "The report operation is marked completed but its saved file details are missing. Reconcile the report before retrying.",
    );
  }

  const file = DriveApp.getFileById(operation.fileId);

  if (file.isTrashed() || file.getUrl() !== operation.fileUrl) {
    throw new Error(
      "The previously generated report file is unavailable. Reconcile the report before retrying.",
    );
  }

  return {
    success: true,
    reusedExisting: true,
    type: operation.reportName ? undefined : undefined,
    reportName: String(operation.reportName || ""),
    reportNum: operation.reportNum,
    reportUrl: operation.fileUrl,
    reportId: operation.fileId,
  };
}

function sendReport(config) {
  const sheet = getLabSheet();
  if (!sheet) return;

  const webhookUrl = getDiscordWebhook();
  const emailTo = getNotificationEmail();
  const reportLink = sheet.getRange(config.latestLinkCell).getValue();

  if (!reportLink) {
    throw new Error(`No ${config.reportType} report link found.`);
  }

  const now = new Date();
  const formatted = formatDateSafe(now, "MMMM dd, yyyy HH:mm:ss");

  const embed = {
    title: `📊 ${config.reportType} Report - ${formatted}`,
    description: `**${config.reportType} Report:**\n${reportLink}`,
    color: config.color,
    timestamp: now.toISOString(),
  };

  // Discord
  if (webhookUrl) {
    try {
      sendDiscordMessage(webhookUrl, embed);

      recordGcbOperationLog_({
        category: "DISCORD",
        operation: "SEND_REPORT_NOTIFICATION",
        status: "SUCCESS",
        trigger: "REPORT_WORKFLOW",
        processed: 1,
        succeeded: 1,
        target: config.reportType,
        message: "Report notification sent to Discord.",
      });
    } catch (error) {
      recordGcbOperationLog_({
        category: "DISCORD",
        operation: "SEND_REPORT_NOTIFICATION",
        status: "FAILED",
        trigger: "REPORT_WORKFLOW",
        processed: 1,
        failed: 1,
        target: config.reportType,
        message: "Discord report notification failed.",
        error: String(error?.message || error),
      });

      logResponse("Discord report notification failed.");
    }
  } else {
    logResponse("No Discord webhook configured.");
  }

  // Email
  if (emailTo) {
    try {
      MailApp.sendEmail({
        to: emailTo,
        subject: `${config.reportType} Report - ${formatted}`,
        htmlBody: `
        <p>Hey 👋,</p>
        <p>Your latest <b>${config.reportType}</b> report is ready.</p>
        <p><a href="${reportLink}">View ${config.reportType} Report</a></p>
        <p>Generated on ${formatted}</p>
      `,
      });

      recordGcbOperationLog_({
        category: "EMAIL",
        operation: "SEND_REPORT_NOTIFICATION",
        status: "SUCCESS",
        trigger: "REPORT_WORKFLOW",
        processed: 1,
        succeeded: 1,
        target: config.reportType,
        message: "Report email accepted by MailApp.",
      });
    } catch (error) {
      recordGcbOperationLog_({
        category: "EMAIL",
        operation: "SEND_REPORT_NOTIFICATION",
        status: "FAILED",
        trigger: "REPORT_WORKFLOW",
        processed: 1,
        failed: 1,
        target: config.reportType,
        message: "Report email sending failed.",
        error: String(error?.message || error),
      });

      logResponse("Report email sending failed.");
    }
  } else {
    logResponse("No notification email configured.");
  }
}

function sendMonthlyReport() {
  return sendReport({
    reportType: "Monthly",
    latestLinkCell: "AX27",
    color: 0x3498db,
  });
}

function sendYearlyReport() {
  return sendReport({
    reportType: "Yearly",
    latestLinkCell: "AY27",
    color: 0x2ecc71,
  });
}

function getReportById(reportId) {
  requireCapability(sessionId, signature, "reports.view");

  return getReportByIdInternal(reportId);
}

function getReportByIdInternal(reportId) {
  const report = getReportLogs().find((r) => r.id === reportId);

  if (!report) {
    throw new Error("Report not found.");
  }

  return report;
}

function checkExistingReport(sessionId, signature, type, reportName) {
  requireCapability(sessionId, signature, "reports.view");

  const report = getReportLogs().find((log) => {
    if (log.type !== (type === "monthly" ? "Monthly" : "Yearly")) {
      return false;
    }

    return normalizeText(log.name) === normalizeText(reportName);
  });

  return {
    exists: !!report,
    report: report || null,
  };
}

function getFirstAvailableReportMonth() {
  const sheet = getSheetSafe("Monthly Hours Log");

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

  if (isNaN(firstDate)) {
    throw new Error(
      `Invalid first month found in Monthly Hours Log: ${firstMonthText}`,
    );
  }

  firstDate.setDate(1);

  return firstDate;
}

function validateCustomMonthlyReport(sessionId, signature, month, year) {
  requireCapability(sessionId, signature, "reports.generate");

  const firstDate = getFirstAvailableReportMonth();

  const selectedDate = new Date(`1 ${month} ${year}`);

  if (isNaN(selectedDate)) {
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

  return {
    valid: true,
  };
}

function validateCustomYearlyReport(sessionId, signature, year) {
  requireCapability(sessionId, signature, "reports.generate");

  const firstDate = getFirstAvailableReportMonth();

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

  return {
    valid: true,
  };
}

function getReportLogs() {
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
    const sheet = getSheetSafe(sheetName);

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

          let name = fileName
            ? String(fileName)
                .replace(/\.csv$/i, "")
                .replace(/_/g, " ")
            : "";

          if (!name && startDate && endDate) {
            name = `Billing Records ${startDate} to ${endDate}`;
          }

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
  requireCapability(sessionId, signature, "reports.view");

  return {
    reportLogs: getReportLogs().filter((report) => report.type === "Monthly"),
  };
}

function getYearlyReportHistory(sessionId, signature) {
  requireCapability(sessionId, signature, "reports.view");

  return {
    reportLogs: getReportLogs().filter((report) => report.type === "Yearly"),
  };
}

function getReportsOverview(sessionId, signature) {
  requireCapability(sessionId, signature, "reports.view");

  const recentLogs = getReportLogs();

  const lab = getLabSheet();

  const getLabValue = (cell, fallback = null) => {
    if (!lab) return fallback;

    const value = lab.getRange(cell).getValue();

    return value === "" || value === null ? fallback : value;
  };

  const monthlyCount = Number(getLabValue("AX30", 0)) || 0;
  const yearlyCount = Number(getLabValue("AY30", 0)) || 0;
  const pdfGenerated = Number(getLabValue("AZ30", 0)) || 0;

  const properties = PropertiesService.getScriptProperties();

  const reportFolderId = String(
    properties.getProperty("REPORT_FOLDER_ID") || "",
  ).trim();

  const driveStorage = Boolean(reportFolderId);

  const discord = Boolean(getDiscordWebhook());
  const email = Boolean(getNotificationEmail());

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
