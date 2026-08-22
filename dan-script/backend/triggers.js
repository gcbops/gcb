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
      return Boolean(
        PropertiesService.getScriptProperties().getProperty(
          "MAIN_SHEETS_FOLDER_ID",
        ) &&
        PropertiesService.getScriptProperties().getProperty("BACKUP_FOLDER_ID"),
      );
    },

    create: () => {
      ScriptApp.newTrigger("scheduledBackup")
        .timeBased()
        .everyMonths(3)
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

function createScheduledTrigger(name) {
  const config = SCHEDULED_TRIGGERS[name];

  if (!config) {
    throw new Error(`Unknown scheduled trigger: ${name}`);
  }

  if (triggerExists(config.functionName)) {
    return false;
  }

  config.create();

  return true;
}

function deleteScheduledTrigger(name) {
  const config = SCHEDULED_TRIGGERS[name];

  if (!config) {
    throw new Error(`Unknown scheduled trigger: ${name}`);
  }

  const triggers = ScriptApp.getProjectTriggers().filter(
    (trigger) => trigger.getHandlerFunction() === config.functionName,
  );

  triggers.forEach((trigger) => {
    ScriptApp.deleteTrigger(trigger);
  });

  return triggers.length > 0;
}

function reconcileScheduledTriggers() {
  const results = [];

  for (const [name, config] of Object.entries(SCHEDULED_TRIGGERS)) {
    let required = false;

    try {
      required = Boolean(config.required());
    } catch (err) {
      console.error(`Trigger requirement check failed: ${name}`, err);

      required = false;
    }

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
      });

      continue;
    }

    results.push({
      name,
      action: "inactive",
    });
  }

  return results;
}

