const SCHEDULED_TRIGGERS = {
  dailyNotification: {
    functionName: "dailyNotification",

    required: () => Boolean(getDiscordWebhook()),

    create: () => {
      ScriptApp.newTrigger("dailyNotification")
        .timeBased()
        .everyDays(1)
        .atHour(18)
        .create();
    },
  },

  monthlyNotification: {
    functionName: "monthlyNotification",

    required: () => Boolean(getDiscordWebhook() || getNotificationEmail()),

    create: () => {
      ScriptApp.newTrigger("monthlyNotification")
        .timeBased()
        .everyDays(1)
        .atHour(18)
        .create();
    },
  },

  sendOwedReport: {
    functionName: "sendOwedReport",

    required: () => Boolean(getDiscordWebhook()),

    create: () => {
      ScriptApp.newTrigger("sendOwedReport")
        .timeBased()
        .everyDays(1)
        .atHour(9)
        .create();
    },
  },

  yearlyNotification: {
    functionName: "yearlyNotification",

    required: () => Boolean(getDiscordWebhook() || getNotificationEmail()),

    create: () => {
      ScriptApp.newTrigger("yearlyNotification")
        .timeBased()
        .everyDays(1)
        .atHour(8)
        .create();
    },
  },

  cleanupOldReports: {
    functionName: "cleanupOldReports",

    required: () => true,

    create: () => {
      ScriptApp.newTrigger("cleanupOldReports")
        .timeBased()
        .everyDays(1)
        .atHour(11)
        .create();
    },
  },

  scheduledBackup: {
    functionName: "scheduledBackup",

    required: () => {
      const properties = PropertiesService.getScriptProperties();

      return Boolean(
        properties.getProperty("MANAGER_REGISTRY_SPREADSHEET_ID") &&
        properties.getProperty("ADMIN_COMBINED_BACKUP_FOLDER_ID"),
      );
    },

    create: () => {
      ScriptApp.newTrigger("scheduledBackup")
        .timeBased()
        .everyDays(1)
        .atHour(11)
        .create();
    },
  },

  reorderActiveClientSheets: {
    functionName: "reorderActiveClientSheets",

    required: () => {
      return Boolean(
        PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID"),
      );
    },

    create: () => {
      ScriptApp.newTrigger("reorderActiveClientSheets")
        .timeBased()
        .everyWeeks(1)
        .onWeekDay(ScriptApp.WeekDay.SUNDAY)
        .atHour(3)
        .create();
    },
  },
};

function getTrigger(functionName) {
  return ScriptApp.getProjectTriggers().find(
    (trigger) => trigger.getHandlerFunction() === functionName,
  );
}

function triggerExists(functionName) {
  return Boolean(getTrigger(functionName));
}

function reconcileScheduledTriggersInternal() {
  const results = [];

  for (const [name, config] of Object.entries(SCHEDULED_TRIGGERS)) {
    let required;

    try {
      required = Boolean(config.required());
    } catch (error) {
      console.error(
        `[Triggers] Requirement check failed for "${name}":`,
        error,
      );

      results.push({
        name,
        action: "error",
        message: "Requirement check failed; existing triggers were preserved.",
        error: String(error?.message || error).slice(0, 300),
      });

      // Do not delete a trigger when its requirement is unknown.
      continue;
    }

    try {
      const triggers = ScriptApp.getProjectTriggers().filter(
        (trigger) => trigger.getHandlerFunction() === config.functionName,
      );

      if (required) {
        if (triggers.length === 0) {
          config.create();

          results.push({
            name,
            action: "created",
          });

          continue;
        }

        if (triggers.length > 1) {
          triggers.slice(1).forEach((trigger) => {
            ScriptApp.deleteTrigger(trigger);
          });

          results.push({
            name,
            action: "duplicates removed",
            removed: triggers.length - 1,
          });

          continue;
        }

        results.push({
          name,
          action: "unchanged",
        });

        continue;
      }

      if (triggers.length > 0) {
        triggers.forEach((trigger) => {
          ScriptApp.deleteTrigger(trigger);
        });

        results.push({
          name,
          action: "deleted",
          removed: triggers.length,
        });

        continue;
      }

      results.push({
        name,
        action: "inactive",
      });
    } catch (error) {
      console.error(`[Triggers] Reconciliation failed for "${name}":`, error);

      results.push({
        name,
        action: "error",
        error: String(error?.message || error).slice(0, 300),
      });
    }
  }

  return results;
}

