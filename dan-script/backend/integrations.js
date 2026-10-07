function getIntegrationStatus(sessionId, signature) {
  requireCapability(sessionId, signature, "settings.manage");

  const properties = PropertiesService.getScriptProperties();

  const notificationEmail = properties.getProperty("NOTIFICATION_EMAIL");

  const discordWebhook = properties.getProperty("DISCORD_WEBHOOK_URL");

  const spreadsheetId = properties.getProperty("SPREADSHEET_ID");

  const externalSheetTemplateId = properties.getProperty(
    "EXTERNAL_SHEET_TEMPLATE_ID",
  );

  const reportFolderId = properties.getProperty("REPORT_FOLDER_ID");

  const backupFolderId = properties.getProperty("BACKUP_FOLDER_ID");

  const mainSheetsFolderId = properties.getProperty("MAIN_SHEETS_FOLDER_ID");

  const getAuthorization = (integration) => {
    try {
      return getIntegrationAuthorizationStatus(
        sessionId,
        signature,
        integration,
      );
    } catch (error) {
      return {
        authorized: false,
        service: integration,
        message: "Authorization status unavailable.",
      };
    }
  };

  return {
    gmail: {
      authorization: getAuthorization("gmail"),
      notifEmail: {
        configured: Boolean(notificationEmail),
        masked: maskSecret(notificationEmail),
      },
    },

    discord: {
      authorization: getAuthorization("discord"),
      notifDiscord: {
        configured: Boolean(discordWebhook),
        masked: maskSecret(discordWebhook),
      },
    },

    sheets: {
      authorization: getAuthorization("sheets"),
      spreadsheetId: {
        configured: Boolean(spreadsheetId),
        masked: maskSecret(spreadsheetId),
      },
      externalSheetTemplateId: {
        configured: Boolean(externalSheetTemplateId),
        masked: maskSecret(externalSheetTemplateId),
      },
    },

    drive: {
      authorization: getAuthorization("drive"),
      reportFolderId: {
        configured: Boolean(reportFolderId),
        masked: maskSecret(reportFolderId),
      },
      backupFolderId: {
        configured: Boolean(backupFolderId),
        masked: maskSecret(backupFolderId),
      },
      mainSheetsFolderId: {
        configured: Boolean(mainSheetsFolderId),
        masked: maskSecret(mainSheetsFolderId),
      },
    },

    calendar: {
      authorization: getAuthorization("calendar"),
    },
  };
}

function getIntegrationConfigStatus(sessionId, signature, integration) {
  requireCapability(sessionId, signature, "settings.manage");

  const properties = PropertiesService.getScriptProperties();

  const integrationType = Validation.enumValue(integration, "integration", [
    "gmail",
    "discord",
    "sheets",
    "drive",
  ]);

  switch (integrationType) {
    case "gmail": {
      const value = properties.getProperty("NOTIFICATION_EMAIL");

      return {
        fields: {
          notifEmail: {
            configured: Boolean(value),
            masked: maskSecret(value),
          },
        },
      };
    }

    case "discord": {
      const value = properties.getProperty("DISCORD_WEBHOOK_URL");

      return {
        fields: {
          notifDiscord: {
            configured: Boolean(value),
            masked: maskSecret(value),
          },
        },
      };
    }

    case "sheets": {
      const spreadsheetId = properties.getProperty("SPREADSHEET_ID");

      const externalSheetTemplateId = properties.getProperty(
        "EXTERNAL_SHEET_TEMPLATE_ID",
      );

      return {
        fields: {
          spreadsheetId: {
            configured: Boolean(spreadsheetId),
            masked: maskSecret(spreadsheetId),
          },

          externalSheetTemplateId: {
            configured: Boolean(externalSheetTemplateId),
            masked: maskSecret(externalSheetTemplateId),
          },
        },
      };
    }

    case "drive": {
      const reportFolderId = properties.getProperty("REPORT_FOLDER_ID");

      const backupFolderId = properties.getProperty("BACKUP_FOLDER_ID");

      const mainSheetsFolderId = properties.getProperty(
        "MAIN_SHEETS_FOLDER_ID",
      );

      return {
        fields: {
          reportFolderId: {
            configured: Boolean(reportFolderId),
            masked: maskSecret(reportFolderId),
          },

          backupFolderId: {
            configured: Boolean(backupFolderId),
            masked: maskSecret(backupFolderId),
          },

          mainSheetsFolderId: {
            configured: Boolean(mainSheetsFolderId),
            masked: maskSecret(mainSheetsFolderId),
          },
        },
      };
    }

    default:
      throw new Error(`Unsupported integration: ${integrationType}`);
  }
}

function getIntegrationAuthorizationStatus(sessionId, signature, integration) {
  requireCapability(sessionId, signature, "settings.manage");

  const integrationType = Validation.enumValue(integration, "integration", [
    "gmail",
    "discord",
    "sheets",
    "drive",
    "calendar",
  ]);

  try {
    switch (integrationType) {
      case "drive": {
        const root = DriveApp.getRootFolder();

        return {
          authorized: true,
          service: "drive",
          message: "Google Drive access is authorized.",
          name: root.getName(),
        };
      }

      case "sheets": {
        const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

        return {
          authorized: true,
          service: "sheets",
          message: "Google Sheets access is authorized.",
          name: spreadsheet?.getName?.() || "Google Sheets access available.",
        };
      }

      case "gmail": {
        const draft = GmailApp.getDrafts();

        return {
          authorized: true,
          service: "gmail",
          message: "Gmail access is authorized.",
        };
      }

      case "calendar": {
        const calendar = CalendarApp.getDefaultCalendar();

        return {
          authorized: true,
          service: "calendar",
          message: "Google Calendar access is authorized.",
          name: calendar.getName(),
        };
      }

      case "discord":
        return {
          authorized: true,
          service: "discord",
          message: "Discord does not require Google authorization.",
        };

      default:
        throw new Error(`Unsupported integration: ${integrationType}`);
    }
  } catch (error) {
    console.error(
      `[Integration] ${integrationType} authorization check failed:`,
      error,
    );

    return {
      authorized: false,
      service: integrationType,
      message:
        "Google service authorization is required before this integration can be used.",
    };
  }
}

function verifyDriveFolderAccess(folderId, label) {
  Validation.driveFolderId(folderId, label);

  try {
    const folder = DriveApp.getFolderById(folderId);

    return {
      id: folderId,
      name: folder.getName(),
      accessible: true,
    };
  } catch (error) {
    throw new Error(
      `${label} could not be accessed. ` +
        "Make sure the folder exists and the authorized Google account has access to it.",
    );
  }
}

function verifySpreadsheetAccess(spreadsheetId, label) {
  Validation.spreadsheetId(spreadsheetId, label);

  try {
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);

    return {
      id: spreadsheetId,
      name: spreadsheet.getName(),
      accessible: true,
    };
  } catch (error) {
    throw new Error(
      `${label} could not be accessed. ` +
        "Make sure the spreadsheet exists and the authorized Google account has access to it.",
    );
  }
}

function saveIntegration(sessionId, signature, integration, value) {
  requireCapability(sessionId, signature, "settings.manage");

  const integrationType = Validation.enumValue(integration, "integration", [
    "gmail",
    "discord",
    "sheets",
    "drive",
  ]);

  const properties = PropertiesService.getScriptProperties();

  if (integrationType === "drive") {
    Validation.requireObject(value, "Google Drive configuration");

    const reportFolderId = String(value?.reportFolderId || "").trim();

    const backupFolderId = String(value?.backupFolderId || "").trim();

    const mainSheetsFolderId = String(value?.mainSheetsFolderId || "").trim();

    /*
     * Only validate values that were provided.
     * Blank fields keep the existing configuration.
     */
    if (reportFolderId) {
      verifyDriveFolderAccess(reportFolderId, "Report Folder ID");

      properties.setProperty("REPORT_FOLDER_ID", reportFolderId);
    }

    if (backupFolderId) {
      verifyDriveFolderAccess(backupFolderId, "Backup Folder ID");

      properties.setProperty("BACKUP_FOLDER_ID", backupFolderId);
    }

    if (mainSheetsFolderId) {
      verifyDriveFolderAccess(mainSheetsFolderId, "Main Sheets Folder ID");

      properties.setProperty("MAIN_SHEETS_FOLDER_ID", mainSheetsFolderId);
    }

    reconcileScheduledTriggersInternal();

    return {
      success: true,
      integration: integrationType,
    };
  }

  if (integrationType === "sheets") {
    Validation.requireObject(value, "Google Sheets configuration");

    const spreadsheetId = String(value?.spreadsheetId || "").trim();

    const externalSheetTemplateId = String(
      value?.externalSheetTemplateId || "",
    ).trim();

    if (spreadsheetId) {
      verifySpreadsheetAccess(spreadsheetId, "Google Spreadsheet ID");

      properties.setProperty("SPREADSHEET_ID", spreadsheetId);
    }

    if (externalSheetTemplateId) {
      verifySpreadsheetAccess(
        externalSheetTemplateId,
        "External Sheet Template ID",
      );

      properties.setProperty(
        "EXTERNAL_SHEET_TEMPLATE_ID",
        externalSheetTemplateId,
      );
    }

    reconcileScheduledTriggersInternal();

    return {
      success: true,
      integration: integrationType,
    };
  }

  const cleanValue = Validation.requiredString(value, "Configuration value", {
    maxLength: 500,
  });

  switch (integrationType) {
    case "gmail":
      Validation.email(cleanValue, "Notification email");

      properties.setProperty("NOTIFICATION_EMAIL", cleanValue);
      break;

    case "discord":
      Validation.discordWebhook(cleanValue, "Discord webhook");

      properties.setProperty("DISCORD_WEBHOOK_URL", cleanValue);
      break;
  }

  reconcileScheduledTriggersInternal();

  return {
    success: true,
    integration: integrationType,
  };
}
