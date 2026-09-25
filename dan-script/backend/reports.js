function cleanupOldReports() {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 3);

  const logs = getReportLogs();

  let processed = 0;
  let deleted = 0;
  let kept = 0;
  let missing = 0;

  logs.forEach((report) => {
    const match = report.link.match(/\/d\/([a-zA-Z0-9_-]+)/);

    if (!match) {
      return;
    }

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

  const result = {
    processed,
    deleted,
    kept,
    missing,
  };

  Logger.log(result);

  return result;
}

function runMonthlyReportNow() {
  logResponse("🚀 Starting Monthly Report");

  saveMonthlyReportPDF();
  sendMonthlyReport();

  logResponse("✅ Monthly Report Complete");
}

function runYearlyReportNow() {
  logResponse("🚀 Starting Yearly Report");

  saveYearlyReportPDF();
  sendYearlyReport();

  logResponse("✅ Yearly Report Complete");
}

function getReportFolder() {
  const folderId =
    PropertiesService.getScriptProperties().getProperty("REPORT_FOLDER_ID");

  if (!folderId) {
    throw new Error("REPORT_FOLDER_ID is not configured.");
  }

  return DriveApp.getFolderById(folderId);
}

function saveReportPDF(config) {
  const ss = getSpreadsheet();
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
            Authorization: `Bearer ${token}`,
          },
          muteHttpExceptions: true,
        });

        if (response.getResponseCode() === 200) {
          blob = response.getBlob().setName(pdfName);
          success = true;

          logResponse(`✅ Success on Try 1 (attempt ${i})`);

          break;
        }

        logResponse(
          `Try 1 Attempt ${i} failed (${response.getResponseCode()})\n` +
            response.getContentText(),
        );
      } catch (err) {
        logResponse(`Try 1 Attempt ${i} error: ${err}`);
      }

      Utilities.sleep(2000);
    }

    // ==========================
    // Try 2
    // ==========================

    if (!success) {
      logResponse("⚠️ Try 1 failed. Running Fallback 1...");

      try {
        blob = saveReportPDF_Fallback1(config, pdfName);

        if (blob) {
          success = true;
          logResponse("✅ Fallback 1 succeeded!");
        }
      } catch (err) {
        logResponse("❌ Fallback 1 failed: " + err.message);
      }
    }

    // ==========================
    // Try 3
    // ==========================

    if (!success) {
      logResponse("⚠️ Fallback 1 failed. Running Fallback 2...");

      try {
        blob = saveReportPDF_Fallback2(config, pdfName);

        if (blob) {
          success = true;
          logResponse("✅ Fallback 2 succeeded!");
        }
      } catch (err) {
        logResponse("❌ Fallback 2 failed: " + err.message);
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
      fileUrl,
    ]);

    if (config.latestLinkCell) {
      getLabSheet()?.getRange(config.latestLinkCell).setValue(fileUrl);
    }

    const lab = getLabSheet();

    if (lab) {
      const cell = lab.getRange("AZ30");

      cell.setValue((Number(cell.getValue()) || 0) + 1);
    }

    logResponse(`✅ PDF saved successfully: ${fileUrl}`);

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
      latestLinkCell: "AZ27",
    },
    yearly: {
      reportType: "Yearly",
      reportSheet: "Yearly Report PDF Generator",
      logSheet: "YearlyReport_Log",
      latestLinkCell: "BA27",
    },
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
  const settings = getSheetSafe("Settings");

  const configs = {
    monthly: {
      generatorSheet: "Month Log Generator",
      pdfSheet: "Monthly Report PDF Generator",
      expectedTitle: () =>
        `${settings.getRange("A3").getDisplayValue().trim()} ${settings.getRange("A5").getDisplayValue().trim()}`,
    },

    yearly: {
      generatorSheet: "Year Log Generator",
      pdfSheet: "Yearly Report PDF Generator",
      expectedTitle: () => settings.getRange("A11").getDisplayValue().trim(),
    },
  };

  const config = configs[type];

  if (!config) {
    throw new Error(`Unknown report type: ${type}`);
  }

  const generator = getSheetSafe(config.generatorSheet);
  const pdf = getSheetSafe(config.pdfSheet);

  if (!generator || !pdf) {
    throw new Error(`Required sheets for "${type}" report not found.`);
  }

  // Expected title
  const expectedTitle = config.expectedTitle();

  // Current PDF title
  const actualTitle = pdf.getRange("B1").getDisplayValue().trim();

  // Wait until the title has updated
  if (!actualTitle.includes(expectedTitle)) {
    return false;
  }

  // Compare client lists
  const generatorClients = generator
    .getRange("J3:J")
    .getDisplayValues()
    .flat()
    .map((v) => String(v).trim())
    .filter(Boolean);

  const pdfClients = pdf
    .getRange("C5:C")
    .getDisplayValues()
    .flat()
    .map((v) => String(v).trim())
    .filter(Boolean);

  if (generatorClients.length !== pdfClients.length) {
    return false;
  }

  return generatorClients.every((client, i) => client === pdfClients[i]);
}

function saveReportPDF_Fallback1(config, pdfName) {
  const ss = getSpreadsheet();
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
        logResponse(`✅ Fallback 1 (sheet copy) success on attempt ${i}`);
        break;
      } else {
        logResponse(`Fallback 1 Attempt ${i} failed: ${res.getResponseCode()}`);
        Utilities.sleep(1500);
      }
    }

    if (!blob) throw new Error("Fallback 1 export failed.");

    DriveApp.getFileById(tempId).setTrashed(true);
    return blob;
  } catch (err) {
    logResponse("❌ Fallback 1 error: " + err.message);
    try {
      DriveApp.getFileById(tempId).setTrashed(true);
    } catch (_) {}
    throw err;
  }
}

function saveReportPDF_Fallback2(config, pdfName) {
  const ss = getSpreadsheet();
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

function sendReport(config) {
  const sheet = getLabSheet();
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
    timestamp: now.toISOString(),
  };

  // Discord
  if (webhookUrl) {
    sendDiscordMessage(webhookUrl, embed);
  } else {
    logResponse("⚠️ No Discord webhook configured.");
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
      `,
    });

    logResponse(`✅ ${config.reportType} report emailed.`);
  } else {
    logResponse("⚠️ No notification email configured.");
  }
}

function sendMonthlyReport() {
  return sendReport({
    reportType: "Monthly",
    latestLinkCell: "AX27",
    color: 0x3498db,
  });
}

function sendYearlyReport() {
  return sendReport({
    reportType: "Yearly",
    latestLinkCell: "AY27",
    color: 0x2ecc71,
  });
}

function sendOwedReport() {
  const today = new Date();
  const date = today.getDate();
  const lastDay = new Date(
    today.getFullYear(),
    today.getMonth() + 1,
    0,
  ).getDate();
  if (date !== 15 && date !== lastDay) return;

  const sheet = getSheetSafe("Paid & Owed Log");
  const logSheet = getSheetSafe("Reminders_Log");
  if (!sheet || !logSheet) return;

  const webhookUrl = getDiscordWebhook();
  if (!webhookUrl) {
    console.warn("⚠️ No Discord webhook found in BF3. Owed report not sent.");
    return;
  }

  const data = sheet
    .getRange("O2:Q")
    .getValues()
    .filter((r) => r[0]);
  const now = new Date();
  const formatted = formatDateSafe(now, "MMMM dd, yyyy HH:mm:ss");
  const report = data
    .map((r) => `${r[0]}\nTotal Owed: ${r[1]}\nCurrent Month Owed: ${r[2]}`)
    .join("\n\n");

  const embed = {
    title: `💰 Owed Report - ${formatted}`,
    description: report,
    color: 0xffc107,
    timestamp: now.toISOString(),
  };

  sendDiscordMessage(webhookUrl, embed);

  const countCell = logSheet.getRange("B1");
  let count = Number(countCell.getValue()) || 0;
  if (count >= 5) {
    logSheet.getRange("2:3").clearContent();
    count = 0;
  }

  const col = 1 + count * 5;
  logSheet.getRange(2, col).setValue(formatted);
  logSheet
    .getRange(3, col)
    .setValue(`💰 Owed Report - ${formatted}\n${report}`);
  countCell.setValue(count + 1);
}

function sendBillingRecordsCSVEmail(fileId) {
  if (!fileId) {
    throw new Error("Billing CSV file ID is required.");
  }

  const file = DriveApp.getFileById(fileId);
  const emailTo = getNotificationEmail();

  if (!emailTo) {
    throw new Error("No notification email configured.");
  }

  const now = new Date();
  const formatted = formatDateSafe(now, "MMMM dd, yyyy HH:mm:ss");

  MailApp.sendEmail({
    to: emailTo,
    subject: `Billing Records Export - ${file.getName()}`,
    htmlBody: `
      <p>Hey 👋,</p>

      <p>Your <b>Billing Records</b> data export is ready.</p>

      <p>
        <a href="${file.getUrl()}">
          📄 View Billing Records CSV
        </a>
      </p>

      <p>Generated on ${formatted}</p>
    `,
  });

  logResponse("✅ Billing Records CSV emailed.");
}

function sendBillingRecordsCSVDiscord(fileId) {
  if (!fileId) {
    throw new Error("Billing CSV file ID is required.");
  }

  const file = DriveApp.getFileById(fileId);
  const webhookUrl = getDiscordWebhook();

  if (!webhookUrl) {
    throw new Error("No Discord webhook configured.");
  }

  const now = new Date();
  const formatted = formatDateSafe(now, "MMMM dd, yyyy HH:mm:ss");

  const embed = {
    title: `📊 Billing Records Export - ${formatted}`,
    description: `**Billing Records CSV:**\n${file.getUrl()}`,
    color: 0x3498db,
    timestamp: now.toISOString(),
  };

  sendDiscordMessage(webhookUrl, embed);

  logResponse("✅ Billing Records CSV sent to Discord.");
}

function getReportById(reportId) {
  const report = getReportLogs().find((r) => r.id === reportId);

  if (!report) {
    throw new Error("Report not found.");
  }

  return report;
}

function checkExistingReport(type, reportName) {
  const report = getReportLogs().find((log) => {
    if (log.type !== (type === "monthly" ? "Monthly" : "Yearly")) {
      return false;
    }

    return normalizeText(log.name) === normalizeText(reportName);
  });

  return {
    exists: !!report,
    report: report || null,
  };
}

function getFirstAvailableReportMonth() {
  const sheet = getSheetSafe("Monthly Hours Log");

  if (!sheet) {
    throw new Error('Sheet "Monthly Hours Log" not found.');
  }

  const lastColumn = sheet.getLastColumn();

  if (lastColumn < 13) {
    throw new Error("No available months found in Monthly Hours Log.");
  }

  const headers = sheet
    .getRange(1, 13, 1, lastColumn - 12)
    .getDisplayValues()[0];

  const firstMonthText = headers.find((value) => value);

  if (!firstMonthText) {
    throw new Error("No available months found in Monthly Hours Log.");
  }

  const firstDate = new Date(`1 ${firstMonthText}`);

  if (isNaN(firstDate)) {
    throw new Error(
      `Invalid first month found in Monthly Hours Log: ${firstMonthText}`,
    );
  }

  firstDate.setDate(1);

  return firstDate;
}

function validateCustomMonthlyReport(month, year) {
  const firstDate = getFirstAvailableReportMonth();

  const selectedDate = new Date(`1 ${month} ${year}`);

  if (isNaN(selectedDate)) {
    return {
      valid: false,
      message: "Invalid month or year.",
    };
  }

  selectedDate.setDate(1);

  const today = new Date();
  const currentDate = new Date(today.getFullYear(), today.getMonth(), 1);

  if (selectedDate < firstDate) {
    return {
      valid: false,
      message:
        `Reports are only available starting from ` +
        `${formatDateSafe(firstDate, "MMMM yyyy")}.`,
    };
  }

  if (selectedDate > currentDate) {
    return {
      valid: false,
      message: "You cannot generate a report for a future month.",
    };
  }

  return {
    valid: true,
  };
}

function validateCustomYearlyReport(year) {
  const firstDate = getFirstAvailableReportMonth();

  const firstYear = firstDate.getFullYear();
  const selectedYear = Number(year);
  const currentYear = new Date().getFullYear();

  if (!Number.isFinite(selectedYear)) {
    return {
      valid: false,
      message: "Invalid year.",
    };
  }

  if (selectedYear < firstYear) {
    return {
      valid: false,
      message: `Reports are only available starting from ${firstYear}.`,
    };
  }

  if (selectedYear > currentYear) {
    return {
      valid: false,
      message: "You cannot generate a report for a future year.",
    };
  }

  return {
    valid: true,
  };
}

function getReportLogs() {
  const sources = [
    {
      sheet: "MonthlyReport_Log",
      type: "Monthly",
      format: "report",
    },
    {
      sheet: "YearlyReport_Log",
      type: "Yearly",
      format: "report",
    },
    {
      sheet: "BillingRecordsExport_Log",
      type: "Data Export",
      format: "billingExport",
    },
  ];

  const logs = [];

  sources.forEach(({ sheet: sheetName, type, format }) => {
    const sheet = getSheetSafe(sheetName);

    if (!sheet) return;

    const lastRow = sheet.getLastRow();

    if (lastRow <= 1) return;

    if (format === "billingExport") {
      const values = sheet.getRange(2, 1, lastRow - 1, 7).getDisplayValues();

      values.forEach(
        ([
          date,
          startDate,
          endDate,
          recordCount,
          fileName,
          fileUrl,
          fileId,
        ]) => {
          if (!date || !fileUrl || !fileId) return;

          let name = fileName
            ? String(fileName)
                .replace(/\.csv$/i, "")
                .replace(/_/g, " ")
            : "";

          if (!name && startDate && endDate) {
            name = `Billing Records ${startDate} to ${endDate}`;
          }

          logs.push({
            date,
            id: fileId,
            name,
            link: fileUrl,
            type,
            recordCount,
          });
        },
      );

      return;
    }

    const values = sheet.getRange(2, 1, lastRow - 1, 4).getDisplayValues();

    values.forEach(([date, id, name, link]) => {
      if (!date || !id || !link) return;

      logs.push({
        date,
        id,
        name,
        link,
        type,
      });
    });
  });

  logs.sort((a, b) => new Date(b.date) - new Date(a.date));

  return logs;
}

function getMonthlyReportHistory() {
  return {
    reportLogs: getReportLogs().filter((report) => report.type === "Monthly"),
  };
}

function getYearlyReportHistory() {
  return {
    reportLogs: getReportLogs().filter((report) => report.type === "Yearly"),
  };
}

function getReportsOverview() {
  const recentLogs = getReportLogs();

  const lab = getLabSheet();

  const getLabValue = (cell, fallback = null) => {
    if (!lab) return fallback;

    const value = lab.getRange(cell).getValue();

    return value === "" || value === null ? fallback : value;
  };

  const monthlyCount = Number(getLabValue("AX30", 0)) || 0;
  const yearlyCount = Number(getLabValue("AY30", 0)) || 0;
  const pdfGenerated = Number(getLabValue("AZ30", 0)) || 0;

  let driveStorage = false;

  try {
    const folder = getReportFolder();
    folder.getName();
    driveStorage = true;
  } catch (err) {
    driveStorage = false;
  }

  const discord = Boolean(getDiscordWebhook());
  const email = Boolean(getNotificationEmail());

  const automationActive = driveStorage && discord && email;

  const today = new Date();

  const nextMonthly = new Date(today.getFullYear(), today.getMonth(), 15);

  if (today.getDate() >= 15) {
    nextMonthly.setMonth(nextMonthly.getMonth() + 1);
  }

  return {
    logs: recentLogs,

    counts: {
      monthly: monthlyCount,
      yearly: yearlyCount,
      pdfGenerated,
      automation: automationActive,
    },

    discord,
    email,
    driveStorage,

    nextScheduled: Utilities.formatDate(
      nextMonthly,
      Session.getScriptTimeZone(),
      "MMMM dd, yyyy",
    ),
  };
}

function getBillingRecordsForExport(startDate, endDate) {
  requireAuthorizedUser();

  const sheet =
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Billing Records");

  if (!sheet) {
    throw new Error('Sheet "Billing Records" was not found.');
  }

  const values = sheet.getDataRange().getValues();

  if (values.length <= 1) {
    return [];
  }

  const start = startDate ? new Date(`${startDate}T00:00:00`) : null;

  const end = endDate ? new Date(`${endDate}T23:59:59`) : null;

  return values
    .slice(1)
    .filter((row) => {
      const date = row[4];

      if (!(date instanceof Date)) {
        return false;
      }

      if (start && date < start) {
        return false;
      }

      if (end && date > end) {
        return false;
      }

      return true;
    })
    .map((row) => ({
      client: row[0] ?? "",
      type: row[1] ?? "",
      project: row[2] ?? "",
      hours: row[3] ?? 0,
      date: Utilities.formatDate(
        row[4],
        Session.getScriptTimeZone(),
        "yyyy-MM-dd",
      ),
      paymentStatus: row[5] ?? "",
      sourceSheet: row[6] ?? "",
      sourceRow: row[7] ?? "",
    }));
}

function saveBillingRecordsCSV(startDate, endDate) {
  requireAuthorizedUser();

  if (!startDate || !endDate) {
    throw new Error("A start date and end date are required.");
  }

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T23:59:59`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Invalid date range.");
  }

  if (start > end) {
    throw new Error("The start date cannot be later than the end date.");
  }

  const records = getBillingRecordsForExport(startDate, endDate);

  if (!records.length) {
    throw new Error(
      "No Billing Records were found for the selected date range.",
    );
  }

  const folder = getReportFolder();

  const headers = [
    "Client",
    "Type",
    "Project",
    "Hours",
    "Date",
    "Payment Status",
  ];

  const rows = records.map((record) => [
    record.client ?? "",
    record.type ?? "",
    record.project ?? "",
    record.hours ?? 0,
    record.date ?? "",
    record.paymentStatus ?? "",
  ]);

  const csvRows = [headers, ...rows];

  const csvContent = csvRows
    .map((row) =>
      row
        .map((value) => {
          const text = String(value ?? "");

          return `"${text.replace(/"/g, '""')}"`;
        })
        .join(","),
    )
    .join("\r\n");

  const fileName = `Billing Records_${startDate}_to_${endDate}.csv`;

  const blob = Utilities.newBlob(csvContent, "text/csv", fileName);

  const file = folder.createFile(blob);

  logBillingRecordsCSV({
    file,
    startDate,
    endDate,
    recordCount: records.length,
  });

  return {
    success: true,
    url: file.getUrl(),
    fileId: file.getId(),
    name: file.getName(),
    startDate,
    endDate,
    recordCount: records.length,
  };
}

function logBillingRecordsCSV({ file, startDate, endDate, recordCount }) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let sheet = ss.getSheetByName("BillingRecordsExport_Log");

  if (!sheet) {
    sheet = ss.insertSheet("BillingRecordsExport_Log");

    sheet.appendRow([
      "Date",
      "Start Date",
      "End Date",
      "Record Count",
      "File Name",
      "File URL",
      "File ID",
    ]);
  }

  sheet.appendRow([
    new Date(),
    startDate,
    endDate,
    recordCount,
    file.getName(),
    file.getUrl(),
    file.getId(),
  ]);
}

function getBillingRecordsCSVExportCount() {
  requireAuthorizedUser();

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(
    "BillingRecordsExport_Log",
  );

  if (!sheet) {
    return 0;
  }

  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    return 0;
  }

  return lastRow - 1;
}