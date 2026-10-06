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

function getReportFolder() {
  const folderId =
    PropertiesService.getScriptProperties().getProperty("REPORT_FOLDER_ID");

  if (!folderId) {
    throw new Error("REPORT_FOLDER_ID is not configured.");
  }

  return DriveApp.getFolderById(folderId);
}

function saveReportPDF(config) {
  Validation.requireObject(config, "Report configuration");

  const reportType = String(config.reportType || "")
    .trim()
    .toLowerCase();

  Validation.enumValue(reportType, "report type", ["monthly", "yearly"]);

  const reportSheet = Validation.requiredString(
    config.reportSheet,
    "Report sheet",
    { maxLength: 100 },
  );

  const logSheet = Validation.requiredString(
    config.logSheet,
    "Report log sheet",
    { maxLength: 100 },
  );

  const latestLinkCell = config.latestLinkCell
    ? Validation.requiredString(config.latestLinkCell, "Latest link cell", {
        maxLength: 20,
        rejectFormula: false,
      })
    : "";

  const ss = getSpreadsheet();
  const sheet = getSheetSafe(reportSheet);

  if (!sheet) {
    throw new Error(`Report sheet "${reportSheet}" not found.`);
  }

  const folder = getReportFolder();

  const reportNum = sheet.getRange("G1").getValue();
  const reportName = sheet.getRange("B1").getValue();
  const pdfName = `${reportType}Report_${reportNum}_${reportName}.pdf`;

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

    getSheetSafe(logSheet)?.appendRow([
      new Date(),
      reportNum,
      reportName,
      fileUrl,
    ]);

    if (latestLinkCell) {
      getLabSheet()?.getRange(latestLinkCell).setValue(fileUrl);
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
  requireCapability(sessionId, signature, "reports.generate");

  SpreadsheetApp.flush();
  Utilities.sleep(5000);
  SpreadsheetApp.flush();

  const configs = {
    monthly: {
      reportType: "monthly",
      reportSheet: "Monthly Report PDF Generator",
      logSheet: "MonthlyReport_Log",
      latestLinkCell: "AZ27",
    },
    yearly: {
      reportType: "yearly",
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
  requireCapability(sessionId, signature, "reports.generate");

  const reportType = Validation.enumValue(type, "report type", [
    "monthly",
    "yearly",
  ]);

  const reportYear = Validation.number(year, "Report year", {
    min: 2024,
    max: new Date().getFullYear(),
  });

  const settings = getSheetSafe("Settings");

  if (!settings) {
    throw new Error('Sheet "Settings" not found.');
  }

  if (reportType === "monthly") {
    const reportMonth = Validation.requiredString(month, "Report month", {
      maxLength: 20,
    });

    settings.getRange("A3").setValue(reportMonth);
    settings.getRange("A5").setValue(reportYear);
  } else {
    settings.getRange("A11").setValue(reportYear);
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

function getReportById(reportId) {
  requireCapability(sessionId, signature, "reports.view");

  const report = getReportLogs().find((r) => r.id === reportId);

  if (!report) {
    throw new Error("Report not found.");
  }

  return report;
}

function checkExistingReport(type, reportName) {
  requireCapability(sessionId, signature, "reports.view");

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
  requireCapability(sessionId, signature, "reports.view");

  return {
    reportLogs: getReportLogs().filter((report) => report.type === "Monthly"),
  };
}

function getYearlyReportHistory() {
  requireCapability(sessionId, signature, "reports.view");

  return {
    reportLogs: getReportLogs().filter((report) => report.type === "Yearly"),
  };
}

function getReportsOverview() {
  requireCapability(sessionId, signature, "reports.view");

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

