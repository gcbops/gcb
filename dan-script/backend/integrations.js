const STATUS_PROPERTY_IDS = [
  "MANAGER_REGISTRY_SPREADSHEET_ID",
  "EXTERNAL_SHEET_TEMPLATE_ID",
  "ADMIN_COMBINED_BACKUP_FOLDER_ID",
];

function getPropertyStatus(sessionId, signature, propertyId) {
  requireRole(sessionId, signature, "manager");

  const allowedPropertyId = Validation.enumValue(
    propertyId,
    "propertyId",
    STATUS_PROPERTY_IDS,
  );

  const value =
    PropertiesService.getScriptProperties().getProperty(allowedPropertyId);

  return {
    success: true,
    propertyId: allowedPropertyId,
    configured: Boolean(value),
    masked: value ? maskSecret(value) : null,
  };
}

function getIntegrationStatus(sessionId, signature) {
  const { workspace } = getManagerIntegrationContext_(sessionId, signature);

  const properties = PropertiesService.getScriptProperties();

  const notificationEmail = getManagerIntegrationValue_(
    workspace.managerId,
    "NOTIFICATION_EMAIL",
  );

  const discordWebhook = getManagerIntegrationValue_(
    workspace.managerId,
    "DISCORD_WEBHOOK_URL",
  );

  const templateId = properties.getProperty("EXTERNAL_SHEET_TEMPLATE_ID");

  const getAuthorization = (integration) => {
    try {
      return getIntegrationAuthorizationStatus(
        sessionId,
        signature,
        integration,
      );
    } catch (error) {
      console.error(`[Integration] ${integration} status failed:`, error);

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
        masked: notificationEmail ? maskSecret(notificationEmail) : null,
      },
    },

    discord: {
      authorization: getAuthorization("discord"),
      notifDiscord: {
        configured: Boolean(discordWebhook),
        masked: discordWebhook ? maskSecret(discordWebhook) : null,
      },
    },

    sheets: {
      authorization: getAuthorization("sheets"),
      spreadsheetId: {
        configured: Boolean(workspace.spreadsheetId),
        masked: workspace.spreadsheetId
          ? maskSecret(workspace.spreadsheetId)
          : null,
      },
      externalSheetTemplateId: {
        configured: Boolean(templateId),
        masked: templateId ? maskSecret(templateId) : null,
      },
    },

    drive: {
      authorization: getAuthorization("drive"),
      reportsFolderId: {
        configured: Boolean(workspace.reportsFolderId),
        masked: workspace.reportsFolderId
          ? maskSecret(workspace.reportsFolderId)
          : null,
      },
      backupFolderId: {
        configured: Boolean(workspace.backupFolderId),
        masked: workspace.backupFolderId
          ? maskSecret(workspace.backupFolderId)
          : null,
      },
      externalSheetsFolderId: {
        configured: Boolean(workspace.externalSheetsFolderId),
        masked: workspace.externalSheetsFolderId
          ? maskSecret(workspace.externalSheetsFolderId)
          : null,
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
  const { workspace } = getManagerIntegrationContext_(sessionId, signature);

  const properties = PropertiesService.getScriptProperties();

  const integrationType = Validation.enumValue(integration, "integration", [
    "gmail",
    "discord",
    "sheets",
    "drive",
  ]);

  switch (integrationType) {
    case "gmail": {
      const value = getManagerIntegrationValue_(
        workspace.managerId,
        "NOTIFICATION_EMAIL",
      );

      return {
        fields: {
          notifEmail: {
            configured: Boolean(value),
            masked: value ? maskSecret(value) : null,
          },
        },
      };
    }

    case "discord": {
      const value = getManagerIntegrationValue_(
        workspace.managerId,
        "DISCORD_WEBHOOK_URL",
      );

      return {
        fields: {
          notifDiscord: {
            configured: Boolean(value),
            masked: value ? maskSecret(value) : null,
          },
        },
      };
    }

    case "sheets": {
      const templateId = properties.getProperty("EXTERNAL_SHEET_TEMPLATE_ID");

      return {
        fields: {
          spreadsheetId: {
            configured: Boolean(workspace.spreadsheetId),
            masked: workspace.spreadsheetId
              ? maskSecret(workspace.spreadsheetId)
              : null,
          },
          externalSheetTemplateId: {
            configured: Boolean(templateId),
            masked: templateId ? maskSecret(templateId) : null,
          },
        },
        readOnly: true,
      };
    }

    case "drive":
      return {
        fields: {
          reportFolderId: {
            configured: Boolean(workspace.reportsFolderId),
            masked: workspace.reportsFolderId
              ? maskSecret(workspace.reportsFolderId)
              : null,
          },
          backupFolderId: {
            configured: Boolean(workspace.backupFolderId),
            masked: workspace.backupFolderId
              ? maskSecret(workspace.backupFolderId)
              : null,
          },
          mainSheetsFolderId: {
            configured: Boolean(workspace.spreadsheetId),
            masked: workspace.spreadsheetId
              ? maskSecret(workspace.spreadsheetId)
              : null,
          },
        },
        readOnly: true,
      };

    default:
      throw new Error(`Unsupported integration: ${integrationType}`);
  }
}

function getIntegrationAuthorizationStatus(sessionId, signature, integration) {
  const { workspace } = getManagerIntegrationContext_(sessionId, signature);

  const integrationType = Validation.enumValue(integration, "integration", [
    "gmail",
    "discord",
    "sheets",
    "drive",
  ]);

  switch (integrationType) {
    case "discord":
      return {
        authorized: true,
        service: "discord",
        message: "Discord does not require Google authorization.",
      };

    case "drive": {
      try {
        const folders = [
          workspace.reportsFolderId,
          workspace.backupFolderId,
          workspace.externalSheetsFolderId,
        ].filter(Boolean);

        for (const folderId of folders) {
          DriveApp.getFolderById(folderId).getName();
        }

        DriveApp.getRootFolder();

        return {
          authorized: true,
          service: "drive",
          message: folders.length
            ? "Google Drive access and assigned workspace folders are accessible."
            : "Google Drive access is authorized, but no manager folders are configured.",
        };
      } catch (error) {
        console.error("[Integration] Manager Drive check failed:", error);

        return {
          authorized: false,
          service: "drive",
          message:
            "Google Drive access or one of the assigned workspace folders is unavailable.",
        };
      }
    }

    case "sheets": {
      if (!workspace.spreadsheetId) {
        return {
          authorized: false,
          service: "sheets",
          message: "No operational spreadsheet is assigned to this manager.",
        };
      }

      try {
        const spreadsheet = getMainSpreadsheet(workspace.spreadsheetId);

        return {
          authorized: true,
          service: "sheets",
          message: "The assigned operational spreadsheet is accessible.",
          name: spreadsheet.getName(),
        };
      } catch (error) {
        console.error("[Integration] Manager Sheets check failed:", error);

        return {
          authorized: false,
          service: "sheets",
          message:
            "The assigned operational spreadsheet could not be accessed.",
        };
      }
    }

    case "gmail": {
      try {
        MailApp.getRemainingDailyQuota();

        return {
          authorized: true,
          service: "gmail",
          message: "Google mail access is authorized.",
        };
      } catch (error) {
        console.error("[Integration] Gmail authorization check failed:", error);

        return {
          authorized: false,
          service: "gmail",
          message: "Google mail access is not available.",
        };
      }
    }

    default:
      throw new Error(`Unsupported integration: ${integrationType}`);
  }
}

function getIntegrationAuthorizationMessage(integration, authorized) {
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
  requireRole(sessionId, signature, "manager");

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
    const spreadsheet = getMainSpreadsheet(spreadsheetId);

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
  const { workspace } = getManagerIntegrationContext_(sessionId, signature);

  const startedAt = Date.now();
  const properties = PropertiesService.getScriptProperties();

  const integrationType = Validation.enumValue(integration, "integration", [
    "gmail",
    "discord",
    "sheets",
    "drive",
  ]);

  if (!["gmail", "discord"].includes(integrationType)) {
    throw new Error(
      "This integration is managed centrally or through the manager registry and cannot be changed here.",
    );
  }

  const cleanValue = Validation.requiredString(value, "Configuration value", {
    maxLength: 500,
  });

  let propertyName;
  let validatedValue;

  if (integrationType === "gmail") {
    validatedValue = Validation.email(cleanValue, "Notification email");

    propertyName = getManagerIntegrationPropertyKey_(
      workspace.managerId,
      "NOTIFICATION_EMAIL",
    );
  } else {
    validatedValue = Validation.discordWebhook(cleanValue, "Discord webhook");

    propertyName = getManagerIntegrationPropertyKey_(
      workspace.managerId,
      "DISCORD_WEBHOOK_URL",
    );
  }

  properties.setProperty(propertyName, validatedValue);

  logIntegrationSave_(integrationType, [propertyName], startedAt);

  return {
    success: true,
    integration: integrationType,
    managerId: workspace.managerId,
  };
}

function logIntegrationSave_(integration, updatedSettings, startedAt) {
  recordGcbOperationLog_({
    timestamp: new Date(),
    category: "INTEGRATION",
    operation: "SAVE_INTEGRATION",
    status: "SUCCESS",
    trigger: "MANUAL",
    durationMs: Date.now() - startedAt,
    processed: updatedSettings.length,
    succeeded: updatedSettings.length,
    failed: 0,
    target: integration,
    message: updatedSettings.length
      ? `Updated settings: ${updatedSettings.join(", ")}.`
      : "Integration save completed; no settings were changed.",
    error: "",
  });
}

function getManagerIntegrationContext_(sessionId, signature) {
  const session = requireCapability(sessionId, signature, "settings.manage");

  const workspace = getManagerWorkspaceForSession_(session);

  if (!workspace || !workspace.managerId) {
    throw new Error(
      "No enabled manager workspace is associated with the authenticated account.",
    );
  }

  return { session, workspace };
}

function getManagerIntegrationPropertyKey_(managerId, setting) {
  const id = String(managerId || "").trim();

  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error("Invalid manager ID.");
  }

  const allowedSettings = ["NOTIFICATION_EMAIL", "DISCORD_WEBHOOK_URL"];

  if (!allowedSettings.includes(setting)) {
    throw new Error("Unsupported manager integration setting.");
  }

  return `GCB_MANAGER_${id}_${setting}`;
}

function getManagerIntegrationValue_(managerId, setting) {
  const key = getManagerIntegrationPropertyKey_(managerId, setting);

  return PropertiesService.getScriptProperties().getProperty(key);
}
