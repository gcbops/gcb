/** 
 * Shared constants + helper functions
 */


const EXCLUDED_SHEETS = new Set([
  "Lab 2.0",
  "Lab 3.0",
  "Client Names",
  "Client Sheet Copy Template",
  "Monthly Hours Log",
  "Current Month Log",
  "Client Tracker - Today",
  "Log - Yearly Summary",
  "Paid & Owed Log",
  "BLANK",
  "Hourly Today",
  "Hourly History",
  "DailyNotifications_Log",
  "MonthlyReport_Log",
  "Monthly Report PDF",
  "Reminders_Log",
  "Upsells",
  "Projects",
  "Yearly Report PDF",
  "YearlyReport_Log",
  "Settings",
  "Month Log Generator",
  "Monthly Report PDF Generator",
  "Year Log Generator",
  "Yearly Report PDF Generator",
  "Current Year Log",
]);

/** 🔧 Basic Shortcuts */
const getSS = () => SpreadsheetApp.openById('1_Xh5jVAUMO6xMRrDD_kKSa7Vggxv9ntR0_uDCvt1HmY');
const getActiveSS = () => SpreadsheetApp.getActiveSpreadsheet();

/** 💬 Alerts */
const logAlert = (msg, title = "Notice") => { const text = `${title}: ${msg}`; console.log(text); return { success: false, message: text }; };

/** 🕒 Date + Text Utils */
const formatDateSafe = (date, format = 'M/d/yyyy') =>
  (date instanceof Date && !isNaN(date)) ? Utilities.formatDate(date, Session.getScriptTimeZone(), format) : "";

const normalizeText = v => v ? v.toString().trim().toLowerCase() : "";

/** 📄 Sheet Helpers */
const sheetExists = name => !!getSS().getSheetByName(name);
const getSheetSafe = name => getActiveSS().getSheetByName(name) || null;

/**
 * Find first empty row in a column
 */
function getFirstEmptyRow(sheet, col = 1, startRow = 1) {
  const values = sheet.getRange(startRow, col, sheet.getLastRow() - startRow + 1, 1).getValues();
  const idx = values.findIndex(r => !r[0]);
  return idx >= 0 ? idx + startRow : sheet.getLastRow() + 1;
}

/**
 * Get non-excluded client sheet names
 */
const getClientSheetsList = () =>
  getSS()
    .getSheets()
    .map(s => s.getName())
    .filter(name => !EXCLUDED_SHEETS.has(name))
    .sort();

/**
 * Get active clients from Client Names!I2:I30
 */
function getActiveClients() {
  const sheet = getSheetSafe("Client Names");
  if (!sheet) return [];
  return sheet.getRange("I2:I30").getValues().flat().filter(isNonEmptyString);
}

const getClientSheetsListAndActive = () => ({
  sheets: getClientSheetsList(),
  activeClients: getActiveClients(),
});

/**
 * Get client projects
 */
function pullClientProjects() {
  const ss = getActiveSS();
  const clientsSheet = ss.getSheetByName("Client Names");
  const projectsSheet = ss.getSheetByName("Projects");

  if (!clientsSheet || !projectsSheet) return;

  const clientNames = clientsSheet.getRange("A2:A" + clientsSheet.getLastRow())
                                  .getValues()
                                  .flat()
                                  .filter(name => name);

  let aggregated = [];

  clientNames.forEach(clientName => {
    try {
      const clientSheet = ss.getSheetByName(clientName);
      if (!clientSheet) return;

      const lastRow = clientSheet.getLastRow();
      const rangeEnd = Math.max(41, lastRow);
      const data = clientSheet.getRange("B41:C" + rangeEnd).getValues();

      // normalize and aggregate
      const projectMap = {};

      data.forEach(row => {
        if (!row[0]) return; // skip empty project
        let projectName = row[0].split(" - ")[0].trim(); // normalize
        let hours = row[1] || 0;
        projectMap[projectName] = (projectMap[projectName] || 0) + hours;
      });

      // convert map to array [Project, Hours, Client]
      for (let [project, hours] of Object.entries(projectMap)) {
        aggregated.push([project, hours, clientName]);
      }

    } catch(e) {
      logAlert(`Skipped ${clientName}: ${e}`);
    }
  });

  // clear Projects sheet and write
  projectsSheet.getRange("A2:C" + projectsSheet.getMaxRows()).clearContent();
  if (aggregated.length > 0) {
    projectsSheet.getRange(2, 1, aggregated.length, 3).setValues(aggregated);
  }
}

function getProjects() {
  const sheet = getSheetSafe("Projects");
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  return sheet.getRange(2, 1, lastRow - 1, 3).getValues();
}

function getTopProjects() {
  const sheet = getSheetSafe("Projects");
  if (!sheet) return [];

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();

  return data.filter(row => row[0] && row[1]);  
}

/**
 * Sync client sheet names into Client Names!A2:A
 */
function syncClientSheetList() {
  const sheet = getSheetSafe("Client Names");
  if (!sheet) return logAlert('❌ Missing "Client Names" sheet.'), [];

  const names = getClientSheetsList();
  sheet.getRange("A2:A").clearContent();
  if (names.length) sheet.getRange(2, 1, names.length, 1).setValues(names.map(n => [n]));
  pullClientProjects();
  return names;
}

/**
 * Apply formula to all non-excluded sheets
 */
function applyFormulaToSheets(cellRef, formula) {
  try {
    const ss = getActiveSS();

    ss.getSheets().forEach(s => {
      const name = s.getName();

      if (!EXCLUDED_SHEETS.has(name) || name === "BLANK") {
        s.getRange(cellRef).setFormula(formula);
      }
    });

    return `✅ Formula applied (including BLANK) at ${cellRef}`;
  } catch (err) {
    logAlert(err);
    return `❌ Error: ${err.message}`;
  }
}


/** 🔍 Range Utils */
const clearRange = (sheet, rangeA1) => sheet.getRange(rangeA1).clearContent();

/** ✅ Validation Helpers */
const isValidNumber = v => !isNaN(parseFloat(v)) && isFinite(v);
const isNonEmptyString = v => typeof v === "string" && v.trim() !== "";

const isValidDate = v => {
  const d = v instanceof Date ? v : new Date(v);
  return d instanceof Date && !isNaN(d);
};

const toDate = v => isValidDate(v) ? (v instanceof Date ? v : new Date(v)) : new Date();

/** Get last data row in a sheet (any column) */
const getLastDataRow = (sheet) => sheet.getLastRow();

/** Get sheet name by partial match */
function getSheetByPartialName(partial) {
  const ss = getSS();
  const match = ss.getSheets().find(s => s.getName().toLowerCase().includes(partial.toLowerCase()));
  return match || null;
}

/** Convert range values to clean array (filter blanks) */
const getCleanValues = (range) => range.getValues().flat().filter(isNonEmptyString);

/** Log helper with timestamp */
function logWithTime(message) {
  const ts = formatDateSafe(new Date(), "yyyy-MM-dd HH:mm:ss");
  logAlert(`[${ts}] ${message}`);
}

/** Safely get cell value */
const getCellValueSafe = (sheet, cellRange) => {
  try { return sheet.getRange(cellRange).getValue(); }
  catch (e) { logAlert(`⚠️ Error reading ${cellRange}: ${e.message}`); return ""; }
};

function getDirectCellValueSafe(sheetName, cellRange) {
  try {
    const ss = SpreadsheetApp.getActive();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) throw new Error("Sheet not found");

    return sheet.getRange(cellRange).getValue();
  } catch (e) {
    throw e; 
  }
}

/** Get "Lab 3.0" sheet safely */
function getLabSheet() {
  const sheet = getActiveSS().getSheetByName("Lab 3.0");
  if (!sheet) logAlert('⚠️ "Lab 3.0" sheet not found.');
  return sheet;
}

// get single cell value from Lab 3.0
function getLabCell(cellRange) {
  const sheet = getLabSheet();
  if (!sheet) return "";
  try {
    return sheet.getRange(cellRange).getValue();
  } catch (err) {
    logAlert(`⚠️ getLabCell(${cellRange}) failed: ${err.message}`);
    return "";
  }
}

// set single cell value in Lab 3.0
function setLabCell(cellRange, value) {
  const sheet = getLabSheet();
  if (!sheet) return;
  try {
    sheet.getRange(cellRange).setValue(value);
  } catch (err) {
    logAlert(`⚠️ setLabCell(${cellRange}) failed: ${err.message}`);
  }
}

/** 
 * Functions for recording and managing client hours
 */

/**
 * Record manual client hours directly into a client sheet.
 */
function recordManualClientHours(clientName, task, hours, date = new Date()) {
  if (!isNonEmptyString(clientName)) return logAlert("Invalid client name provided.");
  if (!isNonEmptyString(task)) return logAlert("Task cannot be empty.");

  const hoursNum = Number(hours);
  if (!isValidNumber(hoursNum)) return logAlert("Hours must be a valid number (e.g. 1, 1.5).");

  const sheet = getSheetSafe(clientName);
  if (!sheet) return logAlert(`Client sheet "${clientName}" not found.`);

  const dateObj = toDate(date);
  const row = getFirstEmptyRow(sheet, 1, 2);

  sheet.getRange(row, 1, 1, 3).setValues([
    [formatDateSafe(dateObj, "M/d/yyyy"), task, hoursNum]
  ]);

  logAlert(`✅ Recorded ${hoursNum} hours for ${clientName} on "${task}".`, "Success");
}

/**
 * Record manual client hours from form submission.
 */
function recordManualClientHoursFromForm(formData) {
  try {
    const clientSheet = getSheetSafe(formData.client);
    if (!clientSheet) {
      return logAlert(`Sheet "${formData.client}" not found.`);
    }

    const startRow = 3;
    const lastRow = clientSheet.getLastRow();
    const today = formatDateSafe(new Date(), "M/d/yyyy");

    const data = clientSheet
      .getRange(startRow, 5, Math.max(1, lastRow - startRow + 1), 4)
      .getValues();

    for (let i = 0; i < data.length; i++) {
      const [typeDev, taskProject, existingHours, entryDate] = data[i];

      if (
        normalizeText(typeDev) === normalizeText(formData.type) &&
        normalizeText(taskProject) === normalizeText(formData.task) &&
        formatDateSafe(entryDate, "M/d/yyyy") === today
      ) {
        const newHours =
          (Number(existingHours) || 0) + (Number(formData.hour) || 0);

        clientSheet.getRange(startRow + i, 7).setValue(newHours);
        return { success: true };
      }
    }

    const emptyRow = getFirstEmptyRow(clientSheet, 5, startRow);
    const rowToWrite = emptyRow > 0 ? emptyRow : lastRow + 1;

    clientSheet.getRange(rowToWrite, 5, 1, 4).setValues([[
      formData.type || "",
      formData.task || "",
      Number(formData.hour) || 0,
      today,
    ]]);

    return { success: true };

  } catch (err) {
    throw new Error(err);
  }
}


/**
 * Fetch task options for a client sheet.
 */
function getTaskOptions(clientName) {
  if (!clientName) return [];
  try {
    const sheet = getSheetSafe(clientName.trim());
    if (!sheet) {
      logAlert(`❌ No sheet found for client: ${clientName}`);
      return [];
    }

    SpreadsheetApp.flush();
    const tasks = sheet.getRange("F3:F").getValues()
      .flat()
      .filter(t => t && String(t).trim() !== "");

    return [...new Set(tasks)].sort();
  } catch (err) {
    logAlert("⚠️ getTaskOptions error: " + err);
    return [];
  }
}

/**
 * Write selected client to Lab 3.0 (P24).
 */
function selectClient(data) {
  const sheet = getSheetSafe("Lab 3.0");
  if (sheet) sheet.getRange("P24").setValue(data.client);
}

/**
 * Read last selected client from Lab 3.0 (P24).
 */
function getP24Client() {
  const sheet = getSheetSafe("Lab 3.0");
  return sheet ? sheet.getRange("P24").getValue() || "" : "";
}

/**
 * List all client sheet names (excluding system sheets).
 */
function getClientOptions() {
  try {
    return getClientSheetsList();
  } catch (e) {
    logAlert(`Error fetching client options: ${e.message}`, "Error");
    return [];
  }
}

/**
 * Fetch recent manual records for a client.
 */
function getRecentRecordsForManualForm(clientSheetName, limit = 3) {
  if (!isNonEmptyString(clientSheetName)) return [];

  const sheet = getSheetSafe(clientSheetName);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return [];

  const startRow = 3;
  const numRows = lastRow - startRow + 1;
  const [dateCol, hourCol, typeCol, taskCol] = [
    8, 7, 5, 6
  ].map(col => sheet.getRange(startRow, col, numRows).getValues());

  const rows = [];
  for (let i = 0; i < numRows; i++) {
    const d = dateCol[i][0];
    const h = hourCol[i][0];
    const t = typeCol[i][0];
    const ta = taskCol[i][0];

    if (![d, h, t, ta].some(v => v && v !== "")) continue;

    let dateTimestamp = 0, dateStr = "";
    if (d instanceof Date && !isNaN(d)) {
      dateTimestamp = d.getTime();
      dateStr = formatDateSafe(d, "yyyy-MM-dd");
    } else if (d) {
      const parsed = new Date(String(d));
      if (!isNaN(parsed)) {
        dateTimestamp = parsed.getTime();
        dateStr = formatDateSafe(parsed, "yyyy-MM-dd");
      } else {
        dateStr = String(d);
      }
    }

    rows.push({ dateTimestamp, row: [dateStr, h, t, ta] });
  }

  return rows.sort((a, b) => b.dateTimestamp - a.dateTimestamp)
             .slice(0, limit)
             .map(r => r.row);
}

/** 
 * Sheet navigation helpers
 */

/**
 * Go to a sheet by name (safe)
 */
function goToSheet(sheetName) {
  const sheet = getSheetSafe(sheetName);
  if (!sheet) return logAlert(`Sheet "${sheetName}" not found.`);
  getActiveSS().setActiveSheet(sheet);
}

/** 
 * Quick-access navigators
 */
function goToClientNames() { goToSheet("Client Names"); }
function goToClientTrackerToday() { goToSheet("Client Tracker - Today"); }
function goToMonthlyHoursLog() { goToSheet("Monthly Hours Log"); }
function goToCurrentMonthLog() { goToSheet("Current Month Log"); }
function goToYearlySummary() { goToSheet("Log - Yearly Summary"); }
function goToLab3() { goToSheet("Lab 3.0"); }

/**
 * Go to client sheet currently selected in Lab 3.0 (cell P24)
 */
function goToPresentClient(sheetName) {
  const ss = getActiveSS();
  const labSheet = getLabSheet();
  if (!labSheet) return "⚠️ Lab sheet not found";

  // if no parameter → use P24
  if (!sheetName) {
    sheetName = getLabCell("P24");
    if (!isNonEmptyString(sheetName)) return "⚠️ No client name found in P24";
  }

  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return `⚠️ Sheet "${sheetName}" not found`;

  // return full sheet URL
  return `${ss.getUrl()}#gid=${sheet.getSheetId()}`;
}

/** 
 * Dialog + sidebar helpers
 */

function loadHtmlFile(file) {
  const possiblePaths = [
    file,                     // root
    'backend/' + file,        // backend folder
    'frontend/' + file,       // frontend folder
    'frontend/old/' + file    // old frontend folder
  ];

  for (let path of possiblePaths) {
    try {
      return HtmlService.createTemplateFromFile(path);
    } catch (e) {
      // file not found, try next path
    }
  }

  throw new Error(`HTML file "${file}" not found in any folder`);
}

/** 🪟 Generic dialog opener */
function showDialog(file, title = "Dialog", height = 500, width = 400, data = {}) {
  try {
    const html = loadHtmlFile(file);
    html.data = data;
    SpreadsheetApp.getUi().showModalDialog(
      html.evaluate().setWidth(width).setHeight(height), 
      title
    );
  } catch (e) {
    logAlert(`Failed to open dialog: ${e.message}`, "Error");
  }
}

/** 🧭 Daily Notification Board */
function showDialogByStatus(status, title, h = 600, w = 900, customSheet) {
  const config = {
    "Outstanding Accounts": { 
      range: "J2:M", 
      header: "Outstanding Accounts", 
      headers: ["Client", "Paid", "Owed", "Status"], 
      sheet: "Paid & Owed Log" 
    },
    "Active Clients": { 
      range: "J2:M", 
      header: "Active Clients", 
      headers: ["Client", "Paid", "Owed", "Status"], 
      sheet: "Paid & Owed Log" 
    },
    "Top Paid": { 
      range: "J2:M", 
      header: "Top Paid Accounts", 
      headers: ["Client", "Paid", "Owed", "Status"], 
      sheet: "Paid & Owed Log" 
    },
    "Activity Today": { 
      range: "B2:G", 
      header: "Activity Today", 
      headers: ["Client", "Status", "Member", "Work Hour", "Charged Hour", "Report Stat"], 
      sheet: "Client Tracker - Today" 
    }
  };

  const c = config[status];
  if (!c) return logAlert("⚠️ Invalid status requested.");

  const t = loadHtmlFile("DailyNotificationBoardDialog");
  Object.assign(t, {
    title: c.header,
    headerTexts: c.headers,
    status,
    sheetName: customSheet || c.sheet
  });
  SpreadsheetApp.getUi().showModalDialog(t.evaluate().setWidth(w).setHeight(h), title);
}

/** 🔍 Extract dialog data by config */
function getClientDataByStatus(status, customSheet) {
  const config = {
    "Outstanding Accounts": { range: "J2:M", sheet: "Paid & Owed Log" },
    "Active Clients":       { range: "J2:M", sheet: "Paid & Owed Log" },
    "Top Paid":             { range: "J2:M", sheet: "Paid & Owed Log" },
    "Activity Today":       { range: "B2:G", sheet: "Client Tracker - Today" }
  };

  const c = config[status];
  if (!c) return [];

  const sheet = getSheetSafe(customSheet || c.sheet);
  if (!sheet) return [];

  // fetch and filter rows with any non-empty cell
  return sheet.getRange(c.range)
    .getValues()
    .filter(r => r.some(Boolean));
}

/** 🧱 Board Wrappers */
const showOutstandingAccounts = () => showDialogByStatus("Outstanding Accounts", "Outstanding Accounts");
const showActiveClients = () => showDialogByStatus("Active Clients", "Active Clients");
const showTopPaid = () => showDialogByStatus("Top Paid", "Top Paid");
const showDailyActivity = () => showDialogByStatus("Activity Today", "Activity Today", 600, 950);

function getTopPaidClients() {
  const sheet = getSheetSafe("Paid & Owed Log");
  const data = sheet.getRange("J2:M" + sheet.getLastRow()).getValues();
  return data;
}

function getRoleFromSheet(name) {
  try {
    const sheet = getSheetSafe(name);
    if (!sheet) return "";
    return sheet.getRange("N17").getValue() || "";
  } catch (err) {
    return "";
  }
}

/** 🔄 Daily Tracker Data */
function getDailyActivityData() {
  const sheet = getSheetSafe("Client Tracker - Today");
  return sheet ? sheet.getRange("B2:G").getValues().filter(r => r.some(Boolean)) : [];
}

/** 🕒 Manual Hours */
const showManualHoursForm = () => showDialog("ManualHoursFormDialog", "Record Manual Client Hours", 450, 800);
const showHistoryLogsPopup = () => showDialog("HistoryLogsDialog", "History Logs", 150, 600);
const showOtherOptionsPopup = () => showDialog("OtherOptionsDialog", "Other Options", 150, 600);
const browseSheetModal = () => showDialog("SearchSheetDialog", "Browse Sheet", 720, 800);

/** 📋 Client Hour Log */
function showClientHourLog() {
  const sheet = getLabSheet();
  const clientName = getCellValueSafe(sheet, "P24");
  if (!isNonEmptyString(clientName)) return logAlert("⚠️ No client name found in P24.");

  const t = HtmlService.createTemplateFromFile("ClientHourLogDialog");
  Object.assign(t, { title: "Hour Log", clientName });
  SpreadsheetApp.getUi().showModalDialog(t.evaluate().setWidth(800).setHeight(650), `${clientName} Hour Log`);
}

function getClientHourLogData(clientName) {
  const sheet = getSheetSafe(clientName);
  if (!sheet) return [];

  const values = sheet.getRange("E3:H").getValues().filter(r => r.some(Boolean));
  const tz = getSS().getSpreadsheetTimeZone();
  return values.map(r => {
    const d = r[3];
    r[3] = d instanceof Date ? Utilities.formatDate(d, tz, "MM/dd/yyyy") : (d ?? "").toString();
    return r;
  });
}

/** 🔗 Navigation helpers */
function openClientManualSheet() {
  const name = getLabCell("P24");
  if (!isNonEmptyString(name)) return logAlert("⚠️ No client name found in P24.");
  const sheet = getSheetSafe(name);
  sheet ? getSS().setActiveSheet(sheet) : logAlert(`❌ Client sheet "${name}" not found.`);
}

function openClientSheet(name) {
  if (!isNonEmptyString(name)) return logAlert("⚠️ No sheet name provided.");
  const sheet = getSheetSafe(name);
  sheet ? getSS().setActiveSheet(sheet) : logAlert(`❌ Sheet "${name}" not found.`);
}

function getClientSheetUrl(name) {
  if (!name) throw new Error("No sheet name provided");

  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error(`Sheet "${name}" not found`);

  if (sheet.isSheetHidden()) {
    sheet.showSheet();
  }

  const ssId = ss.getId();
  const sheetId = sheet.getSheetId();
  return `https://docs.google.com/spreadsheets/d/${ssId}/edit#gid=${sheetId}`;
}

/** 🆕 Add Client Sheet */
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

  const ss = getSS();
  const newSheet = template.copyTo(ss);
  newSheet.setName(sheetName);

  // IMPORTANT: make sure sheet is ready before writing
  SpreadsheetApp.flush();

  newSheet.getRange("E1").setValue(sheetName);
  ss.setActiveSheet(newSheet);
  ss.moveActiveSheet(1);
}

/** 🔔 Notification Panel */
function displayNotificationPanel() {
  showDialog("NotificationPanel", "Notifications", 500, 700);
}

function getNotificationData(tabName) {
  const ss = getActiveSS();
  const notifSheet = ss.getSheetByName("DailyNotifications_Log");
  const monthlyReportSheet = ss.getSheetByName("MonthlyReport_Log");
  const yearlyReportSheet = ss.getSheetByName("YearlyReport_Log");
  const reminderSheet = ss.getSheetByName("Reminders_Log");

  console.log(`🚀 getNotificationData called with tabName: ${tabName}`);

  try {
    if (tabName === "Daily") {
      const vals = notifSheet?.getRange("A2:Z3").getValues() || [];
      const daily = vals.reduce((a, _, i, arr) => {
        if (i === 0)
          for (let c = 0; c < arr[0].length; c += 5)
            if (arr[0][c] && arr[1][c]) a.push({ title: arr[0][c], content: arr[1][c] });
        return a;
      }, []);
      console.log(`✅ Returning ${daily.length} Daily items`);
      return daily;
    }

    if (tabName === "Report") {

      const reportSheets = [
        { sheet: monthlyReportSheet, type: "Monthly" },
        { sheet: yearlyReportSheet, type: "Yearly" }
      ];

      const reports = [];

      reportSheets.forEach(src => {

        if (!src.sheet) {
          console.log(`⚠️ ${src.type} report sheet not found`);
          return;
        }

        const lastRow = src.sheet.getLastRow();

        if (lastRow < 1) return;

        const vals = src.sheet.getRange(1, 1, lastRow, 4).getValues();

        vals.forEach(r => {

          if (!r[0]) return;

          reports.push({
            dateObj: new Date(r[0]),
            date: formatDateSafe(r[0], "yyyy-MM-dd HH:mm:ss") || r[0],
            id: r[1],
            title: r[2],
            link: r[3],
            type: src.type
          });

        });

      });

      reports.sort((a, b) => b.dateObj - a.dateObj);

      reports.forEach(r => delete r.dateObj);

      console.log(`✅ Returning ${reports.length} reports`);
      console.log(reports);

      return reports;
    }

    if (tabName === "Reminder") {
      const vals = reminderSheet?.getRange("A2:Z3").getValues() || [];
      const reminders = vals.reduce((a, _, i, arr) => {
        if (i === 0)
          for (let c = 0; c < arr[0].length; c += 5) {
            const t = arr[0][c],
              ctt = arr[1][c];
            if (t && ctt)
              a.push({
                title: t instanceof Date ? formatDateSafe(t, "MMMM dd, yyyy HH:mm:ss") : t,
                content: ctt,
              });
          }
        return a;
      }, []);
      console.log(`✅ Returning ${reminders.length} Reminders`);
      return reminders;
    }

    console.log("⚠️ Unrecognized tab:", tabName);
    return { error: `Unknown tab: ${tabName}` };

  } catch (err) {
    console.error(`❌ Error in getNotificationData(${tabName}):`, err);
    return { error: String(err) };
  }
}

/** 💼 Upsells + Formula Dialogs */
const addUpsells = () => showDialog("UpsellsDialog", "Upsells", 770, 1000);
const openFormulaDialog = () => showDialog("FormulaDialog", "Add Formula to Sheets", 400, 450);

/** 
 * Grind charts updater using utils helpers
 */ 

/** 🪟 Open chart dialogs */
function openChartDialog(type, title) {
  const html = HtmlService.createTemplateFromFile("PerformanceChart");
  html.chartType = type;
  SpreadsheetApp.getUi().showModalDialog(html.evaluate().setWidth(1200).setHeight(650), title);
}

const openDailyChart = () => openChartDialog("daily", "Performance Chart");
const openMonthlyChart = () => openChartDialog("monthly", "Performance Chart");

/** 📅 Get chart data */
function getDailyChartData() {
  const sheet = getLabSheet();
  if (!sheet) return [];
  return sheet
    .getRange("AB3:AC")
    .getValues()
    .filter(([a, b]) => a && b)
    .map(([a, b]) => [String(a), Number(b)]);
}

function getMonthlyChartData() {
  const sheet = getLabSheet();
  if (!sheet) return [];
  return sheet
    .getRange("X3:Y")
    .getValues()
    .filter(([a, b]) => a && b)
    .map(([a, b]) => [String(a), Number(b)]);
}

function getYearlyChartData(year = "all") {
  const sheet = getLabSheet();
  if (!sheet) return [];

  const values = sheet
    .getRange("AJ11:AN" + sheet.getLastRow())
    .getValues()
    .filter(r => r[0] && !isNaN(r[1]));

  // Default: return latest 3 years
  if (year === "all") {
    const YEARS_TO_SHOW = 5;
    const currentYear = new Date().getFullYear();
    const startYear = currentYear - (YEARS_TO_SHOW - 1);

    return values
      .filter(r => Number(r[0]) >= startYear && Number(r[0]) <= currentYear)
      .map(r => [
        String(r[0]),
        Number(r[1]),
        Number(r[2]),
        Number(r[3]),
        Number(r[4])
      ]);
  }

  // Return a specific year
  return values
    .filter(r => Number(r[0]) === Number(year))
    .map(r => [
      String(r[0]),
      Number(r[1]),
      Number(r[2]),
      Number(r[3]),
      Number(r[4])
    ]);
}

function getPrevYearMonthlyChartData() {
  const sheet = getLabSheet();
  if (!sheet) return [];
  return sheet
    .getRange("BA5:BB16")
    .getValues()
    .filter(([a, b]) => a && b)
    .map(([a, b]) => [String(a), Number(b)]);
}

/** 
 * User profile settings handling
 */

/** 🧭 Show profile settings UI */
function showProfileSettings() {
  showDialog("ProfileSettingsDialog", "Profile Settings", 780, 600);
}

/** 📋 Get profile data from active sheet */
function getProfileData() {
  const sheet = getLabSheet(); // use specific sheet if profile lives in Lab 3.0
  if (!sheet) return {};

  const fields = {
    profilePic: "BE3",
    firstName: "BE7",
    lastName: "BE9",
    displayName: "BE11",
    desc: "BE13",
    notifDiscord: "BF3",
    notifEmail: "BF5"
  };

  const data = {};
  for (const [key, cell] of Object.entries(fields)) {
    data[key] = getCellValueSafe(sheet, cell);
  }

  return data;
}

/** 💾 Save profile data into sheet */
function saveProfileData(data) {
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

/** 💾 Save notification data into sheet */
function saveNotificationData(data) {
  const sheet = getLabSheet();
  if (!sheet) return "❌ Lab 3.0 sheet not found.";

  const fields = {
    notifDiscord: "BF3",
    notifEmail: "BF5"
  };

  for (const [key, cell] of Object.entries(fields)) {
    if (data[key] !== undefined) sheet.getRange(cell).setValue(data[key]);
  }

  return "✅ Notification settings saved!";
}

/** 
 * Hourly history + chart handlers
 */

/** 🧭 Open Hourly Logs Dialog */
function openHourlyLog() {
  showDialog("HourlyLogsDialog", "Hourly History Dashboard", 550, 900);
}

/** 📊 Fetch chart data from Hourly History!J4:K */
function getHourlyChartData() {
  const sheet = getSheetSafe("Hourly History");
  if (!sheet) return [];

  const values = sheet.getRange("J4:K").getValues();
  return values
    .filter(r => r[0] !== '' && r[0] !== null)
    .map(r => [String(r[0]), Number(r[1]) || 0]);
}

/** 🔁 Update Sheet ID in B12 formula */
function updateSheetId(newId) {
  if (!isNonEmptyString(newId)) throw new Error("❌ No Sheet ID provided.");

  const sheet = getSheetSafe("Hourly History");
  if (!sheet) throw new Error('❌ Sheet "Hourly History" not found.');

  const formula = `=IFERROR(IMPORTRANGE("${newId}","Metrix!R41"), 0)`;
  sheet.getRange("B12").setFormula(formula);

  return "✅ Sheet ID updated successfully!";
}

/** ➕ Add F value and track Month/Year in E column */
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
    monthYear
  };
}

/** 
 * Scheduled notifications + reports
 */

/** Deletes generated report PDFs older than 3 months. */
function cleanupOldReports() {

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 3);

  const logs = getReportLogs();

  let processed = 0;
  let deleted = 0;
  let kept = 0;
  let missing = 0;

  logs.forEach(report => {

    const match = report.link.match(/\/d\/([a-zA-Z0-9_-]+)/);

    if (!match) return;

    const fileId = match[1];

    try {

      const file = DriveApp.getFileById(fileId);

      processed++;

      if (file.getDateCreated() < cutoff) {
        file.setTrashed(true);
        deleted++;
      } else {
        kept++;
      }

    } catch (err) {

      // File may already be deleted or inaccessible.
      missing++;

    }

  });

  Logger.log({
    processed,
    deleted,
    kept,
    missing
  });

  return {
    processed,
    deleted,
    kept,
    missing
  };

}

/** 🕒 Daily weekday triggers */
function dailyNotification() {
  const day = new Date().getDay();
  if (day >= 1 && day <= 5) {
    logNotification();
    sendDailyReport();
  }
}

/** 📅 Monthly/Yearly end triggers */
function monthlyNotification() {

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (tomorrow.getDate() !== 1) return;

  try {
    saveMonthlyReportPDF();
    sendMonthlyReport();
  } catch (err) {
    logAlert(err);
  }

}

function yearlyNotification() {

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const isLastDayOfYear =
    tomorrow.getMonth() === 0 &&
    tomorrow.getDate() === 1;

  if (!isLastDayOfYear) return;

  try {
    saveYearlyReportPDF();
    sendYearlyReport();
  } catch (err) {
    logAlert(err);
  }

}

/** * 📊 Run Monthly/Yearly Report manually */
function runMonthlyReportNow() {

  logAlert("🚀 Starting Monthly Report");

  saveMonthlyReportPDF();
  sendMonthlyReport();

  logAlert("✅ Monthly Report Complete");

}

function runYearlyReportNow() {

  logAlert("🚀 Starting Yearly Report");

  saveYearlyReportPDF();
  sendYearlyReport();

  logAlert("✅ Yearly Report Complete");

}

/** 🗒️ Log notifications */
function logNotification() {
  const notifSheet = getSheetSafe("DailyNotifications_Log");
  const labSheet = getSheetSafe("Lab 3.0");
  if (!notifSheet || !labSheet) return;

  const timestamp = formatDateSafe(new Date(), "MM-dd HH:mm");
  const content = labSheet.getRange("AX25").getValue();
  const countCell = notifSheet.getRange("B1");
  let count = Number(countCell.getValue()) || 0;

  if (count >= 5) {
    notifSheet.getRange("2:3").clearContent();
    count = 0;
  }

  const col = 1 + (count * 5);
  notifSheet.getRange(2, col).setValue(`Members update report ${timestamp}`);
  notifSheet.getRange(3, col).setValue(content);
  countCell.setValue(count + 1);
}

/** Helper: Fetch Discord webhook from sheet (BF3 in Lab 3.0) */
function getDiscordWebhook() {
  const sheet = getSheetSafe("Lab 3.0");
  if (!sheet) return "";
  const webhook = sheet.getRange("BF3").getValue();
  return webhook ? webhook.trim() : "";
}

/** Helper: Fetch email from sheet (BF5 in Lab 3.0) */
function getNotificationEmail() {
  const sheet = getSheetSafe("Lab 3.0");
  if (!sheet) return "";
  const email = sheet.getRange("BF5").getValue();
  return email ? email.trim() : "";
}

/** Send daily Discord report */
function sendDailyReport() {
  const sheet = getSheetSafe("Lab 3.0");
  if (!sheet) return;

  const webhookUrl = getDiscordWebhook();
  if (!webhookUrl) {
    console.warn("⚠️ No Discord webhook found in BF3. Daily report not sent.");
    return;
  }

  const toCheck = sheet.getRange("AX4:AX17").getValues().flat().filter(String);
  const prospectNames = sheet.getRange("AY4:AY17").getValues().flat();
  const prospectDetails = sheet.getRange("AZ4:AZ17").getValues().flat();

  const prospect = prospectNames.map((n, i) => n && (prospectDetails[i] ? `${n} | ${prospectDetails[i]}` : n))
    .filter(Boolean);

  const now = new Date();
  const formatted = formatDateSafe(now, "MMMM dd, yyyy HH:mm:ss");

  const embed = {
    title: `⭐ Daily Report - ${formatted}`,
    description: `**To Check (${toCheck.length})**\n${toCheck.map(n => "- " + n).join("\n")}\n\n**Prospect (${prospect.length})**\n${prospect.map(n => "- " + n).join("\n")}`,
    color: 0x00FF00,
    timestamp: now.toISOString()
  };

  sendDiscordMessage(webhookUrl, embed);
}

/** Helper: Fetch Drive Folder ID from Lab 3.0 (BG3) */
function getReportFolder() {
  const sheet = getSheetSafe("Lab 3.0");
  if (!sheet) throw new Error("Lab 3.0 sheet not found.");

  const folderId = String(sheet.getRange("BG3").getValue()).trim();
  if (!folderId) throw new Error("Drive Folder ID (BG3) is empty.");

  return DriveApp.getFolderById(folderId);
}

/** 💾 Save report as PDF + store link (3-level fallback) */
function saveReportPDF(config) {

  const ss = getSS();
  const sheet = getSheetSafe(config.reportSheet);
  if (!sheet) return;

  const folder = getReportFolder();

  const reportNum = sheet.getRange("G1").getValue();
  const reportName = sheet.getRange("B1").getValue();
  const pdfName = `${config.reportType}Report_${reportNum}_${reportName}.pdf`;

  const range = sheet.getDataRange();
  const formulas = range.getFormulas();

  const wasHidden = sheet.isSheetHidden();

  let blob = null;
  let success = false;

  try {

    // 👀 Unhide temporarily if needed
    if (wasHidden) {
      sheet.showSheet();
      SpreadsheetApp.flush();
      Utilities.sleep(1000);
    }

    // Freeze formulas as values for export
    range.setValues(range.getDisplayValues());
    SpreadsheetApp.flush();
    Utilities.sleep(5000);

    const gid = sheet.getSheetId();

    const url =
      `https://docs.google.com/spreadsheets/d/${ss.getId()}/export` +
      `?exportFormat=pdf` +
      `&format=pdf` +
      `&gid=${gid}` +
      `&portrait=true` +
      `&size=A4` +
      `&sheetnames=false` +
      `&printtitle=false` +
      `&pagenumbers=false` +
      `&gridlines=false` +
      `&fzr=false`;

    const token = ScriptApp.getOAuthToken();

    // ==========================
    // Try 1
    // ==========================

    for (let i = 1; i <= 3; i++) {

      try {

        const response = UrlFetchApp.fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`
          },
          muteHttpExceptions: true
        });

        if (response.getResponseCode() === 200) {

          blob = response.getBlob().setName(pdfName);
          success = true;

          logAlert(`✅ Success on Try 1 (attempt ${i})`);

          break;
        }

        logAlert(
          `Try 1 Attempt ${i} failed (${response.getResponseCode()})\n` +
          response.getContentText()
        );

      } catch (err) {

        logAlert(`Try 1 Attempt ${i} error: ${err}`);

      }

      Utilities.sleep(2000);

    }

    // ==========================
    // Try 2
    // ==========================

    if (!success) {

      logAlert("⚠️ Try 1 failed. Running Fallback 1...");

      try {

        blob = saveReportPDF_Fallback1(config, pdfName);

        if (blob) {
          success = true;
          logAlert("✅ Fallback 1 succeeded!");
        }

      } catch (err) {

        logAlert("❌ Fallback 1 failed: " + err.message);

      }

    }

    // ==========================
    // Try 3
    // ==========================

    if (!success) {

      logAlert("⚠️ Fallback 1 failed. Running Fallback 2...");

      try {

        blob = saveReportPDF_Fallback2(config, pdfName);

        if (blob) {
          success = true;
          logAlert("✅ Fallback 2 succeeded!");
        }

      } catch (err) {

        logAlert("❌ Fallback 2 failed: " + err.message);

      }

    }

    if (!success) {
      throw new Error("❌ Failed to export PDF after 3 layered attempts.");
    }

    // ==========================
    // Save PDF
    // ==========================

    const file = folder.createFile(blob);
    const fileUrl = file.getUrl();

    getSheetSafe(config.logSheet)?.appendRow([
      new Date(),
      reportNum,
      reportName,
      fileUrl
    ]);

    if (config.latestLinkCell) {
      getSheetSafe("Lab 3.0")
        ?.getRange(config.latestLinkCell)
        .setValue(fileUrl);
    }

    const lab = getSheetSafe("Lab 3.0");

    if (lab) {

      const cell = lab.getRange("AZ30");

      cell.setValue((Number(cell.getValue()) || 0) + 1);

    }

    logAlert(`✅ PDF saved successfully: ${fileUrl}`);

    return fileUrl;

  } finally {

    // Always restore formulas
    range.setFormulas(formulas);

    SpreadsheetApp.flush();

    // Restore hidden state
    if (wasHidden) {
      sheet.hideSheet();
    }

  }

}

function saveMonthlyReportPDF() {
  return saveReportPDF({
    reportType: "Monthly",
    reportSheet: "Monthly Report PDF",
    logSheet: "MonthlyReport_Log",
    latestLinkCell: "AX27",
  });
}

function saveYearlyReportPDF() {
  return saveReportPDF({
    reportType: "Yearly",
    reportSheet: "Yearly Report PDF",
    logSheet: "YearlyReport_Log",
    latestLinkCell: "AY27",
  });
}

function saveCustomReportPDF(type) {

  SpreadsheetApp.flush();
  Utilities.sleep(5000);
  SpreadsheetApp.flush();

  const configs = {
    monthly: {
      reportType: "Monthly",
      reportSheet: "Monthly Report PDF Generator",
      logSheet: "MonthlyReport_Log",
      latestLinkCell: "AZ27"
    },
    yearly: {
      reportType: "Yearly",
      reportSheet: "Yearly Report PDF Generator",
      logSheet: "YearlyReport_Log",
      latestLinkCell: "BA27"
    }
  };

  const config = configs[type];

  if (!config) {
    throw new Error(`Unknown report type: ${type}`);
  }

  return saveReportPDF(config);

}

function updateCustomReportPDF(type, month, year) {

  const settings = getSheetSafe("Settings");

  if (type === "monthly") {
    settings.getRange("A3").setValue(month);
    settings.getRange("A5").setValue(year);
  } else if (type === "yearly") {
    settings.getRange("A11").setValue(Number(year));
  } else {
    throw new Error(`Unknown report type: ${type}`);
  }

  SpreadsheetApp.flush();

  return true;

}

function isReportReady(type = "monthly") {

  const ss = SpreadsheetApp.getActive();
  const settings = ss.getSheetByName("Settings");

  const configs = {
    monthly: {
      generatorSheet: "Month Log Generator",
      pdfSheet: "Monthly Report PDF Generator",
      expectedTitle: () =>
        `${settings.getRange("A3").getDisplayValue().trim()} ${settings.getRange("A5").getDisplayValue().trim()}`
    },

    yearly: {
      generatorSheet: "Year Log Generator",
      pdfSheet: "Yearly Report PDF Generator",
      expectedTitle: () =>
        settings.getRange("A11").getDisplayValue().trim()
    }
  };

  const config = configs[type];

  if (!config) {
    throw new Error(`Unknown report type: ${type}`);
  }

  const generator = ss.getSheetByName(config.generatorSheet);
  const pdf = ss.getSheetByName(config.pdfSheet);

  if (!generator || !pdf) {
    throw new Error(`Required sheets for "${type}" report not found.`);
  }

  // Expected title
  const expectedTitle = config.expectedTitle();

  // Current PDF title
  const actualTitle = pdf
    .getRange("B1")
    .getDisplayValue()
    .trim();

  // Wait until the title has updated
  if (!actualTitle.includes(expectedTitle)) {
    return false;
  }

  // Compare client lists
  const generatorClients = generator
    .getRange("J3:J")
    .getDisplayValues()
    .flat()
    .map(v => String(v).trim())
    .filter(Boolean);

  const pdfClients = pdf
    .getRange("C5:C")
    .getDisplayValues()
    .flat()
    .map(v => String(v).trim())
    .filter(Boolean);

  if (generatorClients.length !== pdfClients.length) {
    return false;
  }

  return generatorClients.every((client, i) => client === pdfClients[i]);

}

/** 🧩 Fallback 1: Temp spreadsheet export (Option A) */
function saveReportPDF_Fallback1(config, pdfName) {
  const ss = getSS();
  const sourceSheet = getSheetSafe(config.reportSheet);
  const tempName = `TempExport_${Date.now()}`;
  const tempSS = SpreadsheetApp.create(tempName);
  const tempId = tempSS.getId();

  try {
    // 🚀 copy full sheet with styles
    const defaultSheet = tempSS.getSheets()[0];

    const copiedSheet = sourceSheet.copyTo(tempSS);
    copiedSheet.setName("Report");
    copiedSheet.showSheet();
    tempSS.setActiveSheet(copiedSheet);

    SpreadsheetApp.flush();

    tempSS.deleteSheet(defaultSheet);

    // remove any broken references (to avoid #REF in pdf)
    const range = copiedSheet.getDataRange();
    range.setValues(range.getDisplayValues());

    SpreadsheetApp.flush();
    Utilities.sleep(2500);

    // 🧾 export as pdf
    const exportUrl =
      `https://docs.google.com/spreadsheets/d/${tempId}/export` +
      `?exportFormat=pdf&format=pdf&portrait=true&size=A4&sheetnames=false&printtitle=false` +
      `&pagenumbers=false&gridlines=false&fzr=false`;

    const token = ScriptApp.getOAuthToken();
    let blob = null;

    for (let i = 1; i <= 3; i++) {
      const res = UrlFetchApp.fetch(exportUrl, {
        headers: { Authorization: `Bearer ${token}` },
        muteHttpExceptions: true,
      });
      if (res.getResponseCode() === 200) {
        blob = res.getBlob().setName(pdfName);
        logAlert(`✅ Fallback 1 (sheet copy) success on attempt ${i}`);
        break;
      } else {
        logAlert(`Fallback 1 Attempt ${i} failed: ${res.getResponseCode()}`);
        Utilities.sleep(1500);
      }
    }

    if (!blob) throw new Error("Fallback 1 export failed.");

    DriveApp.getFileById(tempId).setTrashed(true);
    return blob;

  } catch (err) {
    logAlert("❌ Fallback 1 error: " + err.message);
    try { DriveApp.getFileById(tempId).setTrashed(true); } catch (_) {}
    throw err;
  }
}

/** 🧩 Fallback 2: Force refresh + re-export (Option B) */
function saveReportPDF_Fallback2(config, pdfName) {

  const ss = getSS();
  const sheet = getSheetSafe(config.reportSheet);

  const range = sheet.getDataRange();
  const formulas = range.getFormulas();

  const wasHidden = sheet.isSheetHidden();

  try {

    if (wasHidden) {
      sheet.showSheet();
      SpreadsheetApp.flush();
      Utilities.sleep(1000);
    }

    range.setValues(range.getDisplayValues());
    SpreadsheetApp.flush();

    const gid = sheet.getSheetId();

    const exportUrl =
      `https://docs.google.com/spreadsheets/d/${ss.getId()}/export` +
      `?exportFormat=pdf&format=pdf&gid=${gid}` +
      `&portrait=true&size=A4&sheetnames=false&printtitle=false` +
      `&pagenumbers=false&gridlines=false&fzr=false`;

    const token = ScriptApp.getOAuthToken();

    // refresh...
    // export...
    // return blob...

  } finally {

    range.setFormulas(formulas);

    SpreadsheetApp.flush();

    if (wasHidden) {
      sheet.hideSheet();
    }

  }

}

/** 📊 Send report link to Discord + Email */
function sendReport(config) {
  const sheet = getSheetSafe("Lab 3.0");
  if (!sheet) return;

  const webhookUrl = getDiscordWebhook();
  const emailTo = getNotificationEmail();
  const reportLink = sheet.getRange(config.latestLinkCell).getValue();

  if (!reportLink) {
    throw new Error(`No ${config.reportType} report link found.`);
  }

  const now = new Date();
  const formatted = formatDateSafe(now, "MMMM dd, yyyy HH:mm:ss");

  const embed = {
    title: `📊 ${config.reportType} Report - ${formatted}`,
    description: `**${config.reportType} Report:**\n${reportLink}`,
    color: config.color,
    timestamp: now.toISOString()
  };

  // Discord
  if (webhookUrl) {
    sendDiscordMessage(webhookUrl, embed);
  } else {
    logAlert("⚠️ No Discord webhook configured.");
  }

  // Email
  if (emailTo) {
    MailApp.sendEmail({
      to: emailTo,
      subject: `${config.reportType} Report - ${formatted}`,
      htmlBody: `
        <p>Hey 👋,</p>

        <p>Your latest <b>${config.reportType}</b> report is ready.</p>

        <p>
          <a href="${reportLink}">
            📄 View ${config.reportType} Report
          </a>
        </p>

        <p>Generated on ${formatted}</p>

        <br>

        <p>– Your Automation Bot 🤖</p>
      `
    });

    logAlert(`✅ ${config.reportType} report emailed.`);
  } else {
    logAlert("⚠️ No notification email configured.");
  }
}

function sendMonthlyReport() {
  return sendReport({
    reportType: "Monthly",
    latestLinkCell: "AX27",
    color: 0x3498db
  });
}

function sendYearlyReport() {
  return sendReport({
    reportType: "Yearly",
    latestLinkCell: "AY27",
    color: 0x2ecc71
  });
}

/** 💰 Send owed report (15th or month end) */
function sendOwedReport() {
  const today = new Date();
  const date = today.getDate();
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  if (date !== 15 && date !== lastDay) return;

  const sheet = getSheetSafe("Paid & Owed Log");
  const logSheet = getSheetSafe("Reminders_Log");
  if (!sheet || !logSheet) return;

  const webhookUrl = getDiscordWebhook();
  if (!webhookUrl) {
    console.warn("⚠️ No Discord webhook found in BF3. Owed report not sent.");
    return;
  }

  const data = sheet.getRange("O2:Q").getValues().filter(r => r[0]);
  const now = new Date();
  const formatted = formatDateSafe(now, "MMMM dd, yyyy HH:mm:ss");
  const report = data.map(r => `${r[0]}\nTotal Owed: ${r[1]}\nCurrent Month Owed: ${r[2]}`).join("\n\n");

  const embed = {
    title: `💰 Owed Report - ${formatted}`,
    description: report,
    color: 0xffc107,
    timestamp: now.toISOString()
  };

  sendDiscordMessage(webhookUrl, embed);

  const countCell = logSheet.getRange("B1");
  let count = Number(countCell.getValue()) || 0;
  if (count >= 5) {
    logSheet.getRange("2:3").clearContent();
    count = 0;
  }

  const col = 1 + (count * 5);
  logSheet.getRange(2, col).setValue(formatted);
  logSheet.getRange(3, col).setValue(`💰 Owed Report - ${formatted}\n${report}`);
  countCell.setValue(count + 1);
}

/** 🌐 Helper: Discord message sender */
function sendDiscordMessage(webhookUrl, embed, retries = 2) {
  const payload = JSON.stringify({ embeds: [embed] });
  const options = {
    method: "post",
    contentType: "application/json",
    payload,
    muteHttpExceptions: true
  };

  for (let i = 0; i <= retries; i++) {
    try {
      const res = UrlFetchApp.fetch(webhookUrl, options);
      if (res.getResponseCode() === 204 || res.getResponseCode() === 200) return true;
    } catch (err) {
      if (i === retries) logAlert(`❌ sendDiscordMessage failed: ${err.message}`);
      Utilities.sleep(500);
    }
  }
  return false;
}

/** 
 * Manage Upsell entries, records, and summary
 */

/** 💾 Add new upsell entry */
function addUpsellEntry(data) {
  const sheet = getSheetSafe("Upsells");
  if (!sheet) throw new Error('❌ Sheet "Upsells" not found.');

  const startRow = 21;
  const colAValues = sheet.getRange(`A${startRow}:A`).getValues().flat();
  const emptyIndex = colAValues.findIndex(v => !v);

  const nextRow = emptyIndex >= 0 ? startRow + emptyIndex : sheet.getLastRow() + 1;

  const rowData = [
    data.clientName || "",
    data.screenshot || "",
    Number(data.upsellHours) || "",
    Number(data.totalHours) || "",
    data.orasanDate || "",
    data.reportedDate || ""
  ];

  sheet.getRange(nextRow, 1, 1, 6).setValues([rowData]);
  return `✅ Added upsell entry for ${data.clientName || "Unknown Client"}`;
}

/** 📊 Get summary totals */
function getUpsellSummary() {
  try {
    const sheet = getSheetSafe("Upsells");
    if (!sheet) throw new Error();

    const getNum = cellRange => Number(sheet.getRange(cellRange).getValue()) || 0;
    return {
      total: getNum("A2"),
      today: getNum("A4"),
      month: getNum("A6")
    };
  } catch (err) {
    logAlert("⚠️ getUpsellSummary error: " + err.message);
    return { total: 0, today: 0, month: 0 };
  }
}

/** 📋 Get upsell records (A–F rows 21–56) */
function getUpsellRecords() {
  try {
    const sheet = getSheetSafe("Upsells");
    if (!sheet) throw new Error();

    const startRow = 21;
    const lastRow = sheet.getLastRow();
    const numRows = Math.max(0, lastRow - startRow + 1);
    if (numRows === 0) return [];

    const data = sheet.getRange(startRow, 1, numRows, 6).getValues();
    return data
      .filter(r => isNonEmptyString(r[0]))
      .map(r => [
        r[0], // client name
        r[2], // upsell hours
        formatDateSafe(r[4], "MM/dd/yyyy") || r[4]
      ]);
  } catch (err) {
    logAlert("⚠️ getUpsellRecords error: " + err.message);
    return [];
  }
}

/** 🧹 Clear all upsell records and store total */
function clearAllRecords() {
  const sheet = getSheetSafe("Upsells");
  if (!sheet) throw new Error('❌ Sheet "Upsells" not found.');

  const values = sheet.getRange("C21:C").getValues().flat();
  const total = values.reduce((sum, v) => sum + (Number(v) || 0), 0);

  sheet.getRange("A21:F").clearContent();
  sheet.getRange("A8").setValue(total);

  return `✅ Cleared all upsells (Total Hours: ${total})`;
}




