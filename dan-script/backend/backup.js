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
 * Create a backup of all Google Sheets
 * directly inside the main sheets folder.
 */
function backupAllSheets() {
  requireAuthorizedUser();

  const sourceFolder = getBackupSourceFolder();
  const backupFolder = getBackupFolder();

  const now = new Date();

  const timestamp = Utilities.formatDate(
    now,
    Session.getScriptTimeZone(),
    "yyyy-MM-dd HH-mm-ss",
  );

  const backupName = `${BACKUP_CONFIG.backupFolderPrefix}${timestamp}`;

  const destinationFolder = backupFolder.createFolder(backupName);

  const files = sourceFolder.getFilesByType(MimeType.GOOGLE_SHEETS);

  let processed = 0;
  let backedUp = 0;
  let skipped = 0;

  while (files.hasNext()) {
    const file = files.next();

    processed++;

    try {
      file.makeCopy(file.getName(), destinationFolder);

      backedUp++;
    } catch (err) {
      skipped++;

      console.error(`Failed to backup "${file.getName()}":`, err);
    }
  }

  const result = {
    success: true,
    backupFolderId: destinationFolder.getId(),
    backupFolderName: backupName,
    processed,
    backedUp,
    skipped,
  };

  Logger.log(result);

  return result;
}

/**
 * Delete backup folders older than the configured retention period.
 */
function cleanupOldBackups() {
  requireAuthorizedUser();

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
    const backup = backupAllSheets();

    cleanupOldBackups();

    return backup;
  } catch (err) {
    console.error("Scheduled backup failed:", err);

    throw err;
  }
}