function getScheduledReportResultList_(generationResult) {
  if (Array.isArray(generationResult)) {
    return generationResult;
  }

  if (Array.isArray(generationResult?.results)) {
    return generationResult.results;
  }

  if (Array.isArray(generationResult?.managerResults)) {
    return generationResult.managerResults;
  }

  throw new Error(
    "Scheduled report generation did not return per-manager results.",
  );
}

function requireSuccessfulManagerReport_(results, managerId) {
  const result = results.find(
    (item) => String(item?.managerId || "") === String(managerId),
  );

  if (!result) {
    throw new Error(
      `No scheduled report generation result found for manager ${managerId}.`,
    );
  }

  if (result.success !== true || result.error || !result.reportUrl) {
    throw new Error(
      `Report generation was unsuccessful for manager ${managerId}.`,
    );
  }

  return result;
}

function monthlyNotification() {
  const today = new Date();

  // Run only on the first day of the month.
  if (today.getDate() !== 1) return;

  return runGcbLoggedOperation_(
    {
      category: "REPORT",
      operation: "MONTHLY_REPORT_WORKFLOW",
      trigger: "SCHEDULED",
      target: "Monthly",
      successMessage: "Monthly report workflow completed.",
      failureMessage: "Monthly report workflow failed.",
    },
    () => {
      const generationResult = saveMonthlyReportPDF();
      const generationResults = getScheduledReportResultList_(generationResult);

      const notifications = runForEachEnabledManagerNotification_(
        (manager, workspace) => {
          requireSuccessfulManagerReport_(generationResults, manager.managerId);

          const managerReport = generationResults.find(
            (result) => result.managerId === manager.managerId,
          );

          return sendReport(
            {
              type: "Monthly",
              reportType: "Monthly",
            },
            workspace,
            {
              trigger: "SCHEDULED",
              reportUrl: managerReport.reportUrl,
            },
          );
        },
      );

      logResponse("Monthly scheduled report workflow completed.");

      return { generationResult, notifications };
    },
  );
}

function yearlyNotification() {
  const today = new Date();
  const tomorrow = new Date(today);

  tomorrow.setDate(today.getDate() + 1);

  const isLastDayOfYear = tomorrow.getMonth() === 0 && tomorrow.getDate() === 1;

  if (!isLastDayOfYear) return;

  return runGcbLoggedOperation_(
    {
      category: "REPORT",
      operation: "YEARLY_REPORT_WORKFLOW",
      trigger: "SCHEDULED",
      target: "Yearly",
      successMessage: "Yearly report workflow completed.",
      failureMessage: "Yearly report workflow failed.",
    },
    () => {
      const generationResult = saveYearlyReportPDF();
      const generationResults = getScheduledReportResultList_(generationResult);

      const notifications = runForEachEnabledManagerNotification_(
        (manager, workspace) => {
          requireSuccessfulManagerReport_(generationResults, manager.managerId);

          const managerReport = generationResults.find(
            (result) => result.managerId === manager.managerId,
          );

          return sendReport(
            {
              type: "Yearly",
              reportType: "Yearly",
            },
            workspace,
            {
              trigger: "SCHEDULED",
              reportUrl: managerReport.reportUrl,
            },
          );
        },
      );

      logResponse("Yearly scheduled report workflow completed.");

      return { generationResult, notifications };
    },
  );
}

function dailyNotification() {
  const day = new Date().getDay();

  if (day < 1 || day > 5) return;

  return runGcbLoggedOperation_(
    {
      category: "NOTIFICATION",
      operation: "DAILY_NOTIFICATION_WORKFLOW",
      trigger: "SCHEDULED",
      successMessage: "Daily notification workflow completed.",
      failureMessage: "Daily notification workflow failed.",
    },
    () =>
      runForEachEnabledManagerNotification_((manager, workspace) => {
        if (!getDiscordWebhook(workspace)) {
          return {
            skipped: true,
            reason:
              `Daily Discord notification skipped for manager ` +
              `${manager.managerId}: no Discord webhook configured.`,
          };
        }

        logNotification(workspace);
        return sendDailyReport(workspace);
      }),
  );
}

function logNotification(workspace) {
  if (!workspace?.spreadsheet) {
    throw new Error("A valid manager workspace is required.");
  }

  const ss = workspace.spreadsheet;
  const notifSheet = ss.getSheetByName("DailyNotifications_Log");
  const labSheet = ss.getSheetByName("Lab 3.0");

  if (!notifSheet || !labSheet) {
    throw new Error(
      `Manager ${workspace.managerId} is missing DailyNotifications_Log or Lab 3.0.`,
    );
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

function getDiscordWebhook(workspace) {
  const webhookUrl = String(workspace?.discordWebhookUrl || "").trim();

  return webhookUrl;
}

function getNotificationEmail(workspace) {
  const email = String(workspace?.email || "").trim();

  return email;
}

function sendDailyReport(workspace) {
  if (!workspace?.spreadsheet || !workspace?.managerId) {
    throw new Error("A valid manager workspace is required.");
  }

  const sheet = workspace.spreadsheet.getSheetByName("Lab 3.0");

  if (!sheet) {
    throw new Error(
      `Manager ${workspace.managerId} is missing the "Lab 3.0" sheet.`,
    );
  }

  const webhookUrl = getDiscordWebhook(workspace);

  if (!webhookUrl) {
    throw new Error(
      `No Discord webhook configured for manager ${workspace.managerId}.`,
    );
  }

  const toCheck = sheet.getRange("AX4:AX17").getValues().flat().filter(String);

  const prospectNames = sheet.getRange("AY4:AY17").getValues().flat();

  const prospectDetails = sheet.getRange("AZ4:AZ17").getValues().flat();

  const prospect = prospectNames
    .map((name, index) => {
      if (!name) return "";

      const detail = prospectDetails[index];

      return detail ? `${name} | ${detail}` : name;
    })
    .filter(Boolean);

  const now = new Date();
  const formatted = formatDateSafe(now, "MMMM dd, yyyy HH:mm:ss");

  const embed = {
    title: `Daily Report - ${formatted}`,
    description:
      `**To Check (${toCheck.length})**\n` +
      `${toCheck.map((name) => `- ${name}`).join("\n")}\n\n` +
      `**Prospect (${prospect.length})**\n` +
      `${prospect.map((name) => `- ${name}`).join("\n")}`,
    color: 0x00ff00,
    timestamp: now.toISOString(),
  };

  const sent = sendDiscordMessage(webhookUrl, embed);

  const startedAt = Date.now();
  const completedAt = Date.now();

  recordGcbOperationLog_({
    timestamp: new Date(completedAt),
    startedAt,
    completedAt,
    requestId: "",
    managerId: workspace.managerId,
    category: "DISCORD",
    operation: "SEND_DAILY_REPORT",
    status: sent ? "SUCCESS" : "FAILED",
    trigger: "SCHEDULED",
    durationMs: Math.max(0, completedAt - startedAt),
    processed: 1,
    succeeded: sent ? 1 : 0,
    failed: sent ? 0 : 1,
    target: `${workspace.managerId}: Daily report`,
    message: sent
      ? "Daily Discord report sent."
      : "Daily Discord report failed after retries.",
  });

  if (!sent) {
    throw new Error(
      `Daily Discord report failed for manager ${workspace.managerId}.`,
    );
  }

  return { success: true, managerId: workspace.managerId };
}

function sendDiscordMessage(webhookUrl, embed, retries = 2) {
  if (!webhookUrl || !embed) {
    throw new Error("A Discord webhook URL and embed are required.");
  }

  const MAX_DESCRIPTION_LENGTH = 3500;
  const description = String(embed.description || "");

  function splitDiscordDescription_(text, maxLength) {
    const content = String(text || "");

    if (!content) {
      return ["No report details available."];
    }

    const chunks = [];
    let current = "";

    function pushCurrent() {
      if (current) {
        chunks.push(current);
        current = "";
      }
    }

    function appendLongLine(line) {
      let remaining = line;

      while (remaining.length > maxLength) {
        let splitAt = remaining.lastIndexOf(" ", maxLength);

        if (splitAt <= 0) {
          splitAt = maxLength;
        }

        const piece = remaining.slice(0, splitAt).trimEnd();

        if (piece) {
          chunks.push(piece);
        }

        remaining = remaining.slice(splitAt).trimStart();
      }

      return remaining;
    }

    content.split("\n").forEach((line) => {
      if (line.length > maxLength) {
        pushCurrent();

        const remainder = appendLongLine(line);

        if (remainder) {
          current = remainder;
        }

        return;
      }

      const candidate = current ? `${current}\n${line}` : line;

      if (candidate.length > maxLength) {
        pushCurrent();
        current = line;
      } else {
        current = candidate;
      }
    });

    pushCurrent();

    return chunks.length ? chunks : ["No report details available."];
  }

  const chunks = splitDiscordDescription_(description, MAX_DESCRIPTION_LENGTH);

  const totalParts = chunks.length;
  const baseTitle = String(embed.title || "GCB Report");

  for (let index = 0; index < totalParts; index++) {
    const partEmbed = {
      ...embed,
      title:
        totalParts > 1
          ? `${baseTitle} (${index + 1}/${totalParts})`
          : baseTitle,
      description: chunks[index],
    };

    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ embeds: [partEmbed] }),
      muteHttpExceptions: true,
    };

    let sent = false;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = UrlFetchApp.fetch(webhookUrl, options);
        const status = response.getResponseCode();

        if (status === 200 || status === 204) {
          sent = true;
          break;
        }

        if (attempt === retries) {
          logResponse(
            `Discord message part ${index + 1}/${totalParts} failed. ` +
              `HTTP ${status}: ${response.getContentText()}`,
          );
        }
      } catch (error) {
        if (attempt === retries) {
          logResponse(
            `Discord message part ${index + 1}/${totalParts} failed: ` +
              `${String(error?.message || error)}`,
          );
        }
      }

      if (attempt < retries) {
        Utilities.sleep(500);
      }
    }

    if (!sent) {
      return false;
    }
  }

  return true;
}

function sendEmailReport(report, workspace, options = {}) {
  const startedAt = Date.now();
  const requestId = options.requestId || "";
  const managerId = workspace?.managerId || "";

  const emailTo = getNotificationEmail(workspace);

  if (!emailTo) {
    throw new Error("No notification email configured.");
  }

  const sentAt = new Date();
  const formatted = formatDateSafe(sentAt, "MMMM dd, yyyy HH:mm:ss");
  const subject = `${report.type} Report - ${report.name}`;

  try {
    MailApp.sendEmail({
      to: emailTo,
      subject,
      htmlBody: `
        <p>Your <b>${report.type}</b> report is ready.</p>

        <table cellpadding="6" cellspacing="0" border="0">
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

        <p><a href="${report.link}">View Report</a></p>
        <p>Sent on ${formatted}</p>
      `,
    });

    const completedAt = Date.now();

    recordGcbOperationLog_({
      timestamp: new Date(completedAt),
      startedAt,
      completedAt,
      requestId,
      managerId,
      category: "EMAIL",
      operation: "SEND_REPORT",
      status: "SUCCESS",
      trigger: options.trigger || "REPORT_WORKFLOW",
      durationMs: Math.max(0, completedAt - startedAt),
      processed: 1,
      succeeded: 1,
      failed: 0,
      target: `${report.type}: ${report.name}`,
      message: "Report email accepted by MailApp.",
    });

    return {
      success: true,
      channel: "email",
      recipient: emailTo,
      subject,
      reportId: String(report.id || ""),
      reportName: String(report.name || ""),
      reportType: String(report.type || ""),
      reportLink: String(report.link || ""),
      sentAt: sentAt.toISOString(),
      message: "Report email sent successfully.",
    };
  } catch (error) {
    const completedAt = Date.now();

    recordGcbOperationLog_({
      timestamp: new Date(completedAt),
      startedAt,
      completedAt,
      requestId,
      managerId,
      category: "EMAIL",
      operation: "SEND_REPORT",
      status: "FAILED",
      trigger: options.trigger || "REPORT_WORKFLOW",
      durationMs: Math.max(0, completedAt - startedAt),
      processed: 1,
      succeeded: 0,
      failed: 1,
      target: `${report.type}: ${report.name}`,
      message: "Report email sending failed.",
      error: String(error?.message || error).slice(0, 2000),
    });

    throw error;
  }
}

function sendDiscordReport(report, workspace, options = {}) {
  const startedAt = Date.now();
  const requestId = options.requestId || "";
  const managerId = workspace?.managerId || "";
  const webhookUrl = getDiscordWebhook(workspace);

  if (!webhookUrl) {
    throw new Error("No Discord webhook configured.");
  }

  const sentAt = new Date();

  const embed = {
    title: `${report.type} Report`,
    description:
      `A ${normalizeText(report.type)} report is available.\n\n` +
      `**Report:** ${report.name}\n` +
      `**ID:** ${report.id}\n\n` +
      `${report.link}`,
    color: report.type === "Monthly" ? 0x3498db : 0x2ecc71,
    timestamp: sentAt.toISOString(),
  };

  try {
    const sent = sendDiscordMessage(webhookUrl, embed);

    if (!sent) {
      throw new Error("Failed sending Discord notification.");
    }

    const completedAt = Date.now();

    recordGcbOperationLog_({
      timestamp: new Date(completedAt),
      startedAt,
      completedAt,
      requestId,
      managerId,
      category: "DISCORD",
      operation: "SEND_REPORT",
      status: "SUCCESS",
      trigger: options.trigger || "REPORT_WORKFLOW",
      durationMs: Math.max(0, completedAt - startedAt),
      processed: 1,
      succeeded: 1,
      failed: 0,
      target: `${report.type}: ${report.name}`,
      message: "Report notification sent to Discord.",
    });

    return {
      success: true,
      channel: "discord",
      destination: "Configured Discord webhook",
      reportId: String(report.id || ""),
      reportName: String(report.name || ""),
      reportType: String(report.type || ""),
      reportLink: String(report.link || ""),
      sentAt: sentAt.toISOString(),
      subject: embed.title,
      message: "Report notification sent to Discord successfully.",
    };
  } catch (error) {

    const completedAt = Date.now();

    recordGcbOperationLog_({
      timestamp: new Date(completedAt),
      startedAt,
      completedAt,
      requestId,
      managerId,
      category: "DISCORD",
      operation: "SEND_REPORT",
      status: "FAILED",
      trigger: options.trigger || "REPORT_WORKFLOW",
      durationMs: Math.max(0, completedAt - startedAt),
      processed: 1,
      succeeded: 0,
      failed: 1,
      target: `${report.type}: ${report.name}`,
      message: "Discord report notification failed.",
      error: String(error?.message || error).slice(0, 2000),
    });

    throw error;
  }
}

function emailLatestReport(sessionId, signature, report, requestId = "") {
  const { workspace } = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "reports.send",
  );

  return sendEmailReport(report, workspace, {
    requestId,
    trigger: "MANUAL",
  });
}

function sendRequestedEmailReport(
  sessionId,
  signature,
  reportId,
  requestId = "",
) {
  const { workspace } = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "reports.send",
  );

  const report = getReportByIdInternal(workspace.spreadsheet, reportId);

  return sendEmailReport(report, workspace, {
    requestId,
    trigger: "MANUAL",
  });
}

function sendLatestReportToDiscord(
  sessionId,
  signature,
  report,
  requestId = "",
) {
  const { workspace } = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "reports.send",
  );

  return sendDiscordReport(report, workspace, {
    requestId,
    trigger: "MANUAL",
  });
}

function sendRequestedDiscordReport(
  sessionId,
  signature,
  reportId,
  requestId = "",
) {
  const { workspace } = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "reports.send",
  );

  const report = getReportByIdInternal(workspace.spreadsheet, reportId);

  return sendDiscordReport(report, workspace, {
    requestId,
    trigger: "MANUAL",
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

  return runGcbLoggedOperation_(
    {
      category: "REPORT",
      operation: "OWED_REPORT_WORKFLOW",
      trigger: "SCHEDULED",
      target: "Owed Hours",
      successMessage: "Owed report workflow completed.",
      failureMessage: "Owed report workflow failed.",
    },
    () =>
      runForEachEnabledManagerNotification_((manager, workspace) => {
        const webhookUrl = getDiscordWebhook(workspace);

        if (!webhookUrl) {
          return {
            skipped: true,
            reason:
              `Owed-hours report skipped for manager ${manager.managerId}: ` +
              "no Discord webhook configured.",
          };
        }

        // KEEP the existing per-manager report-generation and logging code here.
      }),
  );
}
