function getIntegrationStatus() {
  // requireAuthorizedUser();

  const notificationEmail = getNotificationEmail();
  const discordWebhook = getDiscordWebhook();
  const spreadsheetId = CONFIG.SPREADSHEET_ID;
  const reportFolderId =
    PropertiesService.getScriptProperties().getProperty("REPORT_FOLDER_ID");

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

  switch (integration) {
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
      throw new Error(`Unsupported integration: ${integration}`);
  }

  return {
    configured: Boolean(value),
    masked: maskSecret(value),
  };
}

function saveIntegration(integration, value) {
  // requireAuthorizedUser();

  if (!value || typeof value !== "string") {
    throw new Error("A configuration value is required.");
  }

  const cleanValue = value.trim();

  if (!cleanValue) {
    throw new Error("A configuration value is required.");
  }

  switch (integration) {
    case "gmail":
      validateEmail(cleanValue);

      PropertiesService.getScriptProperties().setProperty(
        "NOTIFICATION_EMAIL",
        cleanValue,
      );

      break;

    case "discord":
      validateDiscordWebhook(cleanValue);

      PropertiesService.getScriptProperties().setProperty(
        "DISCORD_WEBHOOK",
        cleanValue,
      );

      break;

    case "sheets":
      validateSpreadsheetId(cleanValue);

      PropertiesService.getScriptProperties().setProperty(
        "SPREADSHEET_ID",
        cleanValue,
      );

      break;

    case "drive":
      validateDriveFolderId(cleanValue);

      PropertiesService.getScriptProperties().setProperty(
        "REPORT_FOLDER_ID",
        cleanValue,
      );

      break;

    default:
      throw new Error(`Integration "${integration}" is not supported yet.`);
  }

  return {
    success: true,
    integration,
  };
}

function validateEmail(value) {
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!pattern.test(value)) {
    throw new Error("Please enter a valid email address.");
  }
}

function validateDiscordWebhook(value) {
  if (
    !value.startsWith("https://discord.com/api/webhooks/") &&
    !value.startsWith("https://discordapp.com/api/webhooks/")
  ) {
    throw new Error("Please enter a valid Discord webhook URL.");
  }
}

function validateSpreadsheetId(value) {
  if (!/^[a-zA-Z0-9_-]{20,}$/.test(value)) {
    throw new Error("Please enter a valid Google Spreadsheet ID.");
  }
}

function validateDriveFolderId(value) {
  if (!/^[a-zA-Z0-9_-]{20,}$/.test(value)) {
    throw new Error("Please enter a valid Google Drive folder ID.");
  }
}

function saveIntegrationSettings(data) {
  // requireAuthorizedUser();

  const properties = PropertiesService.getScriptProperties();

  const errors = [];

  const email = String(data?.notifEmail || "").trim();
  const discord = String(data?.notifDiscord || "").trim();
  const spreadsheetId = String(data?.spreadsheetId || "").trim();
  const reportFolderId = String(data?.reportFolderId || "").trim();

  /*
   * Notification Email
   */
  if (email) {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(email)) {
      errors.push("Invalid notification email.");
    }
  }

  /*
   * Discord Webhook
   */
  if (discord) {
    const discordPattern =
      /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/.+$/;

    if (!discordPattern.test(discord)) {
      errors.push("Invalid Discord webhook URL.");
    }
  }

  /*
   * Google Spreadsheet ID
   */
  if (spreadsheetId) {
    const spreadsheetIdPattern = /^[a-zA-Z0-9_-]{20,}$/;

    if (!spreadsheetIdPattern.test(spreadsheetId)) {
      errors.push("Invalid Google Spreadsheet ID.");
    }
  }

  /*
   * Google Drive Report Folder ID
   */
  if (reportFolderId) {
    const folderIdPattern = /^[a-zA-Z0-9_-]{10,}$/;

    if (!folderIdPattern.test(reportFolderId)) {
      errors.push("Invalid Report Folder ID.");
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

  return {
    success: true,
    message: "Integration settings saved successfully.",
  };
}