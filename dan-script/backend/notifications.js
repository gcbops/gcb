function dailyNotification() {
  const day = new Date().getDay();

  if (day >= 1 && day <= 5) {
    logNotification();
    sendDailyReport();
  }
}

function monthlyNotification() {
  const today = new Date();
  const tomorrow = new Date(today);

  tomorrow.setDate(today.getDate() + 1);

  if (tomorrow.getDate() !== 1) {
    return;
  }

  try {
    saveMonthlyReportPDF();
    sendMonthlyReport();
  } catch (err) {
    logResponse(err);
  }
}

function yearlyNotification() {
  const today = new Date();
  const tomorrow = new Date(today);

  tomorrow.setDate(today.getDate() + 1);

  const isLastDayOfYear = tomorrow.getMonth() === 0 && tomorrow.getDate() === 1;

  if (!isLastDayOfYear) {
    return;
  }

  try {
    saveYearlyReportPDF();
    sendYearlyReport();
  } catch (err) {
    logResponse(err);
  }
}

function logNotification() {
  const notifSheet = getSheetSafe("DailyNotifications_Log");
  const labSheet = getLabSheet();

  if (!notifSheet || !labSheet) {
    return;
  }

  const timestamp = formatDateSafe(new Date(), "MM-dd HH:mm");

  const content = labSheet.getRange("AX25").getValue();

  const countCell = notifSheet.getRange("B1");
  let count = Number(countCell.getValue()) || 0;

  if (count >= 5) {
    notifSheet.getRange("2:3").clearContent();
    count = 0;
  }

  const col = 1 + count * 5;

  notifSheet.getRange(2, col).setValue(`Members update report ${timestamp}`);

  notifSheet.getRange(3, col).setValue(content);

  countCell.setValue(count + 1);
}

function getDiscordWebhook() {
  const sheet = getLabSheet();

  if (!sheet) {
    return "";
  }

  const webhook = sheet.getRange("BF3").getValue();

  return webhook ? String(webhook).trim() : "";
}

function getNotificationEmail() {
  const sheet = getLabSheet();

  if (!sheet) {
    return "";
  }

  const email = sheet.getRange("BF5").getValue();

  return email ? String(email).trim() : "";
}

function sendDailyReport() {
  const sheet = getLabSheet();

  if (!sheet) {
    return;
  }

  const webhookUrl = getDiscordWebhook();

  if (!webhookUrl) {
    console.warn("⚠️ No Discord webhook found in BF3. Daily report not sent.");
    return;
  }

  const toCheck = sheet.getRange("AX4:AX17").getValues().flat().filter(String);

  const prospectNames = sheet.getRange("AY4:AY17").getValues().flat();

  const prospectDetails = sheet.getRange("AZ4:AZ17").getValues().flat();

  const prospect = prospectNames
    .map((name, index) => {
      if (!name) {
        return "";
      }

      const detail = prospectDetails[index];

      return detail ? `${name} | ${detail}` : name;
    })
    .filter(Boolean);

  const now = new Date();

  const formatted = formatDateSafe(now, "MMMM dd, yyyy HH:mm:ss");

  const embed = {
    title: `⭐ Daily Report - ${formatted}`,

    description:
      `**To Check (${toCheck.length})**\n` +
      `${toCheck.map((name) => `- ${name}`).join("\n")}` +
      `\n\n` +
      `**Prospect (${prospect.length})**\n` +
      `${prospect.map((name) => `- ${name}`).join("\n")}`,

    color: 0x00ff00,

    timestamp: now.toISOString(),
  };

  sendDiscordMessage(webhookUrl, embed);
}

function sendDiscordMessage(webhookUrl, embed, retries = 2) {
  const payload = JSON.stringify({ embeds: [embed] });

  const options = {
    method: "post",
    contentType: "application/json",
    payload,
    muteHttpExceptions: true,
  };

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = UrlFetchApp.fetch(webhookUrl, options);
      const status = response.getResponseCode();

      if (status === 200 || status === 204) {
        return true;
      }

      if (attempt === retries) {
        logResponse(
          `❌ Discord returned HTTP ${status}: ${response.getContentText()}`,
        );
      }
    } catch (err) {
      if (attempt === retries) {
        logResponse(`❌ sendDiscordMessage failed: ${err.message}`);
      }
    }

    if (attempt < retries) {
      Utilities.sleep(500);
    }
  }

  return false;
}

function sendEmailReport(report) {
  const emailTo = getNotificationEmail();

  if (!emailTo) {
    throw new Error("No notification email configured.");
  }

  const formatted = formatDateSafe(new Date(), "MMMM dd, yyyy HH:mm:ss");

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
    `,
  });

  return true;
}

function sendDiscordReport(report) {
  const webhookUrl = getDiscordWebhook();

  if (!webhookUrl) {
    throw new Error("No Discord webhook configured.");
  }

  const embed = {
    title: `📄 ${report.type} Report`,

    description:
      `A **${normalizeText(report.type)}** report is available.\n\n` +
      `**Report:** ${report.name}\n` +
      `**ID:** ${report.id}\n\n` +
      `${report.link}`,

    color: report.type === "Monthly" ? 0x3498db : 0x2ecc71,

    timestamp: new Date().toISOString(),
  };

  const sent = sendDiscordMessage(webhookUrl, embed);

  if (!sent) {
    throw new Error("Failed sending Discord notification.");
  }

  return true;
}

function emailLatestReport(report) {
  return sendEmailReport(report);
}

function sendRequestedEmailReport(reportId) {
  const report = getReportById(reportId);
  return sendEmailReport(report);
}

function sendLatestReportToDiscord(report) {
  return sendDiscordReport(report);
}

function sendRequestedDiscordReport(reportId) {
  const report = getReportById(reportId);
  return sendDiscordReport(report);
}

