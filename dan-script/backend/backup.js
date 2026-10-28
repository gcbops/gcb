const BACKUP_CONFIG = {
  registryProperty: "MANAGER_REGISTRY_SPREADSHEET_ID",
  adminBackupFolderProperty: "ADMIN_COMBINED_BACKUP_FOLDER_ID",
  backupFolderPrefix: "GAS Backup - ",
  retentionYears: 3,
};

function getAdminCombinedBackupFolder_() {
  const folderId = PropertiesService.getScriptProperties().getProperty(
    BACKUP_CONFIG.adminBackupFolderProperty,
  );

  if (!folderId) {
    throw new Error(
      `Missing Script Property: ${BACKUP_CONFIG.adminBackupFolderProperty}`,
    );
  }

  return DriveApp.getFolderById(folderId);
}

function getBackupManagers_() {
  const registryId = PropertiesService.getScriptProperties().getProperty(
    BACKUP_CONFIG.registryProperty,
  );

  if (!registryId) {
    throw new Error(
      `Missing Script Property: ${BACKUP_CONFIG.registryProperty}`,
    );
  }

  const registry = openSpreadsheetById(registryId);
  const sheet = registry.getSheetByName("Managers");

  if (!sheet) {
    throw new Error('The central registry is missing the "Managers" sheet.');
  }

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return [];
  }

  const headers = values[0].map((value) => String(value).trim().toLowerCase());

  const requiredHeaders = [
    "manager id",
    "manager name",
    "enabled",
    "operational spreadsheet id",
    "external sheets folder id",
    "backup folder id",
    "reports folder id",
  ];

  const columns = {};

  requiredHeaders.forEach((header) => {
    const index = headers.indexOf(header);

    if (index === -1) {
      throw new Error(`Managers registry is missing the "${header}" column.`);
    }

    columns[header] = index;
  });

  return values.slice(1).flatMap((row, index) => {
    const enabledValue = row[columns.enabled];
    const enabled =
      enabledValue === true ||
      ["true", "1", "yes"].includes(String(enabledValue).trim().toLowerCase());

    const managerId = String(row[columns["manager id"]] || "").trim();
    const spreadsheetId = String(
      row[columns["operational spreadsheet id"]] || "",
    ).trim();
    const externalFolderId = String(
      row[columns["external sheets folder id"]] || "",
    ).trim();
    const backupFolderId = String(
      row[columns["backup folder id"]] || "",
    ).trim();
    const reportsFolderId = String(
      row[columns["reports folder id"]] || "",
    ).trim();

    if (!enabled) {
      return [];
    }

    if (!managerId || !spreadsheetId || !backupFolderId || !reportsFolderId) {
      throw new Error(
        `Enabled manager on registry row ${index + 2} is missing a manager ID, operational spreadsheet ID, backup folder ID, or reports folder ID.`,
      );
    }

    return [
      {
        managerId,
        managerName: String(row[columns["manager name"]] || managerId).trim(),
        spreadsheetId,
        externalFolderId,
        backupFolderId,
        reportsFolderId,
      },
    ];
  });
}

function getManagerBackupFolder_(manager) {
  return DriveApp.getFolderById(manager.backupFolderId);
}

function getManagerBackupSourceFiles_(manager) {
  if (
    !manager?.managerId ||
    !manager?.spreadsheetId ||
    !manager?.backupFolderId
  ) {
    throw new Error("A valid enabled manager entry is required.");
  }

  const filesById = new Map();

  // 1. Include the manager's operational spreadsheet.
  const operationalFile = DriveApp.getFileById(manager.spreadsheetId);

  if (operationalFile.getMimeType() !== MimeType.GOOGLE_SHEETS) {
    throw new Error(
      `Operational file for ${manager.managerId} is not a Google Spreadsheet.`,
    );
  }

  filesById.set(operationalFile.getId(), operationalFile);

  // 2. Include Google Sheets directly inside the external sheets folder.
  if (manager.externalFolderId) {
    const externalFolder = DriveApp.getFolderById(manager.externalFolderId);

    const externalFiles = externalFolder.getFilesByType(MimeType.GOOGLE_SHEETS);

    while (externalFiles.hasNext()) {
      const file = externalFiles.next();

      if (!file.isTrashed()) {
        filesById.set(file.getId(), file);
      }
    }
  }

  // 3. Include ALL files directly inside this manager's Reports Folder.
  // No report-log lookup, file-type filter, or file-ownership check is used.
  if (manager.reportsFolderId) {
    const reportsFolder = DriveApp.getFolderById(manager.reportsFolderId);

    const reportFiles = reportsFolder.getFiles();

    while (reportFiles.hasNext()) {
      const file = reportFiles.next();

      if (!file.isTrashed()) {
        filesById.set(file.getId(), file);
      }
    }
  }

  return Array.from(filesById.values());
}

function getBackupHistory(sessionId, signature) {
  requireRole(sessionId, signature, "admin");

  const backupFolder = getAdminCombinedBackupFolder_();
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

    let metadata = null;

    try {
      const description = folder.getDescription() || "";
      const prefix = "GCB_BACKUP_METADATA=";

      if (description.startsWith(prefix)) {
        metadata = JSON.parse(description.slice(prefix.length));
      }
    } catch (error) {
      console.warn(
        `[BackupHistory] Could not parse metadata for ${folderName}:`,
        error,
      );
    }

    const fileCount = Number.isFinite(Number(metadata?.fileCount))
      ? Number(metadata.fileCount)
      : legacyFiles.length || backupFiles.length || 0;

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
      fileCount,
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

function backupAllSheets(sessionId, signature) {
  requireRole(sessionId, signature, "admin");

  return backupAllManagersCombinedInternal_();
}

function backupAllSheetsInternal_(manager, triggerType = "SCHEDULED") {
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
    const sourceFiles = getManagerBackupSourceFiles_(manager);
    const backupFolder = getManagerBackupFolder_(manager);

    const formattedTimestamp = Utilities.formatDate(
      timestamp,
      Session.getScriptTimeZone(),
      "yyyy-MM-dd HH-mm-ss",
    );

    backupName =
      `${BACKUP_CONFIG.backupFolderPrefix}${manager.managerId} - ${formattedTimestamp}`;

    const destinationFolder = backupFolder.createFolder(backupName);
    destinationFolderId = destinationFolder.getId();

    zipResult = createBackupZip_(
      destinationFolder,
      sourceFiles,
      backupName,
    );

    setBackupFolderMetadata_(destinationFolder, zipResult);

    processed = zipResult.processedFiles;
    backedUp = zipResult.created ? 1 : 0;
    skipped = zipResult.failedFiles;
    failedFiles.push(...zipResult.failedFileDetails);

    const status = !zipResult.created
      ? "FAILED"
      : skipped > 0
        ? "PARTIAL"
        : "SUCCESS";

    const result = {
      success: status !== "FAILED",
      status,
      managerId: manager.managerId,
      backupFolderId: destinationFolderId,
      backupFolderName: backupName,
      processed,
      backedUp,
      exportedFiles: zipResult.exportedFiles,
      skipped,
      failedFiles,
      zip: zipResult,
    };

    recordGcbOperationLog_({
      timestamp,
      category: "BACKUP",
      operation: "CREATE_MANAGER_BACKUP",
      status,
      trigger: triggerType,
      durationMs: Date.now() - startedAt,
      processed,
      succeeded: zipResult.exportedFiles,
      failed: skipped,
      target: `${manager.managerId}: ${backupName}`,
      message:
        `Manager ${manager.managerId}; processed ${processed}; ` +
        `exported ${zipResult.exportedFiles}; failed ${skipped}; ` +
        `overall ZIP ${zipResult.created ? "created" : "failed"}.`,
      error: failedFiles
        .map((item) => `${item.name}: ${item.error}`)
        .concat(zipResult.overallZipError || [])
        .join("\n"),
    });

    Logger.log(result);

    if (status === "FAILED") {
      throw new Error(
        `Backup failed for manager ${manager.managerId}: ${zipResult.overallZipError || "No files were successfully exported."}`,
      );
    }

    return result;
  } catch (error) {
    // Avoid duplicating the operation log if the backup result was already logged.
    if (!zipResult) {
      recordGcbOperationLog_({
        timestamp,
        category: "BACKUP",
        operation: "CREATE_MANAGER_BACKUP",
        status: "FAILED",
        trigger: triggerType,
        durationMs: Date.now() - startedAt,
        processed,
        succeeded: backedUp,
        failed: skipped,
        target: `${manager.managerId}: ${backupName || destinationFolderId}`,
        message: "Manager backup execution stopped unexpectedly.",
        error: String(error?.message || error),
      });
    }

    throw error;
  }
}

function backupAllManagersCombinedInternal_() {
  const startedAt = Date.now();
  const timestamp = new Date();

  let backupName = "";
  let destinationFolderId = "";
  let zipResult = null;

  try {
    const managers = getBackupManagers_();
    const filesById = new Map();
    const collectionErrors = [];

    managers.forEach((manager) => {
      try {
        const managerFiles = getManagerBackupSourceFiles_(manager);

        managerFiles.forEach((file) => {
          filesById.set(file.getId(), file);
        });
      } catch (error) {
        collectionErrors.push({
          managerId: manager.managerId,
          error: String(error?.message || error),
        });

        console.error(
          `[Backup] Failed collecting files for ${manager.managerId}:`,
          error,
        );
      }
    });

    const sourceFiles = Array.from(filesById.values());
    const backupFolder = getAdminCombinedBackupFolder_();

    const formattedTimestamp = Utilities.formatDate(
      timestamp,
      Session.getScriptTimeZone(),
      "yyyy-MM-dd HH-mm-ss",
    );

    backupName =
      `${BACKUP_CONFIG.backupFolderPrefix}ADMIN COMBINED - ${formattedTimestamp}`;

    const destinationFolder = backupFolder.createFolder(backupName);
    destinationFolderId = destinationFolder.getId();

    // false = do not create individual ZIPs for this admin backup.
    zipResult = createBackupZip_(
      destinationFolder,
      sourceFiles,
      backupName,
    );

    setBackupFolderMetadata_(destinationFolder, zipResult, {
      collectionErrors,
    });

    const totalFailures = zipResult.failedFiles + collectionErrors.length;

    const status = !zipResult.created
      ? "FAILED"
      : totalFailures > 0
        ? "PARTIAL"
        : "SUCCESS";

    const result = {
      success: status !== "FAILED",
      status,
      backupFolderId: destinationFolderId,
      backupFolderName: backupName,
      managerCount: managers.length,
      processed: zipResult.processedFiles,
      exportedFiles: zipResult.exportedFiles,
      skipped: totalFailures,
      failedFiles: zipResult.failedFileDetails,
      collectionErrors,
      zip: zipResult,
    };

    recordGcbOperationLog_({
      timestamp,
      category: "BACKUP",
      operation: "CREATE_ADMIN_COMBINED_BACKUP",
      status,
      trigger: "MANUAL",
      durationMs: Date.now() - startedAt,
      processed: zipResult.processedFiles,
      succeeded: zipResult.exportedFiles,
      failed: zipResult.failedFiles,
      target: backupName || destinationFolderId,
      message:
        `Combined backup for ${managers.length} enabled managers; ` +
        `exported ${zipResult.exportedFiles}; failed ${zipResult.failedFiles}; ` +
        `overall ZIP ${zipResult.created ? "created" : "failed"}.`,
      error: zipResult.failedFileDetails
        .map((item) => `${item.name}: ${item.error}`)
        .concat(zipResult.overallZipError || [])
        .join("\n"),
    });

    Logger.log(result);

    if (status === "FAILED") {
      throw new Error(
        `Admin combined backup failed: ${zipResult.overallZipError || "No spreadsheets were successfully exported."}`,
      );
    }

    return result;
  } catch (error) {
    if (!zipResult) {
      recordGcbOperationLog_({
        timestamp,
        category: "BACKUP",
        operation: "CREATE_ADMIN_COMBINED_BACKUP",
        status: "FAILED",
        trigger: "MANUAL",
        durationMs: Date.now() - startedAt,
        processed: 0,
        succeeded: 0,
        failed: 0,
        target: backupName || destinationFolderId,
        message: "Admin combined backup execution stopped unexpectedly.",
        error: String(error?.message || error),
      });
    }

    throw error;
  }
}

function setBackupFolderMetadata_(folder, zipResult, extra = {}) {
  const metadata = {
    version: 1,
    created: Boolean(zipResult?.created),
    zipFileId: zipResult?.zipFileId || null,
    fileCount: Number(zipResult?.exportedFiles) || 0,
    processedFiles: Number(zipResult?.processedFiles) || 0,
    failedFiles: Number(zipResult?.failedFiles) || 0,
    ...extra,
  };

  folder.setDescription(`GCB_BACKUP_METADATA=${JSON.stringify(metadata)}`);
}

function createBackupZip_(destinationFolder, sourceFiles, backupName) {
  const backupBlobs = [];
  const failedFileDetails = [];

  const files = Array.isArray(sourceFiles) ? sourceFiles : [];

  files.forEach((file) => {
    try {
      const blob = exportBackupSourceFile_(file);

      if (!blob) {
        throw new Error("The export returned no file content.");
      }

      backupBlobs.push(blob);
    } catch (error) {
      const detail = {
        id: file.getId(),
        name: file.getName(),
        error: String(error?.message || error),
      };

      failedFileDetails.push(detail);

      console.error(
        `[Backup] Failed to export "${detail.name}" (${detail.id}): ${detail.error}`,
      );
    }
  });

  const baseName = String(backupName || "GAS Backup").replace(/\.zip$/i, "");

  if (backupBlobs.length === 0) {
    return {
      success: false,
      status: "FAILED",
      created: false,
      zipFileId: null,
      zipName: null,
      zipUrl: null,
      processedFiles: files.length,
      exportedFiles: 0,
      fileCount: 0,
      failedFiles: failedFileDetails.length,
      failedFileDetails,
      individualArchives: 0,
      overallZipError: "No files could be successfully exported.",
    };
  }

  try {
    // Exactly one ZIP per backup operation.
    const zipName = `${baseName}.zip`;
    const zipBlob = Utilities.zip(backupBlobs, zipName);
    const zipFile = destinationFolder.createFile(zipBlob);

    return {
      success: failedFileDetails.length === 0,
      status: failedFileDetails.length ? "PARTIAL" : "SUCCESS",
      created: true,
      zipFileId: zipFile.getId(),
      zipName: zipFile.getName(),
      zipUrl: zipFile.getUrl(),
      processedFiles: files.length,
      exportedFiles: backupBlobs.length,
      fileCount: backupBlobs.length,
      failedFiles: failedFileDetails.length,
      failedFileDetails,
      individualArchives: 0,
      overallZipError: null,
    };
  } catch (error) {
    return {
      success: false,
      status: "FAILED",
      created: false,
      zipFileId: null,
      zipName: null,
      zipUrl: null,
      processedFiles: files.length,
      exportedFiles: backupBlobs.length,
      fileCount: backupBlobs.length,
      failedFiles: failedFileDetails.length,
      failedFileDetails,
      individualArchives: 0,
      overallZipError: String(error?.message || error),
    };
  }
}

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

function exportBackupSourceFile_(file) {
  const fileId = file.getId();
  const mimeType = file.getMimeType();
  const fileName = file.getName();
  const fileSuffix = fileId.slice(-8);
  const safeName = sanitizeBackupFileName_(fileName);

  // Google Sheets must be exported as XLSX.
  if (mimeType === MimeType.GOOGLE_SHEETS) {
    return exportGoogleSheetAsXlsx_(fileId, `${safeName} [${fileSuffix}]`);
  }

  // Preserve ordinary Drive files in their original format.
  // Examples: PDF, CSV, XLSX, TXT, images, and other uploaded files.
  const blob = file.getBlob();

  const extensionMatch = fileName.match(/(\.[^.]+)$/);
  const extension = extensionMatch ? extensionMatch[1] : "";

  return blob.setName(`${safeName} [${fileSuffix}]${extension}`);
}

function cleanupOldBackups_(backupFolder) {
  if (!backupFolder) {
    throw new Error("A backup destination folder is required for cleanup.");
  }

  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - BACKUP_CONFIG.retentionYears);

  const folders = backupFolder.getFolders();

  let processed = 0;
  let deleted = 0;
  let kept = 0;

  while (folders.hasNext()) {
    const folder = folders.next();

    if (!folder.getName().startsWith(BACKUP_CONFIG.backupFolderPrefix)) {
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
    destinationFolderId: backupFolder.getId(),
  };

  Logger.log(result);

  return result;
}

function scheduledBackup() {
  const today = new Date();
  const month = today.getMonth() + 1;
  const day = today.getDate();

  // Preserve the existing quarterly schedule.
  if (day !== 1 || ![1, 4, 7, 10].includes(month)) {
    return {
      success: true,
      skipped: true,
      reason: "Not a scheduled backup date.",
    };
  }

  const managers = getBackupManagers_();
  const results = [];
  const cleanupResults = [];
  const errors = [];

  managers.forEach((manager) => {
    try {
      results.push(backupAllSheetsInternal_(manager, "SCHEDULED"));
    } catch (error) {
      errors.push({
        managerId: manager.managerId,
        error: String(error?.message || error),
      });

      console.error(`Scheduled backup failed for ${manager.managerId}:`, error);
    }

    // Clean only this manager's own backup destination.
    try {
      cleanupResults.push({
        managerId: manager.managerId,
        ...cleanupOldBackups_(getManagerBackupFolder_(manager)),
      });
    } catch (error) {
      errors.push({
        managerId: manager.managerId,
        cleanupError: String(error?.message || error),
      });

      console.error(`Backup cleanup failed for ${manager.managerId}:`, error);
    }
  });

  // Retain the same three-year policy for admin combined backups.
  try {
    cleanupResults.push({
      destination: "ADMIN_COMBINED_BACKUPS",
      ...cleanupOldBackups_(getAdminCombinedBackupFolder_()),
    });
  } catch (error) {
    errors.push({
      destination: "ADMIN_COMBINED_BACKUPS",
      cleanupError: String(error?.message || error),
    });

    console.error("Admin backup cleanup failed:", error);
  }

  return {
    success: errors.length === 0,
    scheduled: true,
    managerCount: managers.length,
    successfulBackups: results.filter((item) => item.success).length,
    failedBackups: errors.filter((item) => item.managerId).length,
    results,
    cleanupResults,
    errors,
  };
}


