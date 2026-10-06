function getIntegrationStatus() {
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

  return {
    notifEmail: {
      configured: Boolean(notificationEmail),
      masked: maskSecret(notificationEmail),
    },

    notifDiscord: {
      configured: Boolean(discordWebhook),
      masked: maskSecret(discordWebhook),
    },

    spreadsheetId: {
      configured: Boolean(spreadsheetId),
      masked: maskSecret(spreadsheetId),
    },

    externalSheetTemplateId: {
      configured: Boolean(externalSheetTemplateId),
      masked: maskSecret(externalSheetTemplateId),
    },

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
  };
}

function getIntegrationConfigStatus(integration) {
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

function saveIntegration(integration, value) {
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
      Validation.driveFolderId(reportFolderId, "Report Folder ID");

      properties.setProperty("REPORT_FOLDER_ID", reportFolderId);
    }

    if (backupFolderId) {
      Validation.driveFolderId(backupFolderId, "Backup Folder ID");

      properties.setProperty("BACKUP_FOLDER_ID", backupFolderId);
    }

    if (mainSheetsFolderId) {
      Validation.driveFolderId(mainSheetsFolderId, "Main Sheets Folder ID");

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
      Validation.spreadsheetId(spreadsheetId, "Google Spreadsheet ID");

      properties.setProperty("SPREADSHEET_ID", spreadsheetId);
    }

    if (externalSheetTemplateId) {
      Validation.spreadsheetId(
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
