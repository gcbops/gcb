function getIntegrationStatus() {
  // requireAuthorizedUser();

  const properties = PropertiesService.getScriptProperties();

  const notificationEmail = properties.getProperty("NOTIFICATION_EMAIL");

  const discordWebhook = properties.getProperty("DISCORD_WEBHOOK_URL");

  const spreadsheetId = properties.getProperty("SPREADSHEET_ID");

  const reportFolderId = properties.getProperty("REPORT_FOLDER_ID");

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

    reportFolderId: {
      configured: Boolean(reportFolderId),
      masked: maskSecret(reportFolderId),
    },
  };
}

function getIntegrationConfigStatus(integration) {
  // requireAuthorizedUser();

  const properties = PropertiesService.getScriptProperties();

  let value = "";

  const integrationType = Validation.enumValue(integration, "integration", [
    "gmail",
    "discord",
    "sheets",
    "drive",
  ]);

  switch (integrationType) {
    case "gmail":
      value = getNotificationEmail();
      break;

    case "discord":
      value = getDiscordWebhook();
      break;

    case "sheets":
      value = properties.getProperty("SPREADSHEET_ID");
      break;

    case "drive":
      value = properties.getProperty("REPORT_FOLDER_ID");
      break;

    default:
      throw new Error(`Unsupported integration: ${integrationType}`);
  }

  return {
    configured: Boolean(value),
    masked: maskSecret(value),
  };
}

function saveIntegration(integration, value) {
  // requireAuthorizedUser();

  const integrationType = Validation.enumValue(integration, "integration", [
    "gmail",
    "discord",
    "sheets",
    "drive",
  ]);

  const cleanValue = Validation.requiredString(value, "Configuration value", {
    maxLength: 500,
  });

  switch (integrationType) {
    case "gmail":
      Validation.email(cleanValue, "Notification email");

      PropertiesService.getScriptProperties().setProperty(
        "NOTIFICATION_EMAIL",
        cleanValue,
      );
      break;

    case "discord":
      Validation.discordWebhook(cleanValue, "Discord webhook");

      PropertiesService.getScriptProperties().setProperty(
        "DISCORD_WEBHOOK_URL",
        cleanValue,
      );
      break;

    case "sheets":
      Validation.spreadsheetId(cleanValue, "Spreadsheet ID");

      PropertiesService.getScriptProperties().setProperty(
        "SPREADSHEET_ID",
        cleanValue,
      );
      break;

    case "drive":
      Validation.driveFolderId(cleanValue, "Drive folder ID");

      PropertiesService.getScriptProperties().setProperty(
        "REPORT_FOLDER_ID",
        cleanValue,
      );
      break;
  }

  /*
   * Create/remove scheduled triggers
   * based on the current configuration.
   */
  reconcileScheduledTriggers();

  return {
    success: true,
    integration: integrationType,
  };
}

function saveIntegrationSettings(data) {
  // requireAuthorizedUser();

  const properties = PropertiesService.getScriptProperties();

  Validation.requireObject(data, "Integration settings");

  const errors = [];

  const email = String(data?.notifEmail || "").trim();
  const discord = String(data?.notifDiscord || "").trim();
  const spreadsheetId = String(data?.spreadsheetId || "").trim();
  const reportFolderId = String(data?.reportFolderId || "").trim();

  if (email) {
    try {
      Validation.email(email, "Notification email");
    } catch (err) {
      errors.push(err.message);
    }
  }

  if (discord) {
    try {
      Validation.discordWebhook(discord, "Discord webhook");
    } catch (err) {
      errors.push(err.message);
    }
  }

  if (spreadsheetId) {
    try {
      Validation.spreadsheetId(spreadsheetId, "Spreadsheet ID");
    } catch (err) {
      errors.push(err.message);
    }
  }

  if (reportFolderId) {
    try {
      Validation.driveFolderId(reportFolderId, "Report folder ID");
    } catch (err) {
      errors.push(err.message);
    }
  }

  if (errors.length) {
    throw new Error(errors.join("\n"));
  }

  /*
   * Only update properties that were provided.
   * Blank fields keep the existing configuration.
   */
  if (email) {
    properties.setProperty("NOTIFICATION_EMAIL", email);
  }

  if (discord) {
    properties.setProperty("DISCORD_WEBHOOK_URL", discord);
  }

  if (spreadsheetId) {
    properties.setProperty("SPREADSHEET_ID", spreadsheetId);
  }

  if (reportFolderId) {
    properties.setProperty("REPORT_FOLDER_ID", reportFolderId);
  }

  /*
   * Create/remove scheduled triggers
   * based on the current configuration.
   */
  reconcileScheduledTriggers();

  return {
    success: true,
    message: "Integration settings saved successfully.",
  };
}
