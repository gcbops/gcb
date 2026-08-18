function goToSheet(sheetName) {
  const sheet = getSheetSafe(sheetName);

  if (!sheet) {
    return logResponse(`Sheet "${sheetName}" not found.`);
  }

  getActiveSpreadsheet().setActiveSheet(sheet);
}

function goToClientNames() {
  goToSheet("Client Names");
}

function goToClientTrackerToday() {
  goToSheet("Client Tracker - Today");
}

function goToMonthlyHoursLog() {
  goToSheet("Monthly Hours Log");
}

function goToCurrentMonthLog() {
  goToSheet("Current Month Log");
}

function goToYearlySummary() {
  goToSheet("Log - Yearly Summary");
}

function goToLab3() {
  goToSheet("Lab 3.0");
}

function getClientOptions() {
  try {
    return getClientSheetsList();
  } catch (err) {
    logResponse(
      `Error fetching client options: ${err.message}`,
      "Error",
    );

    return [];
  }
}

function showManualHoursForm() {
  showDialog("ManualHoursFormDialog", "Record Manual Client Hours", 450, 800);
}

function showHistoryLogsPopup() {
  showDialog("HistoryLogsDialog", "History Logs", 150, 600);
}

function showOtherOptionsPopup() {
  showDialog("OtherOptionsDialog", "Other Options", 150, 600);
}

function browseSheetModal() {
  showDialog("SearchSheetDialog", "Browse Sheet", 720, 800);
}

function addUpsells() {
  showDialog("UpsellsDialog", "Upsells", 770, 1000);
}

function openFormulaDialog() {
  showDialog("FormulaDialog", "Add Formula to Sheets", 400, 450);
}

function openChartDialog(type, title) {
  const html = HtmlService.createTemplateFromFile("PerformanceChart");

  html.chartType = type;

  SpreadsheetApp.getUi().showModalDialog(
    html.evaluate().setWidth(1200).setHeight(650),
    title,
  );
}

function openDailyChart() {
  openChartDialog("daily", "Performance Chart");
}

function openMonthlyChart() {
  openChartDialog("monthly", "Performance Chart");
}

function showClientHourLog() {
  const sheet = getLabSheet();
  const clientName = getCellValueSafe(sheet, "P24");

  if (!isNonEmptyString(clientName)) {
    return logResponse("⚠️ No client name found in P24.");
  }

  const template = HtmlService.createTemplateFromFile("ClientHourLogDialog");

  Object.assign(template, {
    title: "Hour Log",
    clientName,
  });

  SpreadsheetApp.getUi().showModalDialog(
    template.evaluate().setWidth(800).setHeight(650),
    `${clientName} Hour Log`,
  );
}

function openClientManualSheet() {
  const name = getLabCell("P24");

  if (!isNonEmptyString(name)) {
    return logResponse("⚠️ No client name found in P24.");
  }

  const sheet = getSheetSafe(name);

  if (sheet) {
    getSpreadsheet().setActiveSheet(sheet);
    return;
  }

  logResponse(`❌ Client sheet "${name}" not found.`);
}

function addClientManualSheet() {
  showDialog("addClientDialog", "Create New Client Sheet", 380, 550);
}

function createClientSheetFromDialog(input) {
  if (!input || !isNonEmptyString(input.name)) {
    throw new Error("Client name cannot be empty.");
  }

  const sheetName = input.name.trim();

  if (sheetExists(sheetName)) {
    throw new Error(`Sheet "${sheetName}" already exists.`);
  }

  const template = getSheetSafe("BLANK");

  if (!template) {
    throw new Error('Template sheet "BLANK" not found.');
  }

  const ss = getSpreadsheet();
  const newSheet = template.copyTo(ss);

  newSheet.setName(sheetName);

  SpreadsheetApp.flush();

  newSheet.getRange("E1").setValue(sheetName);

  ss.setActiveSheet(newSheet);
  ss.moveActiveSheet(1);
}

function openClientSheet(name) {
  if (!isNonEmptyString(name)) {
    return logResponse("⚠️ No sheet name provided.");
  }

  const sheet = getSheetSafe(name);

  if (sheet) {
    getSpreadsheet().setActiveSheet(sheet);
    return;
  }

  logResponse(`❌ Sheet "${name}" not found.`);
}

function showProfileSettings() {
  showDialog("ProfileSettingsDialog", "Profile Settings", 780, 600);
}

function getProfileData() {
  // requireAuthorizedUser();

  const sheet = getLabSheet();

  if (!sheet) {
    return {};
  }

  const fields = {
    profilePic: "BE3",
    firstName: "BE7",
    lastName: "BE9",
    displayName: "BE11",
    desc: "BE13",
  };

  const data = {};

  for (const [key, cell] of Object.entries(fields)) {
    data[key] = getCellValueSafe(sheet, cell);
  }

  const notificationEmail = getNotificationEmail();
  const discordWebhook = getDiscordWebhook();
  const spreadsheetId = CONFIG.SPREADSHEET_ID;
  const reportFolderId = PropertiesService.getScriptProperties().getProperty("REPORT_FOLDER_ID");

  data.notifEmail = {
    configured: Boolean(notificationEmail),
    masked: maskSecret(notificationEmail),
  };

  data.notifDiscord = {
    configured: Boolean(discordWebhook),
    masked: maskSecret(discordWebhook),
  };

  data.spreadsheetId = {
    configured: Boolean(spreadsheetId),
    masked: maskSecret(spreadsheetId),
  };

  data.reportFolderId = {
    configured: Boolean(reportFolderId),
    masked: maskSecret(reportFolderId),
  };

  return data;
}

function saveProfileData(data) {
  // requireAuthorizedUser();
  
  const sheet = getLabSheet();
  if (!sheet) return "❌ Lab 3.0 sheet not found.";

  const fields = {
    profilePic: "BE3",
    firstName: "BE7",
    lastName: "BE9",
    displayName: "BE11",
    desc: "BE13",
  };

  for (const [key, cell] of Object.entries(fields)) {
    if (data[key] !== undefined) sheet.getRange(cell).setValue(data[key]);
  }

  return "✅ Profile updated successfully!";
}

function saveNotificationData(data) {
  // requireAuthorizedUser();

  const properties = PropertiesService.getScriptProperties();

  const errors = [];

  /*
   * EMAIL
   */
  if (data.notifEmail) {
    const email = String(data.notifEmail).trim();

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(email)) {
      errors.push("Invalid notification email.");
    } else {
      properties.setProperty("NOTIFICATION_EMAIL", email);
    }
  }

  /*
   * DISCORD WEBHOOK
   */
  if (data.notifDiscord) {
    const webhook = String(data.notifDiscord).trim();

    const discordPattern =
      /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/.+$/;

    if (!discordPattern.test(webhook)) {
      errors.push("Invalid Discord webhook URL.");
    } else {
      properties.setProperty("DISCORD_WEBHOOK_URL", webhook);
    }
  }

  /*
   * SPREADSHEET ID
   */
  if (data.spreadsheetId) {
    const spreadsheetId = String(data.spreadsheetId).trim();

    /*
     * Basic Google Spreadsheet ID validation.
     * Google IDs are normally made from letters,
     * numbers, hyphens and underscores.
     */
    const spreadsheetIdPattern = /^[a-zA-Z0-9_-]{20,}$/;

    if (!spreadsheetIdPattern.test(spreadsheetId)) {
      errors.push("Invalid Spreadsheet ID.");
    } else {
      properties.setProperty("SPREADSHEET_ID", spreadsheetId);
    }
  }

  /*
   * REPORT ID
   */
  if (data.reportFolderId) {
    const reportFolderId = String(data.reportFolderId).trim();

    if (!/^[a-zA-Z0-9_-]{10,}$/.test(reportFolderId)) {
      errors.push("Invalid Report Folder ID.");
    } else {
      properties.setProperty("REPORT_FOLDER_ID", reportFolderId);
    }
  }

  if (errors.length) {
    throw new Error(errors.join("\n"));
  }

  return "✅ Notification settings saved!";
}

function openHourlyLog() {
  showDialog("HourlyLogsDialog", "Hourly History Dashboard", 550, 900);
}

function updateSheetId(newId) {
  if (!isNonEmptyString(newId)) throw new Error("❌ No Sheet ID provided.");

  const sheet = getSheetSafe("Hourly History");
  if (!sheet) throw new Error('❌ Sheet "Hourly History" not found.');

  const formula = `=IFERROR(IMPORTRANGE("${newId}","Metrix!R41"), 0)`;
  sheet.getRange("B12").setFormula(formula);

  return "✅ Sheet ID updated successfully!";
}

function getHourlyChartData() {
  const sheet = getSheetSafe("Hourly History");
  if (!sheet) return [];

  const values = sheet.getRange("J4:K").getValues();
  return values
    .filter((r) => r[0] !== "" && r[0] !== null)
    .map((r) => [String(r[0]), Number(r[1]) || 0]);
}

function addCurrMthTotalHrly(value) {
  if (value === "" || value === null || value === undefined)
    throw new Error("❌ No value provided.");

  const sheet = getSheetSafe("Hourly History");
  if (!sheet) throw new Error('❌ Sheet "Hourly History" not found.');

  const lastRow = sheet.getLastRow();
  if (lastRow < 4) throw new Error("❌ Not enough data in Hourly History.");

  const colE = sheet.getRange("E4:E" + lastRow).getValues();
  const colF = sheet.getRange("F4:F" + lastRow).getValues();

  const targetRow = colE.findIndex((e, i) => e[0] && !colF[i][0]);
  if (targetRow === -1) throw new Error("⚠️ No empty F cell found to update.");

  const rowNum = targetRow + 4;
  const numVal = isNaN(Number(value)) ? value : Number(value);

  sheet.getRange(`F${rowNum}`).setValue(numVal);
  const monthYear = sheet.getRange(`E${rowNum}`).getValue();

  return {
    message: `✅ Added value to ${monthYear}`,
    row: rowNum,
    monthYear,
  };
}

function clearAllRecords() {
  const sheet = getSheetSafe("Upsells");
  if (!sheet) throw new Error('❌ Sheet "Upsells" not found.');

  const values = sheet.getRange("C21:C").getValues().flat();
  const total = values.reduce((sum, v) => sum + (Number(v) || 0), 0);

  sheet.getRange("A21:F").clearContent();
  sheet.getRange("A8").setValue(total);

  return `✅ Cleared all upsells (Total Hours: ${total})`;
}

function displayNotificationPanel() {
  showDialog("NotificationPanel", "Notifications", 500, 700);
}

function getNotificationData(tabName) {
  const ss = getActiveSpreadsheet();

  try {
    switch (tabName) {
      case "Daily":
        return getDailyNotificationData(ss);

      case "Report":
        return getReportNotificationData(ss);

      case "Reminder":
        return getReminderNotificationData(ss);

      default:
        console.log(`⚠️ Unrecognized notification tab: ${tabName}`);
        return {
          error: `Unknown tab: ${tabName}`,
        };
    }
  } catch (err) {
    console.error(`❌ Error in getNotificationData(${tabName}):`, err);

    return {
      error: String(err),
    };
  }
}

function getDailyNotificationData(ss) {
  const sheet = ss.getSheetByName("DailyNotifications_Log");

  const values = sheet?.getRange("A2:Z3").getValues() || [];

  if (values.length < 2) {
    return [];
  }

  const notifications = [];

  for (let col = 0; col < values[0].length; col += 5) {
    const title = values[0][col];
    const content = values[1][col];

    if (!title || !content) {
      continue;
    }

    notifications.push({
      title,
      content,
    });
  }

  console.log(`✅ Returning ${notifications.length} Daily items`);

  return notifications;
}

function getReportNotificationData(ss) {
  const sources = [
    {
      name: "MonthlyReport_Log",
      type: "Monthly",
    },
    {
      name: "YearlyReport_Log",
      type: "Yearly",
    },
  ];

  const reports = [];

  sources.forEach(({ name, type }) => {
    const sheet = ss.getSheetByName(name);

    if (!sheet) {
      console.log(`⚠️ ${name} sheet not found`);
      return;
    }

    const lastRow = sheet.getLastRow();

    if (lastRow < 1) {
      return;
    }

    const values = sheet.getRange(1, 1, lastRow, 4).getValues();

    values.forEach((row) => {
      if (!row[0]) {
        return;
      }

      const dateObj = row[0] instanceof Date ? row[0] : new Date(row[0]);

      reports.push({
        dateObj,
        date: formatDateSafe(row[0], "yyyy-MM-dd HH:mm:ss") || row[0],
        id: row[1],
        title: row[2],
        link: row[3],
        type,
      });
    });
  });

  reports.sort((a, b) => b.dateObj - a.dateObj);

  return reports.map(({ dateObj, ...report }) => report);
}

function getReminderNotificationData(ss) {
  const sheet = ss.getSheetByName("Reminders_Log");

  const values = sheet?.getRange("A2:Z3").getValues() || [];

  if (values.length < 2) {
    return [];
  }

  const reminders = [];

  for (let col = 0; col < values[0].length; col += 5) {
    const title = values[0][col];
    const content = values[1][col];

    if (!title || !content) {
      continue;
    }

    reminders.push({
      title:
        title instanceof Date
          ? formatDateSafe(title, "MMMM dd, yyyy HH:mm:ss")
          : title,
      content,
    });
  }

  console.log(`✅ Returning ${reminders.length} Reminders`);

  return reminders;
}