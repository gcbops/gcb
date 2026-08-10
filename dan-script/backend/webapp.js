function doGet() {
  const t = HtmlService.createTemplateFromFile("index");

  return t.evaluate()
    .setTitle("Go Crayons GS")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function loadSubPage(name) {
  const possiblePaths = [
    name,
    'backend/' + name,
    'backend/js/' + name,
    'backend/css/' + name,
    'frontend/' + name,
    'frontend/old/' + name,
    'frontend/components/' + name
  ];

  for (let path of possiblePaths) {
    try {
      return HtmlService.createHtmlOutputFromFile(path).getContent();
    } catch (e) {}
  }

  throw new Error('HTML file "' + name + '" not found in any folder.');
}

function include(filename) {
  const possiblePaths = [
    filename,
    'backend/' + filename,
    'backend/js/' + filename,
    'backend/css/' + filename,
    'frontend/' + filename,
    'frontend/old/' + filename,
    'frontend/components/' + filename
  ];

  for (let path of possiblePaths) {
    try {
      return HtmlService.createHtmlOutputFromFile(path).getContent();
    } catch (e) {}
  }

  throw new Error('Include file "' + filename + '" not found in any folder.');
}

function getHoursSummary() {
  const sheet = getLabSheet();

  const values = sheet.getRange("AW3:AW6").getValues().flat();

  return {
    totalHours: values[0],
    totalPaid: values[1],
    owedHours: values[2],
    netHours: values[3],
  };
}

function getClientTableDataWithNickname(dt) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const logSheet = ss.getSheetByName("Paid & Owed Log");
  let data;
  if (dt === "activeClientsData") {
    data = logSheet.getRange("O2:R" + logSheet.getLastRow()).getValues();
  } else {
    data = logSheet.getRange("J2:M" + logSheet.getLastRow()).getValues();
  }
  
  const results = [];

  data.forEach(row => {
    const [name, id, city, status] = row;
    if (!name) return; 

    let role = "";
    try {
      const personSheet = ss.getSheetByName(name);
      if (personSheet) role = personSheet.getRange("N17").getValue();
    } catch (e) {
      role = "";
    }

    // build object
    results.push({
      name,
      id,
      city,
      status,
      role
    });
  });

  return results;
}

function getPerformanceSummary(yearType) {
  const sheet = getSheetSafe("Lab 3.0");
  if (!sheet) return null;

  let labelRange, valueRange, growthCell;

  if (yearType === "current") {
    labelRange = "AR20:AR23";
    valueRange = "AU20:AU23";
    growthCell = "AU24";
  } else if (yearType === "previous") {
    labelRange = "AR20:AR23"; // labels same
    valueRange = "AT20:AT23";
    growthCell = "AT24";
  } else {
    return null;
  }

  const labels = sheet.getRange(labelRange).getValues().flat();
  const values = sheet.getRange(valueRange).getValues().flat();
  const paidGrowth = sheet.getRange(growthCell).getValue();

  // Use JS Date to get current year
  const today = new Date();
  const year = yearType === "current" ? today.getFullYear() : today.getFullYear() - 1;

  // Prepend year to labels
  const percentages = labels.map((label, i) => [`${year} ${label}`, values[i]]);

  return { percentages, paidGrowth };
}

function getHourTotals() {
  const sheet = getSheetSafe("Lab 3.0");

  const daily = sheet.getRange("AW7").getValue();
  const monthly = sheet.getRange("AW8").getValue();
  const yearly = sheet.getRange("AW9").getValue();

  return {
    daily: daily,
    monthly: monthly,
    yearly: yearly
  };
}

function getTargetPercents() {
  const sheet = getSheetSafe("Lab 3.0");
  return {
    manual: sheet.getRange("AU29").getValue(),
    hourly: sheet.getRange("AU30").getValue(),
    combined: sheet.getRange("AU31").getValue()
  };
}

function getCurrentYearTargetProgress() {
  const sheet = getSheetSafe("Lab 3.0");
  return {
    monthAvg: sheet.getRange("AU20").getValue(),
    paidHr: sheet.getRange("AU21").getValue(),
    paidGrowth: sheet.getRange("AU24").getValue(),
    manual: sheet.getRange("AU29").getValue(),
    hourly: sheet.getRange("AU30").getValue(),
    combined: sheet.getRange("AU31").getValue(),
  };
}

function getPreviousYearTargetProgress() {
  const sheet = getSheetSafe("Lab 3.0");
  return {
    monthAvg: sheet.getRange("AT20").getValue(),
    paidHr: sheet.getRange("AT21").getValue(),
    paidGrowth: sheet.getRange("AT24").getValue(),
    manual: sheet.getRange("AU25").getValue(),
    hourly: sheet.getRange("AU26").getValue(),
    combined: sheet.getRange("AU27").getValue(),
  };
}

function getClientHoursForOverview(clientName) {
  const sheet = getSheetSafe(clientName);

  if (!sheet) {
    return { error: "NOT_FOUND" };
  }

  const totalHrs = sheet.getRange("B8").getValue();
  const weekHrs  = sheet.getRange("N18").getValue();
  const monthHrs = sheet.getRange("N19").getValue();
  const yearHrs  = sheet.getRange("N20").getValue();

  return {
    totalHrs,
    weekHrs,
    monthHrs,
    yearHrs
  };
}

function getReportsOverview() {

  const ss = getSS();
  const recentLogs = getReportLogs(ss)
  const lab = getSheetSafe("Lab 3.0");
  const getLabValue = (cell, fallback = null) =>lab ? lab.getRange(cell).getValue() : fallback;
  const monthlyCount = Number(getLabValue("AX30", 0)) || 0;
  const yearlyCount = Number(getLabValue("AY30", 0)) || 0;
  const pdfGenerated = Number(getLabValue("AZ30", 0)) || 0;

  let driveStorage = false;
  try {
    const folder = getReportFolder();
    folder.getName();
    driveStorage = true;
  } catch (e) {
    driveStorage = false;
  }

  const discord = !!getLabValue("BF3");
  const email = !!getLabValue("BF5");

  const automationActive =
    driveStorage &&
    discord &&
    email;

  // next monthly schedule
  const today = new Date();

  const nextMonthly = new Date(
    today.getFullYear(),
    today.getMonth(),
    15
  );

  if (today.getDate() >= 15) {
    nextMonthly.setMonth(nextMonthly.getMonth() + 1);
  }

  return {
    logs: recentLogs,
    counts: {
      monthly: monthlyCount,
      yearly: yearlyCount,
      pdfGenerated,
      automation: automationActive
    },
    discord,
    email,
    driveStorage,
    nextScheduled: Utilities.formatDate(
      nextMonthly,
      Session.getScriptTimeZone(),
      "MMMM dd, yyyy"
    )
  };

}

function getReportLogs(ss = getSS()) {

  const sources = [
    { sheet: "MonthlyReport_Log", type: "Monthly" },
    { sheet: "YearlyReport_Log", type: "Yearly" }
  ];

  const logs = [];

  sources.forEach(src => {

    const sh = ss.getSheetByName(src.sheet);
    if (!sh) return;

    const lastRow = sh.getLastRow();

    if (lastRow <= 1) return;

    const values = sh
        .getRange(2, 1, lastRow - 1, 4)
        .getDisplayValues();

    values.forEach(row => {

      if (!row[0] || !row[1] || !row[3]) return;

      logs.push({
        date: row[0],
        id: row[1],
        name: row[2],
        link: row[3],
        type: src.type
      });

    });

  });

  logs.sort((a, b) => new Date(b.date) - new Date(a.date));

  return logs;

}

function getMonthlyReportHistory() {

  const ss = getSS();
  return {
    reportLogs: getReportLogs(ss).filter(
      (reportLog) => reportLog.type === "Monthly",
    ),
  };

}

function getYearlyReportHistory() {

  const ss = getSS();
  return {
    reportLogs: getReportLogs(ss).filter(
      (reportLog) => reportLog.type === "Yearly",
    ),
  };

}

function getReportById(reportId) {

  const report = getReportLogs()
    .find(r => r.id === reportId);

  if (!report) {
    throw new Error("Report not found.");
  }

  return report;

}

/** Sends a report by email. */
function sendEmailReport(report) {

  const emailTo = getNotificationEmail();

  if (!emailTo) {
    throw new Error("No notification email configured.");
  }

  const formatted = formatDateSafe(
    new Date(),
    "MMMM dd, yyyy HH:mm:ss"
  );

  MailApp.sendEmail({
    to: emailTo,

    subject: `${report.type} Report - ${report.name}`,

    htmlBody: `
      <p>Hey 👋,</p>

      <p>
        Your <b>${report.type}</b> report is ready.
      </p>

      <table
        cellpadding="6"
        cellspacing="0"
        border="0">

        <tr>
          <td><b>Report</b></td>
          <td>${report.name}</td>
        </tr>

        <tr>
          <td><b>Type</b></td>
          <td>${report.type}</td>
        </tr>

        <tr>
          <td><b>ID</b></td>
          <td>${report.id}</td>
        </tr>

      </table>

      <br>

      <p>
        <a href="${report.link}">
          📄 View Report
        </a>
      </p>

      <p>
        Sent on ${formatted}
      </p>

      <br>

      <p>— Your Automation Bot 🤖</p>
    `
  });

  return true;

}

/** Sends a report notification to Discord. */
function sendDiscordReport(report) {

  const webhookUrl = getDiscordWebhook();

  if (!webhookUrl) {
    throw new Error("No Discord webhook configured.");
  }

  const embed = {

    title: `📄 ${report.type} Report`,

    description:
      `A **${report.type.toLowerCase()}** report is available.\n\n` +
      `**Report:** ${report.name}\n` +
      `**ID:** ${report.id}\n\n` +
      `${report.link}`,

    color:
      report.type === "Monthly"
        ? 0x3498db
        : 0x2ecc71,

    timestamp: new Date().toISOString()

  };

  const sent = sendDiscordMessage(
    webhookUrl,
    embed
  );

  if (!sent) {
    throw new Error(
      "Failed sending Discord notification."
    );
  }

  return true;

}

/** Sends the latest report by email. */
function emailLatestReport(report) {
  return sendEmailReport(report);
}

/** Sends a requested report by its ID. */
function sendRequestedEmailReport(reportId) {
  const report = getReportById(reportId);
  return sendEmailReport(report);
}

/** Sends the latest report to Discord. */
function sendLatestReportToDiscord(report) {
  return sendDiscordReport(report);
}

/** Sends a requested report to Discord by its ID. */
function sendRequestedDiscordReport(reportId) {
  const report = getReportById(reportId);
  return sendDiscordReport(report);
}

function checkExistingReport(type, reportName) {

  const report = getReportLogs().find(log => {

    if (log.type !== (type === "monthly" ? "Monthly" : "Yearly")) {
      return false;
    }

    return String(log.name).trim().toLowerCase() ===
           String(reportName).trim().toLowerCase();

  });

  return {
    exists: !!report,
    report: report || null
  };

}

function validateCustomMonthlyReport(month, year) {

  const sh = getSheetSafe("Monthly Hours Log");

  // Find the first available month (starting at column M)
  const headers = sh.getRange(1, 13, 1, sh.getLastColumn() - 12)
    .getDisplayValues()[0];

  const firstMonthText = headers.find(h => h);
  if (!firstMonthText) {
    throw new Error("No available months found in Monthly Hours Log.");
  }

  const firstDate = new Date("1 " + firstMonthText);
  const selectedDate = new Date("1 " + month + " " + year);

  // Normalize to first day of month
  firstDate.setDate(1);
  selectedDate.setDate(1);

  // Current month (prevent future reports)
  const today = new Date();
  const currentDate = new Date(today.getFullYear(), today.getMonth(), 1);

  if (selectedDate < firstDate) {
    return {
      valid: false,
      message: `Reports are only available starting from ${firstMonthText}.`
    };
  }

  if (selectedDate > currentDate) {
    return {
      valid: false,
      message: "You cannot generate a report for a future month."
    };
  }

  return {
    valid: true
  };

}

function validateCustomYearlyReport(year) {

  const sh = getSheetSafe("Monthly Hours Log");

  // Find the first available month (starting at column M)
  const headers = sh.getRange(1, 13, 1, sh.getLastColumn() - 12)
    .getDisplayValues()[0];

  const firstMonthText = headers.find(h => h);

  if (!firstMonthText) {
    throw new Error("No available months found in Monthly Hours Log.");
  }

  const firstYear = new Date("1 " + firstMonthText).getFullYear();
  const selectedYear = Number(year);
  const currentYear = new Date().getFullYear();

  if (selectedYear < firstYear) {
    return {
      valid: false,
      message: `Reports are only available starting from ${firstYear}.`
    };
  }

  if (selectedYear > currentYear) {
    return {
      valid: false,
      message: "You cannot generate a report for a future year."
    };
  }

  return {
    valid: true
  };

}