function cleanupOldReports() {
  const startedAt = Date.now();

  try {
    const result = cleanupOldReportsInternal();
    const completedAt = Date.now();

    const failed = result.missing + result.managerErrors;

    recordGcbOperationLog_({
      startedAt,
      completedAt,
      durationMs: Math.max(0, completedAt - startedAt),

      category: "REPORT",
      operation: "CLEANUP_OLD_REPORTS",
      status: failed > 0 ? "PARTIAL" : "SUCCESS",
      trigger: "SCHEDULED_OR_MANUAL",

      processed: result.processed,
      succeeded: result.deleted + result.kept,
      failed: result.missing,

      target: "ALL_MANAGERS",
      message:
        `Deleted ${result.deleted}; kept ${result.kept}; ` +
        `file errors ${result.missing}; ` +
        `manager errors ${result.managerErrors}.`,
    });

    return result;
  } catch (error) {
    const completedAt = Date.now();

    recordGcbOperationLog_({
      startedAt,
      completedAt,
      durationMs: Math.max(0, completedAt - startedAt),

      category: "REPORT",
      operation: "CLEANUP_OLD_REPORTS",
      status: "FAILED",
      trigger: "SCHEDULED_OR_MANUAL",

      target: "ALL_MANAGERS",
      message: "Old report cleanup failed.",
      error: String(error?.message || error),
    });

    throw error;
  }
}

function cleanupOldReportsInternal() {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 3);

  const managers = getManagers_();

  let processed = 0;
  let deleted = 0;
  let kept = 0;
  let missing = 0;
  let managerErrors = 0;

  // Prevent duplicate processing if folders are accidentally shared.
  const processedFileIds = new Set();

  managers.forEach((manager) => {
    const startedAt = Date.now();
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
          const completedAt = Date.now();
          missing++;

          recordGcbOperationLog_({
            startedAt,
            completedAt,
            durationMs: Math.max(0, completedAt - startedAt),

            category: "REPORT",
            operation: "CLEANUP_REPORT_FILE",
            status: "FAILED",
            trigger: "SCHEDULED_OR_MANUAL",

            managerId: manager.managerId,
            processed: 1,
            failed: 1,

            target: manager.managerId,
            message:
              "Unable to process a file in the manager's Reports Folder.",
            error: String(error?.message || error),
          });
        }
      }
    } catch (error) {
      const completedAt = Date.now();
      managerErrors++;

      recordGcbOperationLog_({
        startedAt,
        completedAt,
        durationMs: Math.max(0, completedAt - startedAt),

        category: "REPORT",
        operation: "CLEANUP_MANAGER_REPORTS",
        status: "FAILED",
        trigger: "SCHEDULED_OR_MANUAL",

        managerId: manager.managerId,
        processed: 1,
        failed: 1,

        target: manager.managerId,
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

function saveReportPDF(
  config,
  workspace,
  {
    requestId = "",
    trigger = "MANUAL_OR_SCHEDULED",
    onOperationLog = null,
  } = {},
) {
  const startedAt = Date.now();
  const managerId = workspace?.managerId || "";

  const reportType = String(config?.reportType || "UNKNOWN")
    .trim()
    .toUpperCase();

  const writeOperationLog = (entry) => {
    if (typeof onOperationLog === "function") {
      onOperationLog(entry);
    } else {
      recordGcbOperationLog_(entry);
    }
  };

  try {
    if (!workspace?.managerId || !workspace?.spreadsheet) {
      throw new Error(
        "A valid manager workspace is required to generate a report.",
      );
    }

    const fileUrl = saveReportPDFInternal(config, workspace);
    const completedAt = Date.now();

    writeOperationLog({
      startedAt,
      completedAt,
      durationMs: completedAt - startedAt,
      requestId: String(requestId).trim(),
      managerId,
      category: "REPORT",
      operation: "GENERATE_PDF",
      status: "SUCCESS",
      trigger,
      processed: 1,
      succeeded: 1,
      failed: 0,
      target: reportType,
      message: `${reportType} report PDF generated successfully.`,
    });

    return fileUrl;
  } catch (error) {
    const completedAt = Date.now();

    writeOperationLog({
      startedAt,
      completedAt,
      durationMs: completedAt - startedAt,
      requestId: String(requestId).trim(),
      managerId,
      category: "REPORT",
      operation: "GENERATE_PDF",
      status: "FAILED",
      trigger,
      processed: 1,
      succeeded: 0,
      failed: 1,
      target: reportType,
      message: `${reportType} report PDF generation failed.`,
      error: String(error?.message || error).slice(0, 2000),
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

  const logSheetName = Validation.requiredString(
    config.logSheet,
    "Report log sheet",
    { maxLength: 100 },
  );

  const reportLogSheet = ss.getSheetByName(logSheetName);

  if (!reportLogSheet) {
    throw new Error(`Report log sheet "${logSheetName}" not found.`);
  }

  const folder = getReportFolder(workspace);
  const operationKey = String(config.operationKey || "").trim();
  const operationRow = Number(config.operationRow) || 0;

  const setProgress = (stage) => {
    if (operationKey && operationRow >= 2) {
      updateCustomReportProgress_(reportLogSheet, operationRow, stage);
    }
  };

  const startedAt = Date.now();

  let reportNum;
  let reportName;
  let pdfName;

  try {
    setProgress("Starting report generation");

    let reportData;
    let blob;

    // -------------------------------------------------------
    // BUILD REPORT DATA AND GENERATE PDF
    // -------------------------------------------------------

    if (reportType === "monthly") {
      const month = Number(config.month);
      const year = Number(config.year);

      if (!Number.isInteger(month) || month < 1 || month > 12) {
        throw new Error("A valid report month (1–12) is required.");
      }

      if (!Number.isInteger(year) || year < 2000 || year > 9999) {
        throw new Error("A valid report year is required.");
      }

      reportNum = `${year}-${String(month).padStart(2, "0")}`;
      reportName = "Monthly Performance Report";
      pdfName = `MonthlyReport_${reportNum}.pdf`;

      logResponse(
        `Generating monthly Slides PDF for manager ${workspace.managerId}, period ${reportNum}.`,
      );

      setProgress("Loading monthly performance data");

      const dataStarted = Date.now();

      const reportData = buildMonthlyReportData_(
        ss,
        month,
        year,
        setProgress,
        config.trigger || "MANUAL",
      );

      logResponse(
        `[MONTHLY_REPORT] Data building completed in ${(
          (Date.now() - dataStarted) /
          1000
        ).toFixed(1)} seconds.`,
      );

      if (!reportData) {
        throw new Error("Monthly report data could not be generated.");
      }

      setProgress("Rendering monthly Slides and generating PDF");

      const renderStarted = Date.now();

      blob = createMonthlyReportPdfBlob_(reportData, setProgress);

      logResponse(
        `[MONTHLY_REPORT] Slides rendering and PDF conversion completed in ${(
          (Date.now() - renderStarted) /
          1000
        ).toFixed(1)} seconds.`,
      );
    } else {
      const year = Number(config.year);

      if (!Number.isInteger(year) || year < 2000 || year > 9999) {
        throw new Error("A valid report year is required.");
      }

      reportNum = String(year);
      reportName = "Annual Performance Report";
      pdfName = `YearlyReport_${year}.pdf`;

      logResponse(
        `Generating yearly Slides PDF for manager ${workspace.managerId}, year ${year}.`,
      );

      setProgress("Loading annual performance data");

      const dataStarted = Date.now();

      reportData = buildYearlyReportData_(ss, year, setProgress);

      logResponse(
        `[YEARLY_REPORT] Data building completed in ${(
          (Date.now() - dataStarted) /
          1000
        ).toFixed(1)} seconds.`,
      );

      if (!reportData) {
        throw new Error("Yearly report data could not be generated.");
      }

      setProgress("Rendering yearly Slides and generating PDF");

      const renderStarted = Date.now();

      blob = createYearlyReportPdfBlob_(reportData, setProgress);

      logResponse(
        `[YEARLY_REPORT] Slides rendering and PDF conversion completed in ${(
          (Date.now() - renderStarted) /
          1000
        ).toFixed(1)} seconds.`,
      );
    }

    if (
      !blob ||
      typeof blob.getBytes !== "function" ||
      blob.getContentType() !== MimeType.PDF ||
      blob.getBytes().length === 0
    ) {
      throw new Error(
        `${reportType} Slides renderer returned an invalid or empty PDF blob.`,
      );
    }

    blob.setName(pdfName);

    // -------------------------------------------------------
    // SHARED FILE SAVING + IDEMPOTENCY
    // -------------------------------------------------------

    let file;
    let fileUrl;

    setProgress("Saving PDF to Drive");

    if (operationKey && operationRow >= 2) {
      const operation = findCustomReportOperation_(
        reportLogSheet,
        operationKey,
      );

      if (!operation || operation.row !== operationRow) {
        throw new Error("The reserved PDF operation could not be verified.");
      }

      if (operation.status !== "PROCESSING") {
        throw new Error(
          `Cannot save PDF because operation status is "${operation.status}".`,
        );
      }

      file = operation.fileId
        ? getVerifiedCustomReportFileById_(
            workspace,
            operation.fileId,
            operationKey,
          )
        : null;

      if (!file) {
        file = findCustomReportFileByOperationKey_(
          workspace,
          operationKey,
          pdfName,
        );
      }

      if (!file) {
        const operationPdfName = getCustomReportOperationFileName_(
          pdfName,
          operationKey,
        );

        file = folder.createFile(blob.copyBlob().setName(operationPdfName));
      }

      markCustomReportFile_(file, operationKey);

      fileUrl = file.getUrl();

      reportLogSheet
        .getRange(operationRow, 4, 1, 4)
        .setValues([[fileUrl, operationKey, "PROCESSING", file.getId()]]);

      SpreadsheetApp.flush();
    } else {
      file = folder.createFile(blob);
      fileUrl = file.getUrl();

      reportLogSheet.appendRow([new Date(), reportNum, reportName, fileUrl]);
    }

    // -------------------------------------------------------
    // VERIFY SAVED PDF
    // -------------------------------------------------------

    setProgress("Verifying saved PDF");

    if (!file || file.isTrashed()) {
      throw new Error("The saved PDF could not be verified.");
    }

    if (file.getUrl() !== fileUrl) {
      throw new Error("The saved PDF URL does not match the created file.");
    }

    const parents = file.getParents();
    let belongsToReportFolder = false;

    while (parents.hasNext()) {
      if (parents.next().getId() === folder.getId()) {
        belongsToReportFolder = true;
        break;
      }
    }

    if (!belongsToReportFolder) {
      throw new Error("The saved PDF is not in the manager's Reports Folder.");
    }

    // -------------------------------------------------------
    // FINALIZE CUSTOM REPORT OPERATION
    // -------------------------------------------------------

    if (operationKey && operationRow >= 2) {
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

      SpreadsheetApp.flush();
      setProgress("Report completed");
    }

    logResponse(
      `PDF saved successfully for manager ${workspace.managerId}: ${fileUrl}`,
    );

    return fileUrl;
  } catch (error) {
    logResponse(
      `[${reportType.toUpperCase()}_REPORT] Failed for manager ${workspace.managerId}: ${
        error?.message || error
      }`,
    );

    throw error;
  }
}

function getVerifiedCustomReportFileById_(workspace, fileId, operationKey) {
  if (!workspace?.managerId || !workspace?.spreadsheet) {
    throw new Error("A valid manager workspace is required.");
  }

  if (!fileId || !operationKey) {
    return null;
  }

  try {
    const file = DriveApp.getFileById(fileId);

    if (file.isTrashed() || file.getMimeType() !== MimeType.PDF) {
      return null;
    }

    const folder = getReportFolder(workspace);
    const parents = file.getParents();

    let belongsToManager = false;

    while (parents.hasNext()) {
      if (parents.next().getId() === folder.getId()) {
        belongsToManager = true;
        break;
      }
    }

    if (!belongsToManager) {
      return null;
    }

    const marker = getCustomReportOperationMarker_(operationKey);
    const markers = String(file.getDescription() || "").split(/\r?\n/);

    if (!markers.includes(marker)) {
      return null;
    }

    return file;
  } catch (error) {
    console.warn(
      "[Report Recovery] Could not verify saved PDF:",
      error?.message || error,
    );

    return null;
  }
}

function getCustomReportOperationMarker_(operationKey) {
  return `GCB_REPORT_OPERATION_KEY=${encodeURIComponent(operationKey)}`;
}

function getCustomReportProgress(sessionId, signature, type, requestId) {
  const normalizedType = String(type || "").toLowerCase();
  const stableRequestId = String(requestId || "").trim();

  if (!["monthly", "yearly"].includes(normalizedType)) {
    throw new Error("Unsupported report type.");
  }

  if (!stableRequestId) {
    throw new Error("Missing report request ID.");
  }

  const { workspace } = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "reports.generate",
  );

  const configs = {
    monthly: {
      logSheet: "MonthlyReport_Log",
    },
    yearly: {
      logSheet: "YearlyReport_Log",
    },
  };

  const config = configs[normalizedType];
  const logSheet = workspace.spreadsheet.getSheetByName(config.logSheet);

  if (!logSheet) {
    throw new Error("Report operation log was not found.");
  }

  const operationKey = `${sessionId}:${stableRequestId}`;
  const operation = findCustomReportOperation_(logSheet, operationKey);

  if (!operation) {
    return {
      status: "PROCESSING",
      progressStage: "Preparing report request",
    };
  }

  return {
    status: operation.status,
    progressStage: String(
      logSheet.getRange(operation.row, 8).getDisplayValue() || "",
    ),
  };
}

function findCustomReportFileByOperationKey_(
  workspace,
  operationKey,
  expectedPdfName = "",
) {
  if (!workspace?.managerId || !workspace?.spreadsheet) {
    throw new Error(
      "A valid manager workspace is required for report recovery.",
    );
  }

  if (!operationKey) {
    return null;
  }

  const folder = getReportFolder(workspace);
  const folderId = folder.getId();
  const marker = getCustomReportOperationMarker_(operationKey);

  /**
   * A candidate is valid only when:
   * - It is not trashed.
   * - It is a PDF.
   * - It belongs to this manager's Reports Folder.
   * - Its description contains this operation's marker.
   */
  const isVerifiedCandidate = (file) => {
    if (!file || file.isTrashed()) {
      return false;
    }

    if (file.getMimeType() !== MimeType.PDF) {
      return false;
    }

    const parents = file.getParents();
    let belongsToReportFolder = false;

    while (parents.hasNext()) {
      if (parents.next().getId() === folderId) {
        belongsToReportFolder = true;
        break;
      }
    }

    if (!belongsToReportFolder) {
      return false;
    }

    const markers = String(file.getDescription() || "").split(/\r?\n/);

    return markers.includes(marker);
  };

  // 1. Try the deterministic filename first.
  if (expectedPdfName) {
    const deterministicName = getCustomReportOperationFileName_(
      expectedPdfName,
      operationKey,
    );

    const namedFiles = folder.getFilesByName(deterministicName);

    while (namedFiles.hasNext()) {
      const candidate = namedFiles.next();

      if (isVerifiedCandidate(candidate)) {
        return candidate;
      }
    }
  }

  // 2. Fallback: search this manager's folder for the operation marker.
  const files = folder.getFiles();

  while (files.hasNext()) {
    const candidate = files.next();

    if (isVerifiedCandidate(candidate)) {
      return candidate;
    }
  }

  return null;
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
    .getRange(1, 5, 1, 5)
    .setValues([
      [
        "Operation Key",
        "Operation Status",
        "Drive File ID",
        "Progress Stage",
        "Updated At",
      ],
    ]);
}

function updateCustomReportProgress_(sheet, operationRow, stage) {
  if (!sheet || !Number.isInteger(operationRow) || operationRow < 2) {
    throw new Error("Invalid custom report operation.");
  }

  sheet
    .getRange(operationRow, 8, 1, 2)
    .setValues([[String(stage || ""), new Date()]]);

  SpreadsheetApp.flush();
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

function getCustomReportOperationFileName_(pdfName, operationKey) {
  if (!operationKey) {
    return pdfName;
  }

  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    operationKey,
  );

  const operationHash = Utilities.base64EncodeWebSafe(digest)
    .replace(/=+$/, "")
    .slice(0, 16);

  return pdfName.replace(/\.pdf$/i, "") + `__GCB_${operationHash}.pdf`;
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

  const folder = getReportFolder(workspace);
  const folderId = folder.getId();

  const isVerifiedFile = (file) => {
    if (!file || file.isTrashed()) {
      return false;
    }

    if (file.getMimeType() !== MimeType.PDF) {
      return false;
    }

    const parents = file.getParents();
    let belongsToReportFolder = false;

    while (parents.hasNext()) {
      if (parents.next().getId() === folderId) {
        belongsToReportFolder = true;
        break;
      }
    }

    if (!belongsToReportFolder) {
      return false;
    }

    const markers = String(file.getDescription() || "").split(/\r?\n/);

    return markers.includes(
      getCustomReportOperationMarker_(operation.operationKey),
    );
  };

  let file = null;

  // 1. Verify the saved Drive file ID first.
  if (operation.fileId) {
    try {
      const candidate = DriveApp.getFileById(operation.fileId);

      if (isVerifiedFile(candidate)) {
        file = candidate;
      }
    } catch (error) {
      file = null;
    }
  }

  // 2. If the saved ID is missing or invalid, search by deterministic name.
  if (!file) {
    const reportType = /yearly/i.test(sheet.getName()) ? "yearly" : "monthly";

    const expectedPdfName = `${
      reportType === "yearly" ? "YearlyReport" : "MonthlyReport"
    }_${operation.reportNum}.pdf`;

    file = findCustomReportFileByOperationKey_(
      workspace,
      operation.operationKey,
      expectedPdfName,
    );
  }

  if (!file) {
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

function reconcileFailedCustomReportOperation_(
  workspace,
  sheet,
  operation,
  originalError,
) {
  if (!workspace?.managerId || !workspace?.spreadsheet) {
    throw new Error("A valid manager workspace is required.");
  }

  if (!sheet || !operation?.row || !operation.operationKey) {
    throw new Error("Invalid report operation for reconciliation.");
  }

  // First check whether the PDF was actually saved.
  // If found, this restores the operation to COMPLETED.
  const recovered = recoverCustomReportOperation_(workspace, sheet, operation);

  if (recovered) {
    return recovered;
  }

  // Re-read the operation to avoid overwriting a newer state.
  const currentOperation = findCustomReportOperation_(
    sheet,
    operation.operationKey,
  );

  if (!currentOperation) {
    throw new Error(
      "Report operation could not be found during reconciliation.",
    );
  }

  if (currentOperation.status === "COMPLETED") {
    return getCompletedCustomReportResult_(workspace, currentOperation);
  }

  if (currentOperation.status !== "PROCESSING") {
    return {
      success: false,
      status: currentOperation.status,
      operationKey: operation.operationKey,
    };
  }

  // No matching PDF was found after successful folder verification.
  // The original generation has already failed, so retry is now safe.
  sheet.getRange(currentOperation.row, 6).setValue("FAILED");

  SpreadsheetApp.flush();

  return {
    success: false,
    status: "PROCESSING",
    operationKey: operation.operationKey,
    message:
      "The report is still processing or its save operation has not been recovered yet.",
  };
}

function reconcileTimedOutCustomReportPDF(
  sessionId,
  signature,
  type,
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

  const logSheetName =
    reportType === "yearly" ? "YearlyReport_Log" : "MonthlyReport_Log";

  const lock = LockService.getScriptLock();

  lock.waitLock(30000);

  try {
    const logSheet = ss.getSheetByName(logSheetName);

    if (!logSheet) {
      throw new Error(`Report log sheet "${logSheetName}" not found.`);
    }

    ensureCustomReportOperationColumns_(logSheet);

    const operation = findCustomReportOperation_(logSheet, operationKey);

    if (!operation) {
      throw new Error("The timed-out report operation could not be found.");
    }

    // Already completed: verify and return the existing PDF.
    if (operation.status === "COMPLETED") {
      return {
        ...getCompletedCustomReportResult_(workspace, operation),
        type: reportType,
      };
    }

    // Only a PROCESSING operation needs reconciliation.
    if (operation.status === "PROCESSING") {
      const recovered = recoverCustomReportOperation_(
        workspace,
        logSheet,
        operation,
      );

      if (recovered) {
        return {
          ...recovered,
          type: reportType,
        };
      }

      // This endpoint is called only after a confirmed Apps Script
      // maximum-execution-time termination.
      //
      // The original execution has ended. No verified PDF exists.
      logSheet.getRange(operation.row, 6).setValue("RETRYABLE");

      updateCustomReportProgress_(
        logSheet,
        operation.row,
        "Previous execution timed out — safe to retry",
      );

      SpreadsheetApp.flush();

      return {
        success: false,
        status: "RETRYABLE",
        operationKey,
        message:
          "The previous execution timed out without saving a verifiable PDF. The same request can now be retried.",
      };
    }

    if (operation.status === "RETRYABLE") {
      return {
        success: false,
        status: "RETRYABLE",
        operationKey,
        message: "This report operation is ready to retry.",
      };
    }

    return {
      success: false,
      status: operation.status || "UNKNOWN",
      operationKey,
      message:
        "This report operation is not eligible for automatic timeout recovery.",
    };
  } finally {
    lock.releaseLock();
  }
}

function saveMonthlyReportPDF() {
  const period = getPreviousCompletedMonth_();

  return saveScheduledReportsForManagers_({
    reportType: "Monthly",
    logSheet: "MonthlyReport_Log",
    month: period.month,
    year: period.year,
  });
}

function saveYearlyReportPDF() {
  return saveScheduledReportsForManagers_({
    reportType: "Yearly",
    logSheet: "YearlyReport_Log",
    year: new Date().getFullYear(),
  });
}

function saveCustomReportPDF(sessionId, signature, type, options = {}) {
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
      logSheet: "MonthlyReport_Log",
    },
    yearly: {
      reportType: "yearly",
      logSheet: "YearlyReport_Log",
    },
  };

  const config = configs[reportType];

  return saveReportPDF(config, workspace, {
    requestId: options.requestId || "",
    trigger: options.trigger || "MANUAL_OR_SCHEDULED",
  });
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

function saveScheduledReportsForManagers_(config) {
  const startedAt = Date.now();
  const managers = getManagers_();
  const results = [];

  managers.forEach((manager) => {
    try {
      const workspace = getManagerReportWorkspace_(manager);

      const reportUrl = saveReportPDF(
        {
          ...config,
          trigger: "SCHEDULED",
        },
        workspace,
        {
          trigger: "SCHEDULED",
        },
      );

      results.push({
        managerId: manager.managerId,
        success: true,
        reportUrl,
      });
    } catch (error) {
      results.push({
        managerId: manager.managerId,
        success: false,
        error: String(error?.message || error),
      });
    }
  });

  const completedAt = Date.now();

  const succeeded = results.filter((result) => result.success).length;
  const failed = results.length - succeeded;

  recordGcbOperationLog_({
    startedAt,
    completedAt,
    durationMs: Math.max(0, completedAt - startedAt),

    category: "REPORT",
    operation: `RUN_SCHEDULED_${String(config.reportType).toUpperCase()}_REPORTS`,
    status: failed === 0 ? "SUCCESS" : succeeded > 0 ? "PARTIAL" : "FAILED",
    trigger: "SCHEDULED",

    processed: results.length,
    succeeded,
    failed,

    target: "ALL_MANAGERS",
    message:
      `${config.reportType} scheduled reports: ` +
      `${succeeded} succeeded; ${failed} failed.`,
  });

  return {
    success: failed === 0,
    processed: results.length,
    succeeded,
    failed,
    results,
  };
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
      logSheet: "MonthlyReport_Log",
    },

    yearly: {
      reportType: "yearly",
      logSheet: "YearlyReport_Log",
    },
  };

  const config = {
    ...configs[reportType],
    trigger: "MANUAL",
  };

  const reportYear = Validation.number(year, "Report year", {
    min: 2024,
    max: new Date().getFullYear(),
  });

  // The Slides renderer needs the selected year directly.
  if (reportType === "yearly") {
    config.year = reportYear;
  }

  const lock = LockService.getScriptLock();
  let lockAcquired = false;
  let deferredOperationLog = null;

  try {
    lock.waitLock(30000);
    lockAcquired = true;

    const logSheet = ss.getSheetByName(config.logSheet);

    if (!logSheet) {
      throw new Error(`Report log sheet "${config.logSheet}" not found.`);
    }

    ensureCustomReportOperationColumns_(logSheet);

    // -------------------------------------------------------
    // 1. IDEMPOTENCY CHECK
    // -------------------------------------------------------

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

    if (existingOperation?.status === "RETRYABLE") {
      console.info(
        `[Custom Report] Retrying abandoned operation: ${operationKey}`,
      );
    }

    if (existingOperation && existingOperation.status !== "RETRYABLE") {
      throw new Error(
        `This report request has status "${existingOperation.status || "UNKNOWN"}". ` +
          "Reconcile the operation before retrying.",
      );
    }

    // -------------------------------------------------------
    // 2. RATE LIMITS
    // -------------------------------------------------------

    if (!existingOperation) {
      enforceUserRateLimit("report_generation", sessionId, 3, 60);
      enforceGlobalRateLimit("report_generation", 5, 60);
    }

    // -------------------------------------------------------
    // 3. VALIDATE REPORT TYPE
    // -------------------------------------------------------

    let reportNum;
    let reportName;
    let monthlyPeriod = null;

    if (reportType === "monthly") {
      monthlyPeriod = getMonthlyReportPeriod_(month, reportYear);

      const validation = validateCustomMonthlyReport(
        sessionId,
        signature,
        month,
        reportYear,
        ss,
      );

      if (!validation.valid) {
        throw new Error(validation.message);
      }

      reportNum = monthlyPeriod.monthKey;
      reportName = `${monthlyPeriod.monthName} ${monthlyPeriod.year} Performance`;
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

      reportNum = reportYear;
      reportName = `${reportYear} Performance`;
    }

    // -------------------------------------------------------
    // 4. RESERVE OPERATION
    // -------------------------------------------------------

    const operationRow =
      existingOperation?.status === "RETRYABLE"
        ? existingOperation.row
        : logSheet.getLastRow() + 1;

    logSheet
      .getRange(operationRow, 1, 1, 7)
      .setValues([
        [
          existingOperation?.date || new Date(),
          reportNum,
          reportName,
          "",
          operationKey,
          "PROCESSING",
          "",
        ],
      ]);

    SpreadsheetApp.flush();

    // -------------------------------------------------------
    // 5. RELEASE LOCK BEFORE YEARLY RENDERING
    // -------------------------------------------------------

    lock.releaseLock();
    lockAcquired = false;

    // Both monthly and yearly PDF rendering run without holding
    // the global script lock. The lock is used only for operation
    // reservation and idempotency checks.

    // -------------------------------------------------------
    // 5. GENERATE AND SAVE PDF
    // -------------------------------------------------------

    let fileUrl;

    try {
      fileUrl = saveReportPDF(
        {
          ...config,
          ...(monthlyPeriod
            ? {
                month: monthlyPeriod.month,
                monthName: monthlyPeriod.monthName,
                year: monthlyPeriod.year,
                reportNum,
                reportName,
              }
            : {}),
          operationKey,
          operationRow,
        },
        workspace,
        {
          requestId: stableRequestId,
          trigger: "MANUAL",
          onOperationLog: (entry) => {
            deferredOperationLog = entry;
          },
        },
      );

      console.info(
        "[CUSTOM_REPORT] Save result: " +
          JSON.stringify({
            type: reportType,
            fileUrl,
            isString: typeof fileUrl === "string",
            hasFileUrl: Boolean(fileUrl),
          }),
      );
    } catch (error) {
      try {
        const failedOperation = findCustomReportOperation_(
          logSheet,
          operationKey,
        );

        if (failedOperation?.status === "PROCESSING") {
          const reconciliation = reconcileFailedCustomReportOperation_(
            workspace,
            logSheet,
            failedOperation,
            error,
          );

          if (reconciliation?.success) {
            return reconciliation;
          }
        }
      } catch (reconciliationError) {
        console.error(
          "[Custom Report] Reconciliation failed:",
          reconciliationError,
        );
      }

      throw error;
    }

    // -------------------------------------------------------
    // 6. VERIFY COMPLETED OPERATION
    // -------------------------------------------------------

    const operation = findCustomReportOperation_(logSheet, operationKey);

    if (
      !operation ||
      operation.status !== "COMPLETED" ||
      !operation.fileId ||
      operation.fileUrl !== fileUrl
    ) {
      throw new Error(
        "The PDF save returned, but the operation log was not completed correctly. " +
          "Reconcile the operation before retrying.",
      );
    }

    // -------------------------------------------------------
    // 7. RETURN RESULT
    // -------------------------------------------------------

    const response = {
      success: true,
      reusedExisting: false,
      type: reportType,
      reportName: String(operation.reportName || ""),

      // Use the normalized report period instead of the
      // potentially Date-valued spreadsheet cell.
      reportNum: reportType === "monthly" ? monthlyPeriod.monthKey : reportYear,

      reportUrl: String(operation.fileUrl || ""),
      reportId: String(operation.fileId || ""),
      year: reportYear,

      ...(reportType === "monthly" ? { month: monthlyPeriod.monthName } : {}),
    };

    return response;
  } finally {
    // Release the report-generation lock first.
    if (lockAcquired) {
      lock.releaseLock();
      lockAcquired = false;
    }

    // Write the deferred central operation log only after
    // the script lock has been released.
    if (deferredOperationLog) {
      recordGcbOperationLog_(deferredOperationLog);
    }
  }
}

function sendReport(config, workspace, options = {}) {
  if (!workspace?.managerId || !workspace?.spreadsheet) {
    throw new Error("A valid manager workspace is required.");
  }

  const startedAt = Date.now();
  const requestId = String(options.requestId || "").trim();
  const trigger = options.trigger || "REPORT_WORKFLOW";
  const managerId = workspace?.managerId || "";

  const properties = PropertiesService.getScriptProperties();

  const emailPropertyKey = getManagerIntegrationPropertyKey_(
    workspace.managerId,
    "NOTIFICATION_EMAIL",
  );

  const webhookUrl = String(workspace.discordWebhookUrl || "").trim();

  const emailTo = String(properties.getProperty(emailPropertyKey) || "").trim();

  const reportLink = String(options.reportUrl || "").trim();

  if (!reportLink) {
    throw new Error(
      `No generated ${config.reportType} report URL was supplied for manager "${workspace.managerId}".`,
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

      const completedAt = Date.now();

      recordGcbOperationLog_({
        startedAt,
        completedAt,
        requestId,
        managerId,

        category: "DISCORD",
        operation: "SEND_REPORT_NOTIFICATION",
        status: "SUCCESS",
        trigger,

        durationMs: Math.max(0, completedAt - startedAt),
        processed: 1,
        succeeded: 1,

        target: managerId,
        message: `${config.reportType} report notification accepted by Discord.`,
      });
    } catch (error) {
      result.discord = "FAILED";

      const completedAt = Date.now();

      recordGcbOperationLog_({
        startedAt,
        completedAt,
        requestId,
        managerId,

        category: "DISCORD",
        operation: "SEND_REPORT_NOTIFICATION",
        status: "FAILED",
        trigger,

        durationMs: Math.max(0, completedAt - startedAt),
        processed: 1,
        failed: 1,

        target: managerId,
        message: `${config.reportType} report notification failed on Discord.`,
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

      const completedAt = Date.now();

      recordGcbOperationLog_({
        startedAt,
        completedAt,
        requestId,
        managerId,

        category: "EMAIL",
        operation: "SEND_REPORT_NOTIFICATION",
        status: "SUCCESS",
        trigger,

        durationMs: Math.max(0, completedAt - startedAt),
        processed: 1,
        succeeded: 1,

        target: managerId,
        message: `${config.reportType} report email accepted by MailApp.`,
      });
    } catch (error) {
      result.email = "FAILED";

      const completedAt = Date.now();

      recordGcbOperationLog_({
        startedAt,
        completedAt,
        requestId,
        managerId,

        category: "EMAIL",
        operation: "SEND_REPORT_NOTIFICATION",
        status: "FAILED",
        trigger,

        durationMs: Math.max(0, completedAt - startedAt),
        processed: 1,
        failed: 1,

        target: managerId,
        message: `${config.reportType} report email failed.`,
      });
    }
  }

  return result;
}

function getPreviousCompletedMonth_() {
  const timezone = Session.getScriptTimeZone();
  const now = new Date();

  const currentYear = Number(Utilities.formatDate(now, timezone, "yyyy"));

  const currentMonth = Number(Utilities.formatDate(now, timezone, "M"));

  // UTC avoids depending on the runtime's local timezone
  // when calculating the previous calendar month.
  const previousMonthDate = new Date(
    Date.UTC(currentYear, currentMonth - 2, 1),
  );

  return {
    month: previousMonthDate.getUTCMonth() + 1,
    year: previousMonthDate.getUTCFullYear(),
  };
}

function getMonthlyReportPeriod_(month, year) {
  const reportYear = Number(year);
  const currentYear = Number(
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy"),
  );

  if (
    !Number.isInteger(reportYear) ||
    reportYear < 2024 ||
    reportYear > currentYear
  ) {
    throw new Error("Invalid monthly report year.");
  }

  let monthDate = null;

  if (month instanceof Date && !isNaN(month.getTime())) {
    monthDate = new Date(month.getFullYear(), month.getMonth(), 1);
  } else {
    const monthText = String(month ?? "").trim();

    if (/^\d{1,2}$/.test(monthText)) {
      const monthNumber = Number(monthText);

      if (monthNumber >= 1 && monthNumber <= 12) {
        monthDate = new Date(reportYear, monthNumber - 1, 1);
      }
    } else if (monthText) {
      // Reuse the existing yearly month parser.
      monthDate = getYearlyReportMonthDate_(`${monthText} ${reportYear}`);
    }
  }

  if (!monthDate || monthDate.getFullYear() !== reportYear) {
    throw new Error("Invalid monthly report month.");
  }

  const monthNumber = monthDate.getMonth() + 1;
  const monthName = Utilities.formatDate(
    monthDate,
    Session.getScriptTimeZone(),
    "MMMM",
  );

  return {
    month: monthNumber,
    monthName,
    year: reportYear,
    monthKey: `${reportYear}-${String(monthNumber).padStart(2, "0")}`,
    startDate: new Date(reportYear, monthNumber - 1, 1),
    endDate: new Date(reportYear, monthNumber, 1),
  };
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
  const selectedDate = (() => {
    const monthText = String(month ?? "").trim();

    if (/^\d{1,2}$/.test(monthText)) {
      const monthNumber = Number(monthText);

      if (monthNumber < 1 || monthNumber > 12) {
        return null;
      }

      return new Date(Number(year), monthNumber - 1, 1);
    }

    const parsed = getYearlyReportMonthDate_(`${monthText} ${year}`);

    return parsed && parsed.getFullYear() === Number(year) ? parsed : null;
  })();

  if (!selectedDate) {
    return {
      valid: false,
      message: "Invalid month or year.",
    };
  }

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

  const email = Boolean(
    String(properties.getProperty(notificationEmailKey) || "").trim(),
  );

  const discord = Boolean(workspace.discordWebhookUrl);

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

/**
 * Returns all source data required to build a yearly PDF report.
 *
 * Does not use:
 * - Settings
 * - Year Log Generator
 * - Data Generator For Chart
 * - Shared selector/formula workflows
 */
function getYearlyReportData(sessionId, signature, year) {
  const workspace = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "reports.generate",
  );

  const reportYear = Number(year);
  const currentYear = new Date().getFullYear();

  if (
    !Number.isInteger(reportYear) ||
    reportYear < 2024 ||
    reportYear > currentYear
  ) {
    throw new Error("Invalid yearly report year.");
  }

  return buildYearlyReportData_(workspace.spreadsheet, reportYear);
}

/**
 * Internal builder. Accepts the manager's spreadsheet directly.
 */
function buildYearlyReportData_(spreadsheet, year, onProgress) {
  if (!spreadsheet) {
    throw new Error("Manager spreadsheet is unavailable.");
  }

  const progress = (stage) => {
    if (typeof onProgress === "function") {
      onProgress(stage);
    }
  };

  progress("Reading annual performance metrics");

  const analyticsSheet = spreadsheet.getSheetByName("Other Analytics");
  const monthlyHoursSheet = spreadsheet.getSheetByName("Monthly Hours Log");
  const billingSheet = spreadsheet.getSheetByName("Billing Analytics");

  if (!analyticsSheet) {
    throw new Error('Sheet "Other Analytics" was not found.');
  }

  if (!monthlyHoursSheet) {
    throw new Error('Sheet "Monthly Hours Log" was not found.');
  }

  if (!billingSheet) {
    throw new Error('Sheet "Billing Analytics" was not found.');
  }

  const annual = getYearlyReportAnnualMetrics_(analyticsSheet, year);

  progress("Reading monthly hours");

  const monthlyHours = getYearlyReportMonthlyHours_(monthlyHoursSheet, year);

  progress("Reading monthly billing");

  const monthlyBilling = getYearlyReportMonthlyBilling_(billingSheet, year);

  const monthly = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;

    return {
      month,
      label: Utilities.formatDate(
        new Date(year, index, 1),
        spreadsheet.getSpreadsheetTimeZone(),
        "MMM",
      ),
      hours: monthlyHours[month] ?? null,
      paidHours: monthlyBilling[month]?.paidHours ?? null,
      unpaidHours: monthlyBilling[month]?.unpaidHours ?? null,
      invoicedHours: monthlyBilling[month]?.invoicedHours ?? null,
      outstandingHours: monthlyBilling[month]?.outstandingHours ?? null,
      collectionRate: monthlyBilling[month]?.collectionRate ?? null,
      unpaidRate: monthlyBilling[month]?.unpaidRate ?? null,
      invoicedRate: monthlyBilling[month]?.invoicedRate ?? null,
    };
  });

  progress("Calculating top 10 client exposure");

  const clients = getYearlyReportTopClients_(spreadsheet, year, progress);

  progress("Calculating annual targets");

  const target =
    year === new Date().getFullYear()
      ? getYearlyReportTargetMetrics_(analyticsSheet, year)
      : null;

  return {
    year,
    generatedAt: new Date().toISOString(),
    timezone: spreadsheet.getSpreadsheetTimeZone(),
    annual,
    monthly,
    clients,
    target,
  };
}

function buildMonthlyReportData_(
  ss,
  month,
  year,
  onProgress,
  reportTrigger = "MANUAL",
) {
  if (!ss) {
    throw new Error("A valid spreadsheet is required.");
  }

  month = Number(month);
  year = Number(year);

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Invalid monthly report month.");
  }

  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new Error("Invalid monthly report year.");
  }

  const progress = (stage) => {
    if (typeof onProgress === "function") {
      onProgress(stage);
    }
  };

  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  // ---------------------------------------------------------
  // BILLING ANALYTICS
  // ---------------------------------------------------------

  progress("Reading monthly billing analytics");

  const billingSheet = ss.getSheetByName("Billing Analytics");

  if (!billingSheet) {
    throw new Error('Sheet "Billing Analytics" was not found.');
  }

  const billingByMonth = getYearlyReportMonthlyBilling_(billingSheet, year);

  const monthlyBilling = billingByMonth[month];

  if (!monthlyBilling) {
    throw new Error(`No Billing Analytics record was found for ${monthKey}.`);
  }

  // ---------------------------------------------------------
  // MONTHLY HOURS LOG
  // ---------------------------------------------------------

  progress("Reading monthly hours history");

  const hoursSheet = ss.getSheetByName("Monthly Hours Log");

  if (!hoursSheet) {
    throw new Error('Sheet "Monthly Hours Log" was not found.');
  }

  const hoursLastColumn = hoursSheet.getLastColumn();

  if (hoursLastColumn < 13) {
    throw new Error("Monthly Hours Log has no monthly columns.");
  }

  const hoursWidth = hoursLastColumn - 12;

  const hoursHeaders = hoursSheet.getRange(1, 13, 1, hoursWidth).getValues()[0];

  const hoursValues = hoursSheet.getRange(2, 13, 1, hoursWidth).getValues()[0];

  const hoursByMonth = {};

  hoursHeaders.forEach((header, index) => {
    const date = getYearlyReportMonthDate_(header);

    if (!date) return;

    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0",
    )}`;

    hoursByMonth[key] = getYearlyReportNullableNumber_(hoursValues[index]);
  });

  // ---------------------------------------------------------
  // MONTHLY TREND
  // ---------------------------------------------------------

  progress("Preparing monthly trends");

  const isScheduled =
    String(reportTrigger).trim().toUpperCase() === "SCHEDULED";

  // Manual: January through selected month.
  // Scheduled: January through previous month.
  // Scheduled January: December of previous year.

  const trendStartMonth = isScheduled && month === 1 ? 12 : 1;
  const trendEndMonth = isScheduled ? month - 1 : month;

  // Load previous year's billing only for scheduled January.
  const previousYearBilling =
    isScheduled && month === 1
      ? getYearlyReportMonthlyBilling_(billingSheet, year - 1)
      : null;

  const monthlyTrend = [];

  for (
    let currentMonth = trendStartMonth;
    currentMonth <= trendEndMonth;
    currentMonth++
  ) {
    const trendYear =
      isScheduled && month === 1 && currentMonth === 12 ? year - 1 : year;

    const billing =
      trendYear === year
        ? billingByMonth[currentMonth] || {}
        : previousYearBilling?.[currentMonth] || {};

    const key = `${trendYear}-${String(currentMonth).padStart(2, "0")}`;

    monthlyTrend.push({
      month: currentMonth,
      year: trendYear,

      label: Utilities.formatDate(
        new Date(trendYear, currentMonth - 1, 1),
        ss.getSpreadsheetTimeZone(),
        "MMM",
      ),

      totalHours: billing.totalHours ?? hoursByMonth[key] ?? null,

      paid: billing.paidHours ?? null,
      unpaid: billing.unpaidHours ?? null,
      invoiced: billing.invoicedHours ?? null,
      outstanding: billing.outstandingHours ?? null,

      collectionRate: billing.collectionRate ?? null,
    });
  }

  // ---------------------------------------------------------
  // FINAL REPORT DATA
  // ---------------------------------------------------------

  progress("Preparing monthly report data");

  return {
    reportType: "Monthly",

    reportPeriod: {
      month,
      year,
      monthKey,

      monthName: Utilities.formatDate(
        new Date(year, month - 1, 1),
        ss.getSpreadsheetTimeZone(),
        "MMMM",
      ),

      startDate: new Date(year, month - 1, 1),
      endDate: new Date(year, month, 0),
    },

    overview: {
      totalHours: monthlyBilling.totalHours ?? hoursByMonth[monthKey] ?? null,

      paid: monthlyBilling.paidHours ?? null,
      unpaid: monthlyBilling.unpaidHours ?? null,
      invoiced: monthlyBilling.invoicedHours ?? null,
      outstanding: monthlyBilling.outstandingHours ?? null,

      collectionRate: monthlyBilling.collectionRate ?? null,
      unpaidRate: monthlyBilling.unpaidRate ?? null,
      invoicedRate: monthlyBilling.invoicedRate ?? null,
    },

    trends: monthlyTrend,

    sources: {
      billingAnalytics: "Billing Analytics",
      monthlyHours: "Monthly Hours Log",
    },
  };
}

function getYearlyReportAnnualMetrics_(sheet, year) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 5) {
    throw new Error("No annual analytics data is available.");
  }

  const headers = sheet
    .getRange(4, 1, 1, 14)
    .getDisplayValues()[0]
    .map((value) => String(value).trim());

  const values = sheet.getRange(5, 1, lastRow - 4, 14).getValues();

  const row = values.find((item) => Number(item[0]) === Number(year));

  if (!row) {
    throw new Error(`No annual analytics record found for ${year}.`);
  }

  const getValue = (header) => {
    const index = headers.indexOf(header);

    return index === -1 ? null : row[index];
  };

  const toNumber = (value) => {
    if (value === "" || value === null || value === undefined) {
      return null;
    }

    const number = Number(value);

    return Number.isFinite(number) ? number : null;
  };

  return {
    year,

    hours: toNumber(getValue("Hours")),
    paid: toNumber(getValue("Net Paid")),
    owed: toNumber(getValue("Net Owed")),
    netHours: toNumber(getValue("Net Hrs")),

    lifetimeShare: toNumber(getValue("% of Lifetime Vol")),
    collectionRate: toNumber(getValue("Collection Rate")),
    debtExposureRate: toNumber(getValue("Debt Exposure Rate")),
    netHoursYield: toNumber(getValue("Net Hours Yield")),

    yearOverYear: {
      hours: toNumber(getValue("Hours vs Last Year")),
      paid: toNumber(getValue("Paid vs Last Year")),
      owed: toNumber(getValue("Owed vs Last Year")),
      netHours: toNumber(getValue("Net Hours vs Last Year")),
    },

    monthlyAverage: toNumber(getValue("Monthly Average Hours")),
  };
}

function getYearlyReportMonthlyHours_(sheet, year) {
  const lastColumn = sheet.getLastColumn();

  if (lastColumn < 13) {
    return {};
  }

  const width = lastColumn - 12;

  const headers = sheet.getRange(1, 13, 1, width).getValues()[0];

  const totals = sheet.getRange(2, 13, 1, width).getValues()[0];

  const result = {};

  headers.forEach((header, index) => {
    const monthDate = getYearlyReportMonthDate_(header);

    if (!monthDate || monthDate.getFullYear() !== year) {
      return;
    }

    const month = monthDate.getMonth() + 1;

    result[month] = Number(totals[index]) || 0;
  });

  return result;
}

function getYearlyReportMonthlyBilling_(sheet, year) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return {};
  }

  const values = sheet.getRange(2, 1, lastRow - 1, 9).getValues();

  const result = {};

  values.forEach((row) => {
    const monthDate = getYearlyReportMonthDate_(row[0]);

    if (!monthDate || monthDate.getFullYear() !== year) {
      return;
    }

    const month = monthDate.getMonth() + 1;

    result[month] = {
      totalHours: Number(row[1]) || 0,
      paidHours: Number(row[2]) || 0,
      unpaidHours: Number(row[3]) || 0,
      invoicedHours: Number(row[4]) || 0,
      outstandingHours: Number(row[5]) || 0,

      collectionRate: getYearlyReportNullableNumber_(row[6]),
      unpaidRate: getYearlyReportNullableNumber_(row[7]),
      invoicedRate: getYearlyReportNullableNumber_(row[8]),
    };
  });

  return result;
}

function getYearlyReportTopClients_(spreadsheet, year, onProgress) {
  const sheet = spreadsheet.getSheetByName("Log - Yearly Summary");

  if (!sheet) {
    throw new Error('Sheet "Log - Yearly Summary" was not found.');
  }

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (lastRow < 4 || lastColumn < 2) {
    return [];
  }

  const headers = sheet
    .getRange(1, 2, 1, lastColumn - 1)
    .getDisplayValues()[0]
    .map((value) => String(value).trim());

  const paidIndex = headers.indexOf(`Paid ${year}`);
  const owedIndex = headers.indexOf(`Owed ${year}`);

  if (paidIndex === -1 || owedIndex === -1) {
    throw new Error(`Yearly Paid/Owed columns for ${year} were not found.`);
  }

  onProgress?.("Reading yearly client summary");

  const rowCount = lastRow - 3;

  const names = sheet.getRange(4, 1, rowCount, 1).getValues();

  const paidValues = sheet.getRange(4, paidIndex + 2, rowCount, 1).getValues();

  const owedValues = sheet.getRange(4, owedIndex + 2, rowCount, 1).getValues();

  const clients = [];

  for (let i = 0; i < rowCount; i++) {
    const name = String(names[i][0] || "").trim();

    if (!name) continue;

    const paidValue = paidValues[i][0];
    const owedValue = owedValues[i][0];

    // Match the FILTER formula: either Paid or Owed must be nonblank.
    if (
      (paidValue === "" || paidValue === null) &&
      (owedValue === "" || owedValue === null)
    ) {
      continue;
    }

    const paid = Number(paidValue) || 0;
    const owed = Number(owedValue) || 0;

    clients.push({
      client: name,
      paid,
      owed,
      netHours: paid - owed,
      hours: paid + owed,
    });
  }

  onProgress?.("Ranking yearly client exposure");

  return clients
    .sort((a, b) => b.owed - a.owed)
    .slice(0, 10)
    .map((client, index) => ({
      rank: index + 1,
      ...client,
    }));
}

function getYearlyReportTargetMetrics_(sheet, year) {
  const values = sheet.getRange("P1:Y5").getValues();

  const inputHeaders = values[0].map((value) => String(value).trim());

  const inputData = values[1];

  const calculatedHeaders = values[3].map((value) => String(value).trim());

  const calculatedData = values[4];

  const getInput = (header) => {
    const index = inputHeaders.indexOf(header);

    return index === -1 ? null : inputData[index];
  };

  const getCalculated = (header) => {
    const index = calculatedHeaders.indexOf(header);

    return index === -1 ? null : calculatedData[index];
  };

  const toNumber = (value) => {
    if (value === "" || value === null || value === undefined) {
      return null;
    }

    const number = Number(value);

    return Number.isFinite(number) ? number : null;
  };

  const targetYear = toNumber(getInput("Target Year"));

  // Do not display target metrics configured for another year.
  if (targetYear !== year) {
    return null;
  }

  return {
    targetYear,

    ytdHours: toNumber(getInput("YTD Hours")),
    annualTarget: toNumber(getInput("Annual Target")),
    projectedAnnualHours: toNumber(getInput("Projected Annual Hours")),

    ytdTarget: toNumber(getCalculated("YTD Target")),
    ytdProgress: toNumber(getCalculated("YTD Progress")),
    annualProgress: toNumber(getCalculated("Annual Progress")),
    projectedAnnualProgress: toNumber(
      getCalculated("Projected Annual Progress"),
    ),
  };
}

function getYearlyReportMonthDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), 1);
  }

  const text = String(value ?? "").trim();

  if (!text) {
    return null;
  }

  // Supports yyyy-MM and yyyy-MM-dd.
  let match = text.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);

  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);

    if (month >= 1 && month <= 12) {
      return new Date(year, month - 1, 1);
    }

    return null;
  }

  // Supports month names, e.g. May 2024 or May-2024.
  const parsed = new Date(text);

  if (!isNaN(parsed.getTime())) {
    return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
  }

  return null;
}

function getYearlyReportNullableNumber_(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function createYearlyReportPdfBlob_(reportData, onProgress) {
  if (!reportData || !reportData.annual || !reportData.monthly) {
    throw new Error("Invalid yearly report data.");
  }

  const year = Number(reportData.year);
  const startedAt = Date.now();

  let presentationId = null;

  const logTiming = (stage, stageStartedAt) => {
    console.info(
      `[YEARLY_RENDER] ${stage}: ${(
        (Date.now() - stageStartedAt) /
        1000
      ).toFixed(2)} seconds`,
    );
  };

  try {
    // -------------------------------------------------------
    // 1. CREATE TEMPORARY PRESENTATION
    // -------------------------------------------------------

    let stageStartedAt = Date.now();

    const presentation = Slides.Presentations.create({
      title: `GCB Yearly Report ${year} - Temporary`,
    });

    presentationId = presentation.presentationId;

    if (!presentationId) {
      throw new Error("Failed to create temporary Slides presentation.");
    }

    logTiming("Presentation creation", stageStartedAt);

    // -------------------------------------------------------
    // 2. PREPARE THREE SLIDES
    // -------------------------------------------------------

    stageStartedAt = Date.now();

    const currentPresentation = Slides.Presentations.get(presentationId);

    const existingSlides = currentPresentation.slides || [];

    if (!existingSlides.length) {
      throw new Error("The temporary presentation has no initial slide.");
    }

    const slide1Id = existingSlides[0].objectId;
    const slide2Id = yearlyNextSlideObjectId_("gcb_slide");
    const slide3Id = yearlyNextSlideObjectId_("gcb_slide");

    const setupRequests = [];

    // Remove any default placeholders from the first slide.
    (existingSlides[0].pageElements || []).forEach((element) => {
      setupRequests.push({
        deleteObject: {
          objectId: element.objectId,
        },
      });
    });

    setupRequests.push(
      {
        createSlide: {
          objectId: slide2Id,
          slideLayoutReference: {
            predefinedLayout: "BLANK",
          },
        },
      },
      {
        createSlide: {
          objectId: slide3Id,
          slideLayoutReference: {
            predefinedLayout: "BLANK",
          },
        },
      },
    );

    Slides.Presentations.batchUpdate(
      {
        requests: setupRequests,
      },
      presentationId,
    );

    logTiming("Slide setup", stageStartedAt);

    // -------------------------------------------------------
    // 3. BUILD LIGHTWEIGHT SLIDE CONTEXTS
    // -------------------------------------------------------

    const slides = [
      yearlyCreateSlideContext_(slide1Id),
      yearlyCreateSlideContext_(slide2Id),
      yearlyCreateSlideContext_(slide3Id),
    ];

    // -------------------------------------------------------
    // 4. BUILD AND SUBMIT PAGE REQUESTS
    // -------------------------------------------------------

    stageStartedAt = Date.now();

    createYearlyReportSlides_(slides, reportData, onProgress, presentationId);

    logTiming("All three slide renderers", stageStartedAt);

    // -------------------------------------------------------
    // 5. EXPORT TO PDF
    // -------------------------------------------------------

    stageStartedAt = Date.now();

    onProgress?.("Converting Slides presentation to PDF");

    const pdfBlob = DriveApp.getFileById(presentationId)
      .getAs(MimeType.PDF)
      .setName(`YearlyReport_${year}_Performance.pdf`);

    if (!pdfBlob || pdfBlob.getBytes().length === 0) {
      throw new Error("PDF conversion returned an empty file.");
    }

    logTiming("PDF conversion", stageStartedAt);

    console.info(
      `[YEARLY_RENDER] PDF size: ${pdfBlob.getBytes().length} bytes`,
    );

    console.info(
      `[YEARLY_RENDER] Total rendering time: ${(
        (Date.now() - startedAt) /
        1000
      ).toFixed(2)} seconds`,
    );

    onProgress?.("PDF conversion completed");

    return pdfBlob;
  } finally {
    // -------------------------------------------------------
    // 6. CLEAN UP TEMPORARY PRESENTATION
    // -------------------------------------------------------

    if (presentationId) {
      const cleanupStartedAt = Date.now();

      try {
        DriveApp.getFileById(presentationId).setTrashed(true);

        logTiming("Temporary presentation cleanup", cleanupStartedAt);
      } catch (cleanupError) {
        console.error(
          `[YEARLY_RENDER] Temporary presentation cleanup failed (${presentationId}):`,
          cleanupError,
        );
      }
    }
  }
}

function createMonthlyReportPdfBlob_(reportData, onProgress) {
  if (!reportData || !reportData.overview || !reportData.trends) {
    throw new Error("Invalid monthly report data.");
  }

  const month = Number(reportData.reportPeriod?.month);
  const year = Number(reportData.reportPeriod?.year);

  if (
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12 ||
    !Number.isInteger(year)
  ) {
    throw new Error("Invalid monthly report period.");
  }

  const monthName =
    reportData.reportPeriod.monthName ||
    new Date(year, month - 1, 1).toLocaleString("en-US", {
      month: "long",
    });

  const startedAt = Date.now();
  let presentationId = null;

  const logTiming = (stage, stageStartedAt) => {
    console.info(
      `[MONTHLY_RENDER] ${stage}: ${(
        (Date.now() - stageStartedAt) /
        1000
      ).toFixed(2)} seconds`,
    );
  };

  try {
    // -------------------------------------------------------
    // 1. CREATE TEMPORARY PRESENTATION
    // -------------------------------------------------------

    let stageStartedAt = Date.now();

    const presentation = Slides.Presentations.create({
      title: `GCB Monthly Report ${monthName} ${year} - Temporary`,
    });

    presentationId = presentation.presentationId;

    if (!presentationId) {
      throw new Error("Failed to create temporary Slides presentation.");
    }

    logTiming("Presentation creation", stageStartedAt);

    // -------------------------------------------------------
    // 2. PREPARE THREE SLIDES
    // -------------------------------------------------------

    stageStartedAt = Date.now();

    const currentPresentation = Slides.Presentations.get(presentationId);
    const existingSlides = currentPresentation.slides || [];

    if (!existingSlides.length) {
      throw new Error("The temporary presentation has no initial slide.");
    }

    const slide1Id = existingSlides[0].objectId;
    const slide2Id = yearlyNextSlideObjectId_("gcb_slide");
    const slide3Id = yearlyNextSlideObjectId_("gcb_slide");

    const setupRequests = [];

    // Remove default placeholders from the first slide.
    (existingSlides[0].pageElements || []).forEach((element) => {
      setupRequests.push({
        deleteObject: {
          objectId: element.objectId,
        },
      });
    });

    setupRequests.push(
      {
        createSlide: {
          objectId: slide2Id,
          slideLayoutReference: {
            predefinedLayout: "BLANK",
          },
        },
      },
      {
        createSlide: {
          objectId: slide3Id,
          slideLayoutReference: {
            predefinedLayout: "BLANK",
          },
        },
      },
    );

    Slides.Presentations.batchUpdate(
      {
        requests: setupRequests,
      },
      presentationId,
    );

    logTiming("Slide setup", stageStartedAt);

    // -------------------------------------------------------
    // 3. BUILD LIGHTWEIGHT SLIDE CONTEXTS
    // -------------------------------------------------------

    const slides = [
      yearlyCreateSlideContext_(slide1Id),
      yearlyCreateSlideContext_(slide2Id),
      yearlyCreateSlideContext_(slide3Id),
    ];

    // -------------------------------------------------------
    // 4. BUILD AND SUBMIT MONTHLY PAGE REQUESTS
    // -------------------------------------------------------

    stageStartedAt = Date.now();

    createMonthlyReportSlides_(slides, reportData, onProgress, presentationId);

    logTiming("All three slide renderers", stageStartedAt);

    // -------------------------------------------------------
    // 5. EXPORT TO PDF
    // -------------------------------------------------------

    stageStartedAt = Date.now();

    onProgress?.("Converting Slides presentation to PDF");

    const pdfBlob = DriveApp.getFileById(presentationId)
      .getAs(MimeType.PDF)
      .setName(
        `MonthlyReport_${year}-${String(month).padStart(2, "0")}_Performance.pdf`,
      );

    if (!pdfBlob || pdfBlob.getBytes().length === 0) {
      throw new Error("PDF conversion returned an empty file.");
    }

    logTiming("PDF conversion", stageStartedAt);

    console.info(
      `[MONTHLY_RENDER] PDF size: ${pdfBlob.getBytes().length} bytes`,
    );

    console.info(
      `[MONTHLY_RENDER] Total rendering time: ${(
        (Date.now() - startedAt) /
        1000
      ).toFixed(2)} seconds`,
    );

    onProgress?.("PDF conversion completed");

    return pdfBlob;
  } finally {
    // -------------------------------------------------------
    // 6. CLEAN UP TEMPORARY PRESENTATION
    // -------------------------------------------------------

    if (presentationId) {
      const cleanupStartedAt = Date.now();

      try {
        DriveApp.getFileById(presentationId).setTrashed(true);

        logTiming("Temporary presentation cleanup", cleanupStartedAt);
      } catch (cleanupError) {
        console.error(
          `[MONTHLY_RENDER] Temporary presentation cleanup failed (${presentationId}):`,
          cleanupError,
        );
      }
    }
  }
}

const YEARLY_SLIDE_STYLE = {
  width: 720,
  height: 405,

  navy: "#172B4D",
  blue: "#2878D0",
  lightBlue: "#EAF2FC",
  green: "#21865B",
  lightGreen: "#E8F5EE",
  red: "#C74747",
  lightRed: "#FCEEEE",
  orange: "#D88926",
  lightOrange: "#FFF4E5",

  background: "#F5F7FA",
  white: "#FFFFFF",
  text: "#253247",
  muted: "#748094",
  border: "#E1E6ED",
};

function yearlyFormatNumber_(value, decimals = 1) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const number = Number(value);

  if (!Number.isFinite(number)) return "—";

  return number.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function yearlyFormatPercent_(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const number = Number(value);

  if (!Number.isFinite(number)) return "—";

  // Supports both decimal rates (0.52) and percentage values (52).
  const percentage = Math.abs(number) <= 1 ? number * 100 : number;

  return `${percentage.toFixed(2)}%`;
}

function yearlyAddPageHeader_(slide, title, subtitle) {
  const s = YEARLY_SLIDE_STYLE;

  yearlyAddRect_(slide, 0, 0, s.width, s.height, s.background);

  yearlyAddText_(slide, "GCB | BILLING & HOURS", 28, 16, 300, 15, {
    fontSize: 8,
    bold: true,
    color: s.blue,
  });

  yearlyAddText_(slide, title, 28, 38, 620, 30, {
    fontSize: 21,
    bold: true,
    color: s.navy,
  });

  yearlyAddText_(slide, subtitle, 28, 70, 650, 18, {
    fontSize: 9,
    color: s.muted,
  });

  yearlyAddLine_(slide, 28, 94, 692, 94, s.border, 1);
}

function yearlyAddFooter_(slide, pageNumber, year) {
  const s = YEARLY_SLIDE_STYLE;

  yearlyAddLine_(slide, 28, 382, 692, 382, s.border, 1);

  yearlyAddText_(
    slide,
    `GCB Annual Performance Report | ${year}`,
    28,
    386,
    450,
    12,
    { fontSize: 7, color: s.muted },
  );

  yearlyAddText_(slide, `${pageNumber} / 3`, 650, 386, 42, 12, {
    fontSize: 7,
    color: s.muted,
    align: "right",
  });
}

function yearlyAddKpiCard_(slide, x, y, w, h, label, value, accent) {
  const s = YEARLY_SLIDE_STYLE;

  yearlyAddRect_(slide, x, y, w, h, s.white, {
    border: s.border,
  });

  yearlyAddRect_(slide, x, y, 4, h, accent);

  yearlyAddText_(slide, label.toUpperCase(), x + 13, y + 10, w - 22, 13, {
    fontSize: 7,
    bold: true,
    color: s.muted,
  });

  yearlyAddText_(slide, value, x + 13, y + 28, w - 22, 25, {
    fontSize: 18,
    bold: true,
    color: s.navy,
  });
}

function compactYearlyValue_(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return "—";

  if (Math.abs(number) >= 1000) {
    return `${(number / 1000).toFixed(1)}k`;
  }

  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function createYearlyOverviewSlide_(slide, data) {
  const s = YEARLY_SLIDE_STYLE;
  const a = data.annual;
  const yoy = a.yearOverYear || {};

  yearlyAddPageHeader_(
    slide,
    `${data.year} Annual Performance Overview`,
    "Annual billing and hours performance summary",
  );

  const cards = [
    ["Total Hours", yearlyFormatNumber_(a.hours), s.blue],
    ["Net Paid", yearlyFormatNumber_(a.paid), s.green],
    ["Net Owed", yearlyFormatNumber_(a.owed), s.orange],
    ["Net Hours", yearlyFormatNumber_(a.netHours), s.navy],
  ];

  cards.forEach((card, index) => {
    yearlyAddKpiCard_(
      slide,
      28 + index * 168,
      108,
      156,
      68,
      card[0],
      card[1],
      card[2],
    );
  });

  // Collection and debt exposure.
  yearlyAddRect_(slide, 28, 190, 320, 72, s.white, {
    border: s.border,
  });

  yearlyAddText_(slide, "COLLECTION RATE", 42, 201, 140, 13, {
    fontSize: 8,
    bold: true,
    color: s.muted,
  });

  yearlyAddText_(
    slide,
    yearlyFormatPercent_(a.collectionRate),
    42,
    220,
    130,
    27,
    { fontSize: 20, bold: true, color: s.green },
  );

  yearlyAddRect_(slide, 372, 190, 320, 72, s.white, {
    border: s.border,
  });

  yearlyAddText_(slide, "DEBT EXPOSURE", 386, 201, 140, 13, {
    fontSize: 8,
    bold: true,
    color: s.muted,
  });

  yearlyAddText_(
    slide,
    yearlyFormatPercent_(a.debtExposureRate),
    386,
    220,
    130,
    27,
    { fontSize: 20, bold: true, color: s.orange },
  );

  // Year-over-year comparisons.
  yearlyAddText_(slide, "YEAR-OVER-YEAR CHANGE", 28, 278, 250, 15, {
    fontSize: 9,
    bold: true,
    color: s.navy,
  });

  const comparisons = [
    ["Hours", yoy.hours],
    ["Paid Hours", yoy.paid],
    ["Owed Hours", yoy.owed],
    ["Net Hours", yoy.netHours],
  ];

  comparisons.forEach((item, index) => {
    const x = 28 + index * 168;
    const value = yearlyFormatPercent_(item[1]);

    yearlyAddRect_(slide, x, 299, 156, 49, s.white, {
      border: s.border,
    });

    yearlyAddText_(slide, item[0], x + 10, 306, 136, 12, {
      fontSize: 8,
      color: s.muted,
    });

    yearlyAddText_(slide, value, x + 10, 322, 136, 18, {
      fontSize: 12,
      bold: true,
      color: s.text,
    });
  });

  // Current-year targets only.
  if (data.target) {
    const t = data.target;

    yearlyAddText_(
      slide,
      `Annual Target: ${yearlyFormatNumber_(t.annualTarget)} hrs`,
      28,
      354,
      300,
      13,
      { fontSize: 8, bold: true, color: s.blue },
    );

    yearlyAddText_(
      slide,
      `YTD Progress: ${yearlyFormatPercent_(t.ytdProgress)}  |  Annual Progress: ${yearlyFormatPercent_(t.annualProgress)}`,
      330,
      354,
      360,
      13,
      { fontSize: 8, color: s.muted },
    );
  }

  yearlyAddFooter_(slide, 1, data.year);
}

function createYearlyMonthlySlide_(slide, data) {
  const s = YEARLY_SLIDE_STYLE;

  yearlyAddPageHeader_(
    slide,
    "Monthly Performance Trends",
    `Monthly hours and billing performance for ${data.year}`,
  );

  const months = data.monthly || [];

  // ---------------------------------------------------------
  // TWO-COLUMN MONTHLY CHARTS
  // ---------------------------------------------------------

  const chartTop = 112;
  const leftX = 28;
  const rightX = 372;

  // CHART 1: MONTHLY HOURS

  yearlyAddText_(slide, "MONTHLY HOURS", leftX, chartTop, 250, 13, {
    fontSize: 8,
    bold: true,
    color: s.navy,
  });

  const hoursChartX = leftX + 8;
  const hoursChartY = chartTop + 23;
  const hoursChartW = 300;
  const hoursChartH = 57;
  const hoursBarWidth = 13;
  const hoursGap = 11;

  const validHours = months
    .map((month) => Number(month.hours))
    .filter(
      (value, index) =>
        months[index].hours !== null &&
        months[index].hours !== undefined &&
        months[index].hours !== "" &&
        Number.isFinite(value),
    );

  const maxHours = Math.max(1, ...validHours);

  yearlyAddLine_(
    slide,
    hoursChartX,
    hoursChartY + hoursChartH,
    hoursChartX + hoursChartW,
    hoursChartY + hoursChartH,
    s.border,
  );

  months.forEach((month, index) => {
    const x = hoursChartX + index * (hoursBarWidth + hoursGap);
    const value = Number(month.hours);

    if (
      month.hours !== null &&
      month.hours !== undefined &&
      month.hours !== "" &&
      Number.isFinite(value)
    ) {
      const barHeight = Math.max(2, (value / maxHours) * hoursChartH);

      yearlyAddRect_(
        slide,
        x,
        hoursChartY + hoursChartH - barHeight,
        hoursBarWidth,
        barHeight,
        s.blue,
      );

      yearlyAddText_(
        slide,
        yearlyFormatNumber_(value),
        x - 7,
        hoursChartY + hoursChartH - barHeight - 9,
        hoursBarWidth + 14,
        8,
        {
          fontSize: 4.8,
          align: "center",
          color: s.muted,
        },
      );
    }

    yearlyAddText_(
      slide,
      month.label || "",
      x - 4,
      hoursChartY + hoursChartH + 3,
      hoursBarWidth + 8,
      8,
      {
        fontSize: 5,
        align: "center",
        color: s.muted,
      },
    );
  });

  // CHART 2: PAID VS UNPAID HOURS

  yearlyAddText_(slide, "PAID VS UNPAID HOURS", rightX, chartTop, 200, 13, {
    fontSize: 8,
    bold: true,
    color: s.navy,
  });

  yearlyAddRect_(slide, rightX + 177, chartTop + 2, 7, 7, s.green);

  yearlyAddText_(slide, "Paid", rightX + 187, chartTop, 35, 11, {
    fontSize: 6,
    color: s.muted,
  });

  yearlyAddRect_(slide, rightX + 232, chartTop + 2, 7, 7, s.orange);

  yearlyAddText_(slide, "Unpaid", rightX + 242, chartTop, 45, 11, {
    fontSize: 6,
    color: s.muted,
  });

  const billingChartX = rightX + 7;
  const billingChartY = chartTop + 23;
  const billingChartW = 300;
  const billingChartH = 57;
  const billingBarWidth = 6;
  const billingBarGap = 2;

  // Exclude months where both paid and unpaid hours are zero/missing.
  const billingMonths = months.filter((month) => {
    const paid = Number(month.paidHours) || 0;
    const unpaid = Number(month.unpaidHours) || 0;

    return paid !== 0 || unpaid !== 0;
  });

  const billingValues = billingMonths.flatMap((month) => [
    Number(month.paidHours) || 0,
    Number(month.unpaidHours) || 0,
  ]);

  const maxBillingHours = Math.max(1, ...billingValues);

  const billingSlotWidth =
    billingMonths.length > 0
      ? billingChartW / billingMonths.length
      : billingChartW;

  yearlyAddLine_(
    slide,
    billingChartX,
    billingChartY + billingChartH,
    billingChartX + billingChartW,
    billingChartY + billingChartH,
    s.border,
  );

  billingMonths.forEach((month, index) => {
    const slotX = billingChartX + index * billingSlotWidth;
    const groupWidth = billingBarWidth * 2 + billingBarGap;
    const x = slotX + (billingSlotWidth - groupWidth) / 2;

    const paid = Number(month.paidHours) || 0;
    const unpaid = Number(month.unpaidHours) || 0;

    const paidHeight =
      paid > 0 ? Math.max(2, (paid / maxBillingHours) * billingChartH) : 0;

    const unpaidHeight =
      unpaid > 0 ? Math.max(2, (unpaid / maxBillingHours) * billingChartH) : 0;

    if (paidHeight) {
      const paidY = billingChartY + billingChartH - paidHeight;

      yearlyAddRect_(slide, x, paidY, billingBarWidth, paidHeight, s.green);

      // Paid value label
      yearlyAddText_(
        slide,
        yearlyFormatNumber_(paid),
        x - 4,
        paidY - 8,
        billingBarWidth + 8,
        7,
        {
          fontSize: 4,
          align: "center",
          color: s.muted,
        },
      );
    }

    if (unpaidHeight) {
      const unpaidX = x + billingBarWidth + billingBarGap;
      const unpaidY = billingChartY + billingChartH - unpaidHeight;

      yearlyAddRect_(
        slide,
        unpaidX,
        unpaidY,
        billingBarWidth,
        unpaidHeight,
        s.orange,
      );

      // Unpaid value label
      yearlyAddText_(
        slide,
        yearlyFormatNumber_(unpaid),
        unpaidX - 4,
        unpaidY - 8,
        billingBarWidth + 8,
        7,
        {
          fontSize: 4,
          align: "center",
          color: s.muted,
        },
      );
    }

    yearlyAddText_(
      slide,
      month.label || "",
      slotX,
      billingChartY + billingChartH + 3,
      billingSlotWidth,
      8,
      {
        fontSize: 5,
        align: "center",
        color: s.muted,
      },
    );
  });

  // ---------------------------------------------------------
  // TWO-COLUMN BILLING CHARTS
  // ---------------------------------------------------------

  const billingSectionY = 250;
  const billingSectionChartY = billingSectionY + 25;
  const billingSectionChartH = 75;

  // CHART 3: INVOICED HOURS

  yearlyAddText_(slide, "INVOICED HOURS", leftX, billingSectionY, 250, 13, {
    fontSize: 8,
    bold: true,
    color: s.navy,
  });

  const invoicedValues = months.map((month) =>
    month.invoicedHours == null || month.invoicedHours === ""
      ? null
      : Number(month.invoicedHours),
  );

  const validInvoiced = invoicedValues.filter(
    (value) => value !== null && Number.isFinite(value),
  );

  const maxInvoiced = Math.max(1, ...validInvoiced);

  const billingChartBarWidth = 13;
  const billingChartGap = 11;
  const invoicedChartX = leftX + 8;
  const invoicedChartW = 300;

  yearlyAddLine_(
    slide,
    invoicedChartX,
    billingSectionChartY + billingSectionChartH,
    invoicedChartX + invoicedChartW,
    billingSectionChartY + billingSectionChartH,
    s.border,
  );

  months.forEach((month, index) => {
    const value = invoicedValues[index];
    const x = invoicedChartX + index * (billingChartBarWidth + billingChartGap);

    if (value !== null && Number.isFinite(value) && value > 0) {
      const barHeight = Math.max(
        2,
        (value / maxInvoiced) * billingSectionChartH,
      );

      const barY = billingSectionChartY + billingSectionChartH - barHeight;

      yearlyAddRect_(slide, x, barY, billingChartBarWidth, barHeight, s.blue);

      yearlyAddText_(
        slide,
        yearlyFormatNumber_(value),
        x - 7,
        barY - 9,
        billingChartBarWidth + 14,
        8,
        {
          fontSize: 4.8,
          align: "center",
          color: s.muted,
        },
      );
    }

    yearlyAddText_(
      slide,
      month.label || "",
      x - 4,
      billingSectionChartY + billingSectionChartH + 3,
      billingChartBarWidth + 8,
      8,
      {
        fontSize: 5,
        align: "center",
        color: s.muted,
      },
    );
  });

  // CHART 4: COLLECTION RATE

  yearlyAddText_(slide, "COLLECTION RATE", rightX, billingSectionY, 250, 13, {
    fontSize: 8,
    bold: true,
    color: s.navy,
  });

  const collectionValues = months.map((month) =>
    month.collectionRate == null || month.collectionRate === ""
      ? null
      : Number(month.collectionRate),
  );

  const collectionChartX = rightX + 8;
  const collectionChartW = 300;
  const maxCollection = 100;

  yearlyAddLine_(
    slide,
    collectionChartX,
    billingSectionChartY + billingSectionChartH,
    collectionChartX + collectionChartW,
    billingSectionChartY + billingSectionChartH,
    s.border,
  );

  months.forEach((month, index) => {
    const value = collectionValues[index];
    const x =
      collectionChartX + index * (billingChartBarWidth + billingChartGap);

    if (value !== null && Number.isFinite(value) && value > 0) {
      const barHeight = Math.max(
        2,
        (Math.min(value, maxCollection) / maxCollection) * billingSectionChartH,
      );

      const barY = billingSectionChartY + billingSectionChartH - barHeight;

      yearlyAddRect_(slide, x, barY, billingChartBarWidth, barHeight, s.green);

      yearlyAddText_(
        slide,
        `${value.toFixed(1)}%`,
        x - 7,
        barY - 9,
        billingChartBarWidth + 14,
        8,
        {
          fontSize: 4.8,
          align: "center",
          color: s.muted,
        },
      );
    }

    yearlyAddText_(
      slide,
      month.label || "",
      x - 4,
      billingSectionChartY + billingSectionChartH + 3,
      billingChartBarWidth + 8,
      8,
      {
        fontSize: 5,
        align: "center",
        color: s.muted,
      },
    );
  });

  yearlyAddFooter_(slide, 2, data.year);
}

function createYearlyClientsSlide_(slide, data) {
  const s = YEARLY_SLIDE_STYLE;

  yearlyAddPageHeader_(
    slide,
    "Client Billing & Exposure",
    `Top 10 clients ranked in ${data.year}`,
  );

  const clients = (data.clients || []).slice(0, 10);

  const columns = [
    { label: "RANK", x: 36, w: 45 },
    { label: "CLIENT", x: 88, w: 250 },
    { label: "HOURS", x: 350, w: 75 },
    { label: "PAID", x: 435, w: 75 },
    { label: "OWED", x: 520, w: 75 },
    { label: "NET", x: 605, w: 75 },
  ];

  yearlyAddRect_(slide, 28, 112, 664, 29, s.navy);

  columns.forEach((column) => {
    yearlyAddText_(slide, column.label, column.x, 120, column.w, 12, {
      fontSize: 7,
      bold: true,
      color: s.white,
      align: column.label === "CLIENT" ? "left" : "right",
    });
  });

  if (!clients.length) {
    yearlyAddText_(
      slide,
      "No client billing records were found for this year.",
      45,
      165,
      600,
      20,
      { fontSize: 10, color: s.muted },
    );
  }

  const rowHeight = 19;

  clients.forEach((client, index) => {
    const y = 141 + index * rowHeight;

    if (index % 2 === 0) {
      yearlyAddRect_(slide, 28, y, 664, rowHeight, s.white);
    }

    const values = [
      [String(client.rank || index + 1), columns[0]],
      [String(client.client || "").trim(), columns[1]],
      [yearlyFormatNumber_(client.hours), columns[2]],
      [yearlyFormatNumber_(client.paid), columns[3]],
      [yearlyFormatNumber_(client.owed), columns[4]],
      [yearlyFormatNumber_(client.netHours), columns[5]],
    ];

    values.forEach(([value, column]) => {
      yearlyAddText_(slide, value, column.x, y + 3, column.w, 13, {
        fontSize: 8,
        color: column.label === "OWED" ? s.orange : s.text,
        bold: column.label === "CLIENT",
        align: column.label === "CLIENT" ? "left" : "right",
      });
    });
  });

  yearlyAddText_(
    slide,
    "This table shows the top 10 clients by owed hours, not the complete client list.",
    32,
    350,
    650,
    10,
    { fontSize: 7, color: s.muted },
  );

  yearlyAddFooter_(slide, 3, data.year);
}

function createYearlyReportSlides_(
  slides,
  reportData,
  onProgress,
  presentationId,
) {
  if (!Array.isArray(slides) || slides.length !== 3) {
    throw new Error("Yearly report requires exactly three slides.");
  }

  if (!presentationId) {
    throw new Error("A presentation ID is required for batch rendering.");
  }

  const builders = [
    {
      page: "Annual Performance Overview",
      build: () => createYearlyOverviewSlide_(slides[0], reportData),
    },
    {
      page: "Monthly Performance Trends",
      build: () => createYearlyMonthlySlide_(slides[1], reportData),
    },
    {
      page: "Client Billing & Exposure",
      build: () => createYearlyClientsSlide_(slides[2], reportData),
    },
  ];

  builders.forEach(({ page, build }, index) => {
    try {
      onProgress?.(`Preparing ${page}`);

      // Build the page locally. No Slides API calls happen here.
      build();

      onProgress?.(`Saving ${page}`);

      // Submit the page's queued requests.
      yearlyFlushSlideRequests_(presentationId, slides[index]);
    } catch (error) {
      throw new Error(`[YEARLY_REPORT_PAGE: ${page}] ${error.message}`, {
        cause: error,
      });
    }
  });
}

/**
 * =========================================================
 * YEARLY REPORT — GOOGLE SLIDES API RENDERER
 * =========================================================
 *
 * Each page is represented by a lightweight rendering context.
 * Drawing helpers queue API requests instead of calling SlidesApp.
 */

const YEARLY_SLIDES_BATCH_SIZE = 450;

function yearlyCreateSlideContext_(pageObjectId) {
  return {
    pageObjectId,
    groups: [],
    requestCount: 0,
  };
}

function yearlyNextSlideObjectId_(prefix = "gcb") {
  const id = `${prefix}_${Utilities.getUuid().replace(/-/g, "")}`;

  // Slides API object IDs must be 5–50 characters.
  return id.slice(0, 50);
}

function yearlyHexToRgb_(value) {
  if (typeof value !== "string") {
    throw new Error(`Invalid slide color: ${value}`);
  }

  let hex = value.trim().replace(/^#/, "");

  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    hex = hex
      .split("")
      .map((char) => char + char)
      .join("");
  }

  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(`Unsupported slide color: ${value}`);
  }

  return {
    red: parseInt(hex.slice(0, 2), 16) / 255,
    green: parseInt(hex.slice(2, 4), 16) / 255,
    blue: parseInt(hex.slice(4, 6), 16) / 255,
  };
}

function yearlyPt_(magnitude) {
  return {
    magnitude: Number(magnitude),
    unit: "PT",
  };
}

function yearlyAddSlideRequestGroup_(slide, requests) {
  if (!slide || !Array.isArray(slide.groups)) {
    throw new Error("Invalid yearly slide rendering context.");
  }

  if (!Array.isArray(requests) || !requests.length) {
    return;
  }

  slide.groups.push(requests);
  slide.requestCount += requests.length;
}

/**
 * Creates one text box and applies its formatting.
 * All operations are queued for batchUpdate.
 */
function yearlyAddText_(slide, text, x, y, w, h, options = {}) {
  const content = String(text ?? "");
  const objectId = yearlyNextSlideObjectId_("gcb_text");

  const requests = [
    {
      createShape: {
        objectId,
        shapeType: "TEXT_BOX",
        elementProperties: {
          pageObjectId: slide.pageObjectId,
          size: {
            width: yearlyPt_(w),
            height: yearlyPt_(h),
          },
          transform: {
            scaleX: 1,
            scaleY: 1,
            translateX: Number(x),
            translateY: Number(y),
            unit: "PT",
          },
        },
      },
    },
  ];

  if (content) {
    requests.push({
      insertText: {
        objectId,
        insertionIndex: 0,
        text: content,
      },
    });

    requests.push({
      updateTextStyle: {
        objectId,
        textRange: {
          type: "ALL",
        },
        style: {
          fontFamily: "Arial",
          fontSize: yearlyPt_(options.fontSize || 10),
          foregroundColor: {
            opaqueColor: {
              rgbColor: yearlyHexToRgb_(
                options.color || YEARLY_SLIDE_STYLE.text,
              ),
            },
          },
          bold: Boolean(options.bold),
        },
        fields: "fontFamily,fontSize,foregroundColor,bold",
      },
    });

    requests.push({
      updateParagraphStyle: {
        objectId,
        textRange: {
          type: "ALL",
        },
        style: {
          alignment:
            options.align === "center"
              ? "CENTER"
              : options.align === "right"
                ? "END"
                : "START",
        },
        fields: "alignment",
      },
    });

    requests.push({
      updateShapeProperties: {
        objectId,
        shapeProperties: {
          contentAlignment: options.valign === "middle" ? "MIDDLE" : "TOP",
        },
        fields: "contentAlignment",
      },
    });
  }

  yearlyAddSlideRequestGroup_(slide, requests);

  return objectId;
}

/**
 * Creates a rectangle with fill and optional border.
 */
function yearlyAddRect_(slide, x, y, w, h, fill, options = {}) {
  const objectId = yearlyNextSlideObjectId_("gcb_rect");
  const fillRgb = yearlyHexToRgb_(fill);

  const shapeProperties = {
    shapeBackgroundFill: {
      solidFill: {
        color: {
          rgbColor: fillRgb,
        },
      },
    },
  };

  let fields = "shapeBackgroundFill.solidFill.color";

  if (options.border) {
    shapeProperties.outline = {
      outlineFill: {
        solidFill: {
          color: {
            rgbColor: yearlyHexToRgb_(options.border),
          },
        },
      },
      weight: {
        magnitude: options.borderWidth || 1,
        unit: "PT",
      },
    };

    fields += ",outline.outlineFill.solidFill.color,outline.weight";
  } else {
    shapeProperties.outline = {
      propertyState: "NOT_RENDERED",
    };

    fields += ",outline.propertyState";
  }

  yearlyAddSlideRequestGroup_(slide, [
    {
      createShape: {
        objectId,
        shapeType: "RECTANGLE",
        elementProperties: {
          pageObjectId: slide.pageObjectId,
          size: {
            width: yearlyPt_(w),
            height: yearlyPt_(h),
          },
          transform: {
            scaleX: 1,
            scaleY: 1,
            translateX: Number(x),
            translateY: Number(y),
            unit: "PT",
          },
        },
      },
    },
    {
      updateShapeProperties: {
        objectId,
        shapeProperties,
        fields,
      },
    },
  ]);

  return objectId;
}

/**
 * Creates and styles a straight line.
 */
function yearlyAddLine_(slide, x1, y1, x2, y2, color, weight = 1) {
  const objectId = yearlyNextSlideObjectId_("gcb_line");

  yearlyAddSlideRequestGroup_(slide, [
    {
      createLine: {
        objectId,
        lineCategory: "STRAIGHT",
        elementProperties: {
          pageObjectId: slide.pageObjectId,
          size: {
            width: yearlyPt_(Math.abs(x2 - x1)),
            height: yearlyPt_(Math.abs(y2 - y1)),
          },
          transform: {
            scaleX: x2 >= x1 ? 1 : -1,
            scaleY: y2 >= y1 ? 1 : -1,
            translateX: Number(x1),
            translateY: Number(y1),
            unit: "PT",
          },
        },
      },
    },
    {
      updateLineProperties: {
        objectId,
        lineProperties: {
          lineFill: {
            solidFill: {
              color: {
                rgbColor: yearlyHexToRgb_(color),
              },
            },
          },
          weight: yearlyPt_(weight),
        },
        fields: "lineFill.solidFill.color,weight",
      },
    },
  ]);

  return objectId;
}

/**
 * Sends queued requests in chunks.
 * Each element's dependent requests remain in the same chunk.
 */
function yearlyFlushSlideRequests_(presentationId, slide) {
  let batch = [];
  let batchNumber = 0;

  const flush = () => {
    if (!batch.length) return;

    batchNumber++;

    Slides.Presentations.batchUpdate(
      {
        requests: batch,
      },
      presentationId,
    );

    batch = [];
  };

  slide.groups.forEach((group) => {
    if (
      batch.length &&
      batch.length + group.length > YEARLY_SLIDES_BATCH_SIZE
    ) {
      flush();
    }

    batch.push(...group);
  });

  flush();

  console.info(
    `[YEARLY_RENDER] Slide ${slide.pageObjectId}: ` +
      `${slide.requestCount} requests across ${batchNumber} batches`,
  );

  slide.groups = [];
}

// =========================================================
// MONTHLY SLIDE BUILDERS
// =========================================================

function monthlyAddPageHeader_(slide, title, subtitle) {
  const s = YEARLY_SLIDE_STYLE;

  yearlyAddRect_(slide, 0, 0, s.width, s.height, s.background);

  yearlyAddText_(slide, "GCB | BILLING & HOURS", 28, 16, 300, 15, {
    fontSize: 8,
    bold: true,
    color: s.blue,
  });

  yearlyAddText_(slide, title, 28, 38, 620, 30, {
    fontSize: 21,
    bold: true,
    color: s.navy,
  });

  yearlyAddText_(slide, subtitle, 28, 70, 650, 18, {
    fontSize: 9,
    color: s.muted,
  });

  yearlyAddLine_(slide, 28, 94, 692, 94, s.border, 1);
}

function monthlyAddFooter_(slide, pageNumber, period) {
  const s = YEARLY_SLIDE_STYLE;

  yearlyAddLine_(slide, 28, 382, 692, 382, s.border, 1);

  yearlyAddText_(
    slide,
    `GCB Monthly Performance Report | ${period}`,
    28,
    386,
    450,
    12,
    { fontSize: 7, color: s.muted },
  );

  yearlyAddText_(slide, `${pageNumber} / 3`, 650, 386, 42, 12, {
    fontSize: 7,
    color: s.muted,
    align: "right",
  });
}

function monthlyFormatValue_(value) {
  return yearlyFormatNumber_(value);
}

function monthlyFormatRate_(value) {
  return yearlyFormatPercent_(value);
}

function monthlyAddMetricRow_(slide, label, value, y, accent) {
  const s = YEARLY_SLIDE_STYLE;

  yearlyAddRect_(slide, 28, y, 664, 36, s.white, {
    border: s.border,
  });

  yearlyAddRect_(slide, 28, y, 4, 36, accent);

  yearlyAddText_(slide, label, 44, y + 10, 330, 15, {
    fontSize: 9,
    color: s.text,
  });

  yearlyAddText_(slide, value, 500, y + 8, 175, 18, {
    fontSize: 11,
    bold: true,
    color: s.navy,
    align: "right",
  });
}

function createMonthlyOverviewSlide_(slide, data) {
  const s = YEARLY_SLIDE_STYLE;
  const overview = data.overview;
  const period = data.reportPeriod;

  const periodLabel = `${period.monthName} ${period.year}`;

  monthlyAddPageHeader_(
    slide,
    "Monthly Performance Overview",
    `Billing and hours performance summary | ${periodLabel}`,
  );

  const cards = [
    ["Total Hours", monthlyFormatValue_(overview.totalHours), s.blue],
    ["Paid", monthlyFormatValue_(overview.paid), s.green],
    ["Unpaid", monthlyFormatValue_(overview.unpaid), s.orange],
    ["Outstanding", monthlyFormatValue_(overview.outstanding), s.red],
  ];

  cards.forEach((card, index) => {
    yearlyAddKpiCard_(
      slide,
      28 + index * 168,
      112,
      156,
      68,
      card[0],
      card[1],
      card[2],
    );
  });

  // Collection rate
  yearlyAddRect_(slide, 28, 198, 320, 76, s.white, {
    border: s.border,
  });

  yearlyAddText_(slide, "COLLECTION RATE", 44, 210, 180, 13, {
    fontSize: 8,
    bold: true,
    color: s.muted,
  });

  yearlyAddText_(
    slide,
    monthlyFormatRate_(overview.collectionRate),
    44,
    231,
    200,
    27,
    {
      fontSize: 21,
      bold: true,
      color: s.green,
    },
  );

  // Unpaid rate
  yearlyAddRect_(slide, 372, 198, 320, 76, s.white, {
    border: s.border,
  });

  yearlyAddText_(slide, "UNPAID RATE", 388, 210, 180, 13, {
    fontSize: 8,
    bold: true,
    color: s.muted,
  });

  yearlyAddText_(
    slide,
    monthlyFormatRate_(overview.unpaidRate),
    388,
    231,
    200,
    27,
    {
      fontSize: 21,
      bold: true,
      color: s.orange,
    },
  );

  // Additional billing indicators
  yearlyAddText_(slide, "BILLING BREAKDOWN", 28, 292, 250, 15, {
    fontSize: 9,
    bold: true,
    color: s.navy,
  });

  const breakdown = [
    ["Invoiced Hours", monthlyFormatValue_(overview.invoiced), s.blue],
    ["Invoiced Rate", monthlyFormatRate_(overview.invoicedRate), s.navy],
    ["Unpaid Hours", monthlyFormatValue_(overview.unpaid), s.orange],
    ["Outstanding Hours", monthlyFormatValue_(overview.outstanding), s.red],
  ];

  breakdown.forEach((item, index) => {
    const x = 28 + index * 168;

    yearlyAddRect_(slide, x, 316, 156, 48, s.white, {
      border: s.border,
    });

    yearlyAddText_(slide, item[0], x + 9, 322, 138, 11, {
      fontSize: 7,
      color: s.muted,
    });

    yearlyAddText_(slide, item[1], x + 9, 338, 138, 17, {
      fontSize: 11,
      bold: true,
      color: item[2],
    });
  });

  monthlyAddFooter_(slide, 1, periodLabel);
}

function createMonthlyTrendsSlide_(slide, data) {
  const s = YEARLY_SLIDE_STYLE;
  const months = data.trends || [];
  const period = data.reportPeriod;

  const periodLabel = `${period.monthName} ${period.year}`;

  monthlyAddPageHeader_(
    slide,
    "Monthly Performance Trends",
    `Hours and billing trends from January through ${periodLabel}`,
  );

  const chartTop = 112;
  const chartHeight = 65;
  const chartWidth = 300;
  const leftX = 28;
  const rightX = 372;

  // ---------------------------------------------------------
  // CHART 1: TOTAL HOURS
  // ---------------------------------------------------------

  yearlyAddText_(slide, "TOTAL HOURS", leftX, chartTop, 250, 13, {
    fontSize: 8,
    bold: true,
    color: s.navy,
  });

  const hoursValues = months.map((month) =>
    month.totalHours == null ? null : Number(month.totalHours),
  );

  const validHours = hoursValues.filter(
    (value) => value !== null && Number.isFinite(value),
  );

  const maxHours = Math.max(1, ...validHours);
  const barWidth = Math.min(18, chartWidth / Math.max(months.length * 1.5, 1));
  const slotWidth = chartWidth / Math.max(months.length, 1);

  const hoursY = chartTop + 27;

  yearlyAddLine_(
    slide,
    leftX + 8,
    hoursY + chartHeight,
    leftX + 8 + chartWidth,
    hoursY + chartHeight,
    s.border,
  );

  months.forEach((month, index) => {
    const value = hoursValues[index];
    const x = leftX + 8 + index * slotWidth + (slotWidth - barWidth) / 2;

    if (value !== null && Number.isFinite(value) && value > 0) {
      const height = Math.max(2, (value / maxHours) * chartHeight);
      const y = hoursY + chartHeight - height;

      yearlyAddRect_(slide, x, y, barWidth, height, s.blue);

      yearlyAddText_(
        slide,
        compactYearlyValue_(value),
        x - 7,
        y - 9,
        barWidth + 14,
        8,
        {
          fontSize: 5,
          align: "center",
          color: s.muted,
        },
      );
    }

    yearlyAddText_(
      slide,
      month.label || "",
      leftX + 8 + index * slotWidth,
      hoursY + chartHeight + 4,
      slotWidth,
      8,
      {
        fontSize: 6,
        align: "center",
        color: s.muted,
      },
    );
  });

  // ---------------------------------------------------------
  // CHART 2: PAID VS UNPAID
  // ---------------------------------------------------------

  yearlyAddText_(slide, "PAID VS UNPAID", rightX, chartTop, 200, 13, {
    fontSize: 8,
    bold: true,
    color: s.navy,
  });

  yearlyAddRect_(slide, rightX + 177, chartTop + 2, 7, 7, s.green);

  yearlyAddText_(slide, "Paid", rightX + 187, chartTop, 35, 11, {
    fontSize: 6,
    color: s.muted,
  });

  yearlyAddRect_(slide, rightX + 232, chartTop + 2, 7, 7, s.orange);

  yearlyAddText_(slide, "Unpaid", rightX + 242, chartTop, 45, 11, {
    fontSize: 6,
    color: s.muted,
  });

  const billingValues = months.flatMap((month) => [
    Number(month.paid) || 0,
    Number(month.unpaid) || 0,
  ]);

  const maxBilling = Math.max(1, ...billingValues);
  const billingY = chartTop + 27;
  const groupBarWidth = Math.min(7, barWidth / 2);
  const groupGap = 2;

  yearlyAddLine_(
    slide,
    rightX + 8,
    billingY + chartHeight,
    rightX + 8 + chartWidth,
    billingY + chartHeight,
    s.border,
  );

  months.forEach((month, index) => {
    const slotX = rightX + 8 + index * slotWidth;
    const groupWidth = groupBarWidth * 2 + groupGap;
    const x = slotX + (slotWidth - groupWidth) / 2;

    const paid = Number(month.paid) || 0;
    const unpaid = Number(month.unpaid) || 0;

    if (paid > 0) {
      const height = Math.max(2, (paid / maxBilling) * chartHeight);

      yearlyAddRect_(
        slide,
        x,
        billingY + chartHeight - height,
        groupBarWidth,
        height,
        s.green,
      );
    }

    if (unpaid > 0) {
      const height = Math.max(2, (unpaid / maxBilling) * chartHeight);

      yearlyAddRect_(
        slide,
        x + groupBarWidth + groupGap,
        billingY + chartHeight - height,
        groupBarWidth,
        height,
        s.orange,
      );
    }

    yearlyAddText_(
      slide,
      month.label || "",
      slotX,
      billingY + chartHeight + 4,
      slotWidth,
      8,
      {
        fontSize: 6,
        align: "center",
        color: s.muted,
      },
    );
  });

  // ---------------------------------------------------------
  // CHART 3: INVOICED HOURS
  // ---------------------------------------------------------

  const lowerY = 255;
  const lowerChartY = lowerY + 27;
  const lowerChartHeight = 65;

  yearlyAddText_(slide, "INVOICED HOURS", leftX, lowerY, 250, 13, {
    fontSize: 8,
    bold: true,
    color: s.navy,
  });

  const invoicedValues = months.map((month) =>
    month.invoiced == null ? null : Number(month.invoiced),
  );

  const validInvoiced = invoicedValues.filter(
    (value) => value !== null && Number.isFinite(value),
  );

  const maxInvoiced = Math.max(1, ...validInvoiced);

  yearlyAddLine_(
    slide,
    leftX + 8,
    lowerChartY + lowerChartHeight,
    leftX + 8 + chartWidth,
    lowerChartY + lowerChartHeight,
    s.border,
  );

  months.forEach((month, index) => {
    const value = invoicedValues[index];
    const x = leftX + 8 + index * slotWidth + (slotWidth - barWidth) / 2;

    if (value !== null && Number.isFinite(value) && value > 0) {
      const height = Math.max(2, (value / maxInvoiced) * lowerChartHeight);

      const y = lowerChartY + lowerChartHeight - height;

      yearlyAddRect_(slide, x, y, barWidth, height, s.blue);
    }

    yearlyAddText_(
      slide,
      month.label || "",
      leftX + 8 + index * slotWidth,
      lowerChartY + lowerChartHeight + 4,
      slotWidth,
      8,
      {
        fontSize: 6,
        align: "center",
        color: s.muted,
      },
    );
  });

  // ---------------------------------------------------------
  // CHART 4: COLLECTION RATE
  // ---------------------------------------------------------

  yearlyAddText_(slide, "COLLECTION RATE", rightX, lowerY, 250, 13, {
    fontSize: 8,
    bold: true,
    color: s.navy,
  });

  yearlyAddLine_(
    slide,
    rightX + 8,
    lowerChartY + lowerChartHeight,
    rightX + 8 + chartWidth,
    lowerChartY + lowerChartHeight,
    s.border,
  );

  months.forEach((month, index) => {
    const rawValue = month.collectionRate;
    const value =
      rawValue == null || rawValue === ""
        ? null
        : Math.abs(Number(rawValue)) <= 1
          ? Number(rawValue) * 100
          : Number(rawValue);

    const x = rightX + 8 + index * slotWidth + (slotWidth - barWidth) / 2;

    if (value !== null && Number.isFinite(value) && value > 0) {
      const height = Math.max(
        2,
        (Math.min(value, 100) / 100) * lowerChartHeight,
      );

      const y = lowerChartY + lowerChartHeight - height;

      yearlyAddRect_(slide, x, y, barWidth, height, s.green);

      yearlyAddText_(
        slide,
        `${value.toFixed(0)}%`,
        x - 5,
        y - 9,
        barWidth + 10,
        8,
        {
          fontSize: 5,
          align: "center",
          color: s.muted,
        },
      );
    }

    yearlyAddText_(
      slide,
      month.label || "",
      rightX + 8 + index * slotWidth,
      lowerChartY + lowerChartHeight + 4,
      slotWidth,
      8,
      {
        fontSize: 6,
        align: "center",
        color: s.muted,
      },
    );
  });

  monthlyAddFooter_(slide, 2, periodLabel);
}

function createMonthlyBillingSlide_(slide, data) {
  const s = YEARLY_SLIDE_STYLE;
  const overview = data.overview;
  const period = data.reportPeriod;

  const periodLabel = `${period.monthName} ${period.year}`;

  monthlyAddPageHeader_(
    slide,
    "Monthly Billing Breakdown",
    `Billing status and collection indicators | ${periodLabel}`,
  );

  const rows = [
    ["Total Hours", overview.totalHours, s.blue],
    ["Paid", overview.paid, s.green],
    ["Unpaid", overview.unpaid, s.orange],
    ["Invoiced", overview.invoiced, s.blue],
    ["Outstanding", overview.outstanding, s.red],
  ];

  yearlyAddRect_(slide, 28, 112, 664, 29, s.navy);

  yearlyAddText_(slide, "BILLING CATEGORY", 44, 120, 330, 12, {
    fontSize: 7,
    bold: true,
    color: s.white,
  });

  yearlyAddText_(slide, "HOURS", 500, 120, 160, 12, {
    fontSize: 7,
    bold: true,
    color: s.white,
    align: "right",
  });

  rows.forEach((item, index) => {
    const y = 141 + index * 34;

    yearlyAddRect_(
      slide,
      28,
      y,
      664,
      34,
      index % 2 === 0 ? s.white : s.background,
      { border: s.border },
    );

    yearlyAddRect_(slide, 28, y, 4, 34, item[2]);

    yearlyAddText_(slide, item[0], 44, y + 10, 330, 14, {
      fontSize: 9,
      color: s.text,
      bold: true,
    });

    yearlyAddText_(slide, monthlyFormatValue_(item[1]), 500, y + 9, 160, 15, {
      fontSize: 10,
      bold: true,
      color: s.navy,
      align: "right",
    });
  });

  // ---------------------------------------------------------
  // RATE SUMMARY
  // ---------------------------------------------------------

  yearlyAddText_(slide, "BILLING RATES", 28, 332, 200, 14, {
    fontSize: 9,
    bold: true,
    color: s.navy,
  });

  const rates = [
    ["Collection", overview.collectionRate, s.green],
    ["Unpaid", overview.unpaidRate, s.orange],
    ["Invoiced", overview.invoicedRate, s.blue],
  ];

  rates.forEach((item, index) => {
    const x = 28 + index * 224;

    yearlyAddRect_(slide, x, 350, 208, 27, s.white, {
      border: s.border,
    });

    yearlyAddText_(slide, item[0], x + 10, 357, 80, 12, {
      fontSize: 7,
      color: s.muted,
    });

    yearlyAddText_(slide, monthlyFormatRate_(item[1]), x + 95, 355, 100, 15, {
      fontSize: 10,
      bold: true,
      color: item[2],
      align: "right",
    });
  });

  monthlyAddFooter_(slide, 3, periodLabel);
}

function createMonthlyReportSlides_(
  slides,
  reportData,
  onProgress,
  presentationId,
) {
  if (!Array.isArray(slides) || slides.length !== 3) {
    throw new Error("Monthly report requires exactly three slides.");
  }

  if (!presentationId) {
    throw new Error("A presentation ID is required for batch rendering.");
  }

  const builders = [
    {
      page: "Monthly Performance Overview",
      build: () => createMonthlyOverviewSlide_(slides[0], reportData),
    },
    {
      page: "Monthly Performance Trends",
      build: () => createMonthlyTrendsSlide_(slides[1], reportData),
    },
    {
      page: "Monthly Billing Breakdown",
      build: () => createMonthlyBillingSlide_(slides[2], reportData),
    },
  ];

  builders.forEach(({ page, build }, index) => {
    try {
      onProgress?.(`Preparing ${page}`);

      build();

      onProgress?.(`Saving ${page}`);

      yearlyFlushSlideRequests_(presentationId, slides[index]);
    } catch (error) {
      throw new Error(`[MONTHLY_REPORT_PAGE: ${page}] ${error.message}`, {
        cause: error,
      });
    }
  });
}