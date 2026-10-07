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
      authorization: {
        authorized: false,
        service: "calendar",
        configured: false,
        message: "Google Calendar integration is not implemented yet.",
      },
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
  ]);

  const scopeMap = {
    gmail: "https://www.googleapis.com/auth/script.send_mail",
    sheets: "https://www.googleapis.com/auth/spreadsheets",
    drive: "https://www.googleapis.com/auth/drive",
  };

  if (integrationType === "discord") {
    return {
      authorized: true,
      service: "discord",
      message: "Discord does not require Google authorization.",
    };
  }

  const scope = scopeMap[integrationType];

  const authInfo = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL, [
    scope,
  ]);

  const authorized =
    authInfo.getAuthorizationStatus() ===
    ScriptApp.AuthorizationStatus.NOT_REQUIRED;

  return {
    authorized,
    service: integrationType,
    message: authorized
      ? getIntegrationAuthorizationMessage(integrationType, true)
      : getIntegrationAuthorizationMessage(integrationType, false),
  };
}

function getIntegrationAuthorizationMessage(
  integration,
  authorized,
) {
  if (authorized) {
    switch (integration) {
      case "gmail":
        return "Google mail access is authorized.";

      case "sheets":
        return "Google Sheets access is authorized.";

      case "drive":
        return "Google Drive access is authorized.";

      default:
        return "Google service access is authorized.";
    }
  }

  switch (integration) {
    case "gmail":
      return "Google mail authorization is required.";

    case "sheets":
      return "Google Sheets authorization is required.";

    case "drive":
      return "Google Drive authorization is required.";

    default:
      return "Google service authorization is required.";
  }
}

function getIntegrationAuthorizationUrl(sessionId, signature, integration) {
  requireCapability(sessionId, signature, "settings.manage");

  const integrationType = Validation.enumValue(integration, "integration", [
    "gmail",
    "sheets",
    "drive",
  ]);

  const scopeMap = {
    gmail: "https://www.googleapis.com/auth/script.send_mail",
    sheets: "https://www.googleapis.com/auth/spreadsheets",
    drive: "https://www.googleapis.com/auth/drive",
  };

  const scope = scopeMap[integrationType];

  const authInfo = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL, [
    scope,
  ]);

  if (
    authInfo.getAuthorizationStatus() ===
    ScriptApp.AuthorizationStatus.NOT_REQUIRED
  ) {
    return {
      authorized: true,
      url: null,
      integration: integrationType,
    };
  }

  const authorizationUrl = authInfo.getAuthorizationUrl();

  if (!authorizationUrl) {
    throw new Error("Google authorization URL could not be generated.");
  }

  return {
    authorized: false,
    url: authorizationUrl,
    integration: integrationType,
  };
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
    Validation.requireObject(value, "Drive configuration");

    const validated = {};

    if (value.reportFolderId) {
      const folderId = Validation.driveFolderId(
        value.reportFolderId,
        "Report folder ID",
      );

      validated.reportFolderId = verifyDriveFolderAccess(
        folderId,
        "Report folder",
      );
    }

    if (value.backupFolderId) {
      const folderId = Validation.driveFolderId(
        value.backupFolderId,
        "Backup folder ID",
      );

      validated.backupFolderId = verifyDriveFolderAccess(
        folderId,
        "Backup folder",
      );
    }

    if (value.mainSheetsFolderId) {
      const folderId = Validation.driveFolderId(
        value.mainSheetsFolderId,
        "Main sheets folder ID",
      );

      validated.mainSheetsFolderId = verifyDriveFolderAccess(
        folderId,
        "Main sheets folder",
      );
    }

    if (validated.reportFolderId) {
      properties.setProperty("REPORT_FOLDER_ID", validated.reportFolderId.id);
    }

    if (validated.backupFolderId) {
      properties.setProperty("BACKUP_FOLDER_ID", validated.backupFolderId.id);
    }

    if (validated.mainSheetsFolderId) {
      properties.setProperty(
        "MAIN_SHEETS_FOLDER_ID",
        validated.mainSheetsFolderId.id,
      );
    }

    reconcileScheduledTriggersInternal();

    return {
      success: true,
      integration: "drive",
    };
  }

  if (integrationType === "sheets") {
    Validation.requireObject(value, "Sheets configuration");

    const validated = {};

    if (value.spreadsheetId) {
      const spreadsheetId = Validation.spreadsheetId(
        value.spreadsheetId,
        "Spreadsheet ID",
      );

      validated.spreadsheetId = verifySpreadsheetAccess(
        spreadsheetId,
        "Main spreadsheet",
      );
    }

    if (value.externalSheetTemplateId) {
      const templateId = Validation.spreadsheetId(
        value.externalSheetTemplateId,
        "External sheet template ID",
      );

      validated.externalSheetTemplateId = verifySpreadsheetAccess(
        templateId,
        "External sheet template",
      );
    }

    if (validated.spreadsheetId) {
      properties.setProperty("SPREADSHEET_ID", validated.spreadsheetId.id);
    }

    if (validated.externalSheetTemplateId) {
      properties.setProperty(
        "EXTERNAL_SHEET_TEMPLATE_ID",
        validated.externalSheetTemplateId.id,
      );
    }

    reconcileScheduledTriggersInternal();

    return {
      success: true,
      integration: "sheets",
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
