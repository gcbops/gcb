const STATUS_PROPERTY_IDS = [
  "MANAGER_REGISTRY_SPREADSHEET_ID",
  "EXTERNAL_SHEET_TEMPLATE_ID",
  "ADMIN_COMBINED_BACKUP_FOLDER_ID",
];

function getPropertyStatus(sessionId, signature, propertyId) {
  getManagerIntegrationContext_(sessionId, signature);

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

  const notificationEmail = String(workspace.email || "").trim();
  const discordWebhook = String(workspace.discordWebhookUrl || "").trim();
  const asanaAccessToken = String(workspace.asanaAccessToken || "").trim();

  const templateId = String(
    properties.getProperty(EXTERNAL_SHEETS_CONFIG.templateProperty) || "",
  ).trim();

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
      readOnly: true,
    },

    discord: {
      authorization: getAuthorization("discord"),
      notifDiscord: {
        configured: Boolean(discordWebhook),
        masked: discordWebhook ? maskSecret(discordWebhook) : null,
      },
    },

    asana: {
      authorization: {
        authorized: true,
        service: "asana",
        message: "Asana uses a manager-specific access token.",
      },
      asanaAccessToken: {
        configured: Boolean(asanaAccessToken),
        masked: asanaAccessToken ? maskSecret(asanaAccessToken) : null,
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
      externalSheetsFolderId: {
        configured: Boolean(workspace.externalSheetsFolderId),
        masked: workspace.externalSheetsFolderId
          ? maskSecret(workspace.externalSheetsFolderId)
          : null,
      },
      backupFolderId: {
        configured: Boolean(workspace.backupFolderId),
        masked: workspace.backupFolderId
          ? maskSecret(workspace.backupFolderId)
          : null,
      },
      reportsFolderId: {
        configured: Boolean(workspace.reportsFolderId),
        masked: workspace.reportsFolderId
          ? maskSecret(workspace.reportsFolderId)
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
    "asana",
  ]);

  switch (integrationType) {
    case "gmail": {
      const email = String(workspace.email || "").trim();

      return {
        fields: {
          notifEmail: {
            configured: Boolean(email),
            masked: email ? maskSecret(email) : null,
          },
        },
        readOnly: true,
      };
    }

    case "discord": {
      const webhook = String(workspace.discordWebhookUrl || "").trim();

      return {
        fields: {
          notifDiscord: {
            configured: Boolean(webhook),
            masked: webhook ? maskSecret(webhook) : null,
          },
        },
      };
    }

    case "asana": {
      const token = String(workspace.asanaAccessToken || "").trim();

      return {
        fields: {
          asanaAccessToken: {
            configured: Boolean(token),
            masked: token ? maskSecret(token) : null,
          },
        },
      };
    }

    case "sheets": {
      const templateId = String(
        properties.getProperty(EXTERNAL_SHEETS_CONFIG.templateProperty) || "",
      ).trim();

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
          externalSheetsFolderId: {
            configured: Boolean(workspace.externalSheetsFolderId),
            masked: workspace.externalSheetsFolderId
              ? maskSecret(workspace.externalSheetsFolderId)
              : null,
          },
          backupFolderId: {
            configured: Boolean(workspace.backupFolderId),
            masked: workspace.backupFolderId
              ? maskSecret(workspace.backupFolderId)
              : null,
          },
          reportsFolderId: {
            configured: Boolean(workspace.reportsFolderId),
            masked: workspace.reportsFolderId
              ? maskSecret(workspace.reportsFolderId)
              : null,
          },
          operationalSpreadsheetId: {
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
    "asana",
  ]);

  switch (integrationType) {
    case "discord":
      return {
        authorized: true,
        service: "discord",
        message: "Discord does not require Google authorization.",
      };

    case "asana":
      return {
        authorized: true,
        service: "asana",
        message: "Asana uses a manager-specific access token.",
      };

    case "drive": {
      try {
        const folders = [
          workspace.externalSheetsFolderId,
          workspace.backupFolderId,
          workspace.reportsFolderId,
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
        const spreadsheet = openSpreadsheetById(workspace.spreadsheetId);

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
  getManagerIntegrationContext_(sessionId, signature);

  const integrationType = Validation.enumValue(integration, "integration", [
    "gmail",
    "sheets",
    "drive",
    "asana",
  ]);

  const scopeMap = {
    gmail: "https://www.googleapis.com/auth/script.send_mail",
    sheets: "https://www.googleapis.com/auth/spreadsheets",
    drive: "https://www.googleapis.com/auth/drive",
  };

  const authInfo = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL, [
    scopeMap[integrationType],
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

  const url = authInfo.getAuthorizationUrl();

  if (!url) {
    throw new Error("Google authorization URL could not be generated.");
  }

  return {
    authorized: false,
    url,
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
  const validatedId = Validation.spreadsheetId(spreadsheetId, label);

  try {
    const spreadsheet = openSpreadsheetById(validatedId);

    return {
      id: validatedId,
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

function saveManagerDiscordWebhookProperty_(managerId, webhookUrl) {
  const normalizedManagerId = String(managerId || "").trim();

  if (!/^[A-Za-z0-9_-]+$/.test(normalizedManagerId)) {
    throw new Error("Invalid manager ID.");
  }

  const normalizedWebhookUrl = String(webhookUrl || "").trim();

  if (!normalizedWebhookUrl) {
    throw new Error("A Discord webhook URL is required.");
  }

  const propertyKey = getManagerIntegrationPropertyKey_(
    normalizedManagerId,
    "DISCORD_WEBHOOK_URL",
  );

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    PropertiesService.getScriptProperties().setProperty(
      propertyKey,
      normalizedWebhookUrl,
    );

    return {
      managerId: normalizedManagerId,
      updated: true,
    };
  } finally {
    lock.releaseLock();
  }
}

function saveIntegration(
  sessionId,
  signature,
  integration,
  value,
  requestId = "",
) {
  const { workspace } = getManagerIntegrationContext_(sessionId, signature);

  const startedAt = Date.now();
  const managerId = workspace.managerId || "";

  let integrationType = "UNKNOWN";
  let updatedSettings = [];

  try {
    integrationType = Validation.enumValue(integration, "integration", [
      "gmail",
      "discord",
      "sheets",
      "drive",
      "asana",
    ]);

    if (integrationType === "gmail") {
      throw new Error(
        "The Gmail recipient is managed by the manager registry Login Email and cannot be changed here.",
      );
    }

    if (!["discord", "asana"].includes(integrationType)) {
      throw new Error(
        "This integration is assigned through the manager registry and cannot be changed here.",
      );
    }

    const cleanValue = Validation.requiredString(value, "Configuration value", {
      maxLength: 500,
    });

    if (integrationType === "discord") {
      const validatedValue = Validation.discordWebhook(
        cleanValue,
        "Discord webhook",
      );

      saveManagerDiscordWebhookProperty_(managerId, validatedValue);

      updatedSettings = ["Discord Webhook URL"];
    }

    if (integrationType === "asana") {
      saveManagerAsanaAccessTokenProperty_(managerId, cleanValue);

      updatedSettings = ["Asana Access Token"];
    }

    logIntegrationSave_({
      integration: integrationType,
      updatedSettings,
      startedAt,
      requestId,
      managerId,
      status: "SUCCESS",
    });

    return {
      success: true,
      integration: integrationType,
      managerId,
    };
  } catch (error) {
    logIntegrationSave_({
      integration: integrationType,
      updatedSettings,
      startedAt,
      requestId,
      managerId,
      status: "FAILED",
      error,
    });

    throw error;
  }
}

function logIntegrationSave_({
  integration = "UNKNOWN",
  updatedSettings = [],
  startedAt = Date.now(),
  requestId = "",
  managerId = "",
  status = "UNKNOWN",
  error = null,
} = {}) {
  try {
    const completedAt = Date.now();

    const settings = Array.isArray(updatedSettings) ? updatedSettings : [];

    recordGcbOperationLog_({
      timestamp: new Date(completedAt),
      startedAt,
      completedAt,
      requestId,
      managerId,
      category: "INTEGRATION",
      operation: "SAVE_INTEGRATION",
      status,
      trigger: "MANUAL",
      durationMs: Math.max(0, completedAt - startedAt),
      processed: 1,
      succeeded: status === "SUCCESS" ? 1 : 0,
      failed: status === "FAILED" ? 1 : 0,
      target: integration,
      message: settings.length
        ? `Updated settings: ${settings.join(", ")}.`
        : status === "FAILED"
          ? "Integration configuration update failed."
          : "Integration save completed; no settings were changed.",
      error: error ? String(error.message || error).slice(0, 2000) : "",
    });
  } catch (logError) {
    console.error(
      "[Integration] Failed to write operation log:",
      logError?.message || logError,
    );
  }
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

  const allowedSettings = [
    "NOTIFICATION_EMAIL",
    "DISCORD_WEBHOOK_URL",
    "ASANA_ACCESS_TOKEN",
  ];

  if (!allowedSettings.includes(setting)) {
    throw new Error("Unsupported manager integration setting.");
  }

  return `MANAGER_${id}_${setting}`;
}

function getManagerIntegrationValue_(managerId, setting) {
  const normalizedManagerId = String(managerId || "").trim();

  if (!/^[A-Za-z0-9_-]+$/.test(normalizedManagerId)) {
    throw new Error("Invalid manager ID.");
  }

  const managers = getManagers_();

  const matches = managers.filter(
    (manager) => manager.managerId === normalizedManagerId,
  );

  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? `Enabled manager ${normalizedManagerId} was not found.`
        : `Manager ${normalizedManagerId} appears more than once.`,
    );
  }

  const manager = matches[0];

  switch (setting) {
    case "NOTIFICATION_EMAIL":
      return String(manager.email || "").trim();

    case "DISCORD_WEBHOOK_URL":
      return String(manager.discordWebhookUrl || "").trim();

    default:
      throw new Error("Unsupported manager integration setting.");
  }
}

function saveManagerAsanaAccessTokenProperty_(managerId, accessToken) {
  const normalizedManagerId = String(managerId || "").trim();

  if (!/^[A-Za-z0-9_-]+$/.test(normalizedManagerId)) {
    throw new Error("Invalid manager ID.");
  }

  const normalizedAccessToken = String(accessToken || "").trim();

  if (!normalizedAccessToken) {
    throw new Error("An Asana access token is required.");
  }

  const propertyKey = getManagerIntegrationPropertyKey_(
    normalizedManagerId,
    "ASANA_ACCESS_TOKEN",
  );

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    PropertiesService.getScriptProperties().setProperty(
      propertyKey,
      normalizedAccessToken,
    );

    return {
      managerId: normalizedManagerId,
      updated: true,
    };
  } finally {
    lock.releaseLock();
  }
}
