const BACKUP_CONFIG = {
  sourceFolderProperty: "MAIN_SHEETS_FOLDER_ID",
  backupFolderProperty: "BACKUP_FOLDER_ID",

  backupFolderPrefix: "GAS Backup - ",

  retentionYears: 3,
};

/**
 * Get the source folder containing the main
 * spreadsheet, external template, and external sheets.
 */
function getBackupSourceFolder() {
  const folderId = PropertiesService.getScriptProperties().getProperty(
    BACKUP_CONFIG.sourceFolderProperty,
  );

  if (!folderId) {
    throw new Error(
      `Missing Script Property: ${BACKUP_CONFIG.sourceFolderProperty}`,
    );
  }

  return DriveApp.getFolderById(folderId);
}

/**
 * Get the dedicated backup folder.
 */
function getBackupFolder() {
  const folderId = PropertiesService.getScriptProperties().getProperty(
    BACKUP_CONFIG.backupFolderProperty,
  );

  if (!folderId) {
    throw new Error(
      `Missing Script Property: ${BACKUP_CONFIG.backupFolderProperty}`,
    );
  }

  return DriveApp.getFolderById(folderId);
}

/**
 * Return ZIP-only backup history for the admin Backup Management page.
 */
function getBackupHistory(sessionId, signature) {
  requireRole(sessionId, signature, "admin");

  const backupFolder = getBackupFolder();
  const folders = backupFolder.getFolders();
  const backups = [];

  while (folders.hasNext()) {
    const folder = folders.next();
    const folderName = folder.getName();

    if (!folderName.startsWith(BACKUP_CONFIG.backupFolderPrefix)) {
      continue;
    }

    const zipFiles = folder.getFiles();
    const backupFiles = [];
    const legacyFiles = [];

    while (zipFiles.hasNext()) {
      const file = zipFiles.next();
      const fileName = file.getName();

      if (fileName.toLowerCase().endsWith(".zip")) {
        // The overall ZIP is displayed separately from individual ZIPs.
        if (!fileName.endsWith(" - ALL.zip")) {
          backupFiles.push({
            id: file.getId(),
            name: fileName,
            url: file.getUrl(),
            downloadUrl:
              "https://drive.google.com/uc?export=download&id=" +
              encodeURIComponent(file.getId()),
            size: file.getSize(),
          });
        }
      } else if (file.getMimeType() === MimeType.GOOGLE_SHEETS) {
        // Keep older backups visible in the history.
        legacyFiles.push({
          id: file.getId(),
          name: file.getName(),
          url: file.getUrl(),
          downloadUrl:
            "https://docs.google.com/spreadsheets/d/" +
            encodeURIComponent(file.getId()) +
            "/export?format=xlsx",
        });
      }
    }

    const zipFile = findBackupZipFile_(folder);
    const createdAt = folder.getDateCreated();

    // Older backup folders contain individual Google Sheets rather than ZIPs.
    const displayedFiles = backupFiles.length ? backupFiles : legacyFiles;

    backups.push({
      id: folder.getId(),
      name: folderName,
      createdAt: createdAt.getTime(),
      createdAtLabel: Utilities.formatDate(
        createdAt,
        Session.getScriptTimeZone(),
        "yyyy-MM-dd HH:mm:ss",
      ),
      folderUrl: folder.getUrl(),
      fileCount: displayedFiles.length,
      files: displayedFiles,
      zipFileId: zipFile?.getId() || null,
      zipFileName: zipFile?.getName() || null,
      zipUrl: zipFile
        ? `https://drive.google.com/file/d/${zipFile.getId()}/view`
        : null,
      zipDownloadUrl: zipFile
        ? "https://drive.google.com/uc?export=download&id=" +
          encodeURIComponent(zipFile.getId())
        : null,
      zipSize: zipFile?.getSize() || 0,
    });
  }

  backups.sort((a, b) => b.createdAt - a.createdAt);

  return {
    success: true,
    destinationUrl: backupFolder.getUrl(),
    total: backups.length,
    latestBackup: backups.length ? backups[0].createdAtLabel : null,
    backups,
  };
}

/**
 * Create a backup of all Google Sheets
 * directly inside the main sheets folder.
 */
function backupAllSheets(sessionId, signature) {
  requireRole(sessionId, signature, "admin");

  return backupAllSheetsInternal();
}

function backupAllSheetsInternal(triggerType = "MANUAL") {
  const startedAt = Date.now();
  const timestamp = new Date();

  let backupName = "";
  let destinationFolderId = "";
  let processed = 0;
  let backedUp = 0;
  let skipped = 0;
  let zipResult = null;

  const failedFiles = [];

  try {
    const sourceFolder = getBackupSourceFolder();
    const backupFolder = getBackupFolder();

    const formattedTimestamp = Utilities.formatDate(
      timestamp,
      Session.getScriptTimeZone(),
      "yyyy-MM-dd HH-mm-ss",
    );

    backupName = `${BACKUP_CONFIG.backupFolderPrefix}${formattedTimestamp}`;

    const destinationFolder = backupFolder.createFolder(backupName);
    destinationFolderId = destinationFolder.getId();

    zipResult = createBackupZip_(destinationFolder, sourceFolder, backupName);

    processed = zipResult.processedFiles;
    backedUp = zipResult.individualArchives;
    skipped = zipResult.failedFiles;
    failedFiles.push(...zipResult.failedFileDetails);

    const overallZipCreated = zipResult.created;

    const status =
      skipped === 0 && overallZipCreated
        ? "SUCCESS"
        : backedUp > 0 || overallZipCreated
          ? "PARTIAL"
          : "FAILED";

    const result = {
      success: status !== "FAILED",
      status,
      backupFolderId: destinationFolderId,
      backupFolderName: backupName,
      processed,
      backedUp,
      skipped,
      failedFiles,
      zip: zipResult,
    };

    recordGcbOperationLog_({
      timestamp,
      category: "BACKUP",
      operation: "CREATE_BACKUP",
      status,
      trigger: triggerType,
      durationMs: Date.now() - startedAt,
      processed,
      succeeded: backedUp,
      failed: skipped,
      target: backupName || destinationFolderId,
      message:
        `Processed ${processed}; individual ZIPs ${backedUp}; ` +
        `failed ${skipped}; overall ZIP ${overallZipCreated ? "created" : "failed"}.`,
      error: failedFiles
        .map((item) => `${item.name}: ${item.error}`)
        .concat(zipResult.overallZipError || [])
        .join("\n"),
    });

    Logger.log(result);

    return result;
  } catch (error) {
    recordGcbOperationLog_({
      timestamp,
      category: "BACKUP",
      operation: "CREATE_BACKUP",
      status: "FAILED",
      trigger: triggerType,
      durationMs: Date.now() - startedAt,
      processed,
      succeeded: backedUp,
      failed: skipped,
      target: backupName || destinationFolderId,
      message: "Backup execution stopped unexpectedly.",
      error: String(error?.message || error),
    });

    throw error;
  }
}

/**
 * Create one ZIP per spreadsheet and one overall ZIP containing
 * all successfully exported XLSX files.
 *
 * The destination folder contains ZIP files only.
 */
function createBackupZip_(destinationFolder, sourceFolder, backupName) {
  const xlsxBlobs = [];
  const failedFileDetails = [];

  let processedFiles = 0;
  let individualArchives = 0;

  const files = sourceFolder.getFilesByType(MimeType.GOOGLE_SHEETS);

  while (files.hasNext()) {
    const file = files.next();
    processedFiles++;

    try {
      const fileSuffix = file.getId().slice(-8);
      const safeName = sanitizeBackupFileName_(file.getName());

      const xlsxBlob = exportGoogleSheetAsXlsx_(
        file.getId(),
        `${safeName} [${fileSuffix}]`,
      );

      // Create an individual ZIP containing this spreadsheet's XLSX export.
      const individualZipName = `Sheet - ${safeName} [${fileSuffix}].zip`;

      const individualZip = Utilities.zip([xlsxBlob], individualZipName);

      destinationFolder.createFile(individualZip);

      individualArchives++;
      xlsxBlobs.push(xlsxBlob);
    } catch (error) {
      const details = {
        name: file.getName(),
        error: String(error?.message || error).slice(0, 300),
      };

      failedFileDetails.push(details);

      console.error(`Failed to create ZIP for "${file.getName()}":`, error);
    }
  }

  let overallZip = null;
  let overallZipError = "";

  if (xlsxBlobs.length) {
    try {
      overallZip = destinationFolder.createFile(
        Utilities.zip(xlsxBlobs, `${backupName} - ALL.zip`),
      );
    } catch (error) {
      overallZipError = String(error?.message || error).slice(0, 500);

      console.error("Failed to create overall backup ZIP:", error);
    }
  }

  return {
    created: Boolean(overallZip),
    processedFiles,
    individualArchives,
    failedFiles: failedFileDetails.length,
    failedFileDetails,
    zipFileId: overallZip?.getId() || null,
    zipFileName: overallZip?.getName() || null,
    overallZipError,
    exportedFiles: xlsxBlobs.length,
    message: overallZip
      ? "Individual ZIP archives and the overall ZIP were processed."
      : "The overall ZIP could not be created.",
  };
}

/**
 * Remove characters that could cause problems in ZIP entry filenames.
 */
function sanitizeBackupFileName_(fileName) {
  return (
    String(fileName || "Spreadsheet")
      .replace(/[\\/:*?"<>|]/g, "-")
      .trim()
      .slice(0, 150) || "Spreadsheet"
  );
}

function findBackupZipFile_(folder) {
  const zipFiles = folder.getFiles();
  let fallbackZip = null;

  while (zipFiles.hasNext()) {
    const file = zipFiles.next();
    const name = file.getName();

    if (!name.toLowerCase().endsWith(".zip")) {
      continue;
    }

    if (name.endsWith(" - ALL.zip")) {
      return file;
    }

    // Supports older backup folders that used a different ZIP name.
    if (!fallbackZip) {
      fallbackZip = file;
    }
  }

  return fallbackZip;
}

function exportGoogleSheetAsXlsx_(spreadsheetId, fileName) {
  const exportUrl =
    "https://www.googleapis.com/drive/v3/files/" +
    spreadsheetId +
    "/export" +
    "?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  const response = UrlFetchApp.fetch(exportUrl, {
    headers: {
      Authorization: `Bearer ${ScriptApp.getOAuthToken()}`,
    },
  });

  if (response.getResponseCode() !== 200) {
    throw new Error(
      `Drive export failed with status ${response.getResponseCode()}`,
    );
  }

  return Utilities.newBlob(
    response.getBlob().getBytes(),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    `${fileName}.xlsx`,
  );
}

/**
 * Delete backup folders older than the configured retention period.
 */
function cleanupOldBackups() {
  const backupFolder = getBackupFolder();

  const cutoff = new Date();

  cutoff.setFullYear(cutoff.getFullYear() - BACKUP_CONFIG.retentionYears);

  const folders = backupFolder.getFolders();

  let processed = 0;
  let deleted = 0;
  let kept = 0;

  while (folders.hasNext()) {
    const folder = folders.next();

    const name = folder.getName();

    /*
     * Only touch folders created by this backup system.
     */
    if (!name.startsWith(BACKUP_CONFIG.backupFolderPrefix)) {
      continue;
    }

    processed++;

    if (folder.getDateCreated() < cutoff) {
      folder.setTrashed(true);
      deleted++;
    } else {
      kept++;
    }
  }

  const result = {
    success: true,
    processed,
    deleted,
    kept,
    cutoff,
  };

  Logger.log(result);

  return result;
}

function scheduledBackup() {
  try {
    const today = new Date();

    const month = today.getMonth() + 1;
    const day = today.getDate();

    /*
     * Run backups on the 1st day of:
     * January, April, July, and October.
     */
    if (day !== 1 || ![1, 4, 7, 10].includes(month)) {
      return {
        success: true,
        skipped: true,
        reason: "Not a scheduled backup date.",
      };
    }

    const backup = backupAllSheetsInternal("SCHEDULED");

    cleanupOldBackups();

    return backup;
  } catch (err) {
    console.error("Scheduled backup failed:", err);

    throw err;
  }
}