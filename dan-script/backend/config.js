const PAID_OWED_DIALOG = {
  sheet: "Paid & Owed Log",
  range: "J2:M",
  headers: ["Client", "Paid", "Owed", "Status"],
};

const CONFIG = {
  get SPREADSHEET_ID() {
    const value =
      PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");

    if (!value) {
      throw new Error("SPREADSHEET_ID is not configured.");
    }

    return value;
  },

  HTML: {
    PATHS: [
      "",
      "frontend/",
      "frontend/components/",
      "frontend/js/",
      "frontend/css/",
      "frontend/old/",
      "backend/",
    ],
  },

  SHEETS: {
    EXCLUDED: new Set([
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
    ]),
  },

  DIALOGS: {
    STATUS: {
      "Outstanding Accounts": {
        ...PAID_OWED_DIALOG,
        title: "Outstanding Accounts",
      },

      "Active Clients": {
        ...PAID_OWED_DIALOG,
        title: "Active Clients",
      },

      "Top Paid": {
        ...PAID_OWED_DIALOG,
        title: "Top Paid Accounts",
      },

      "Activity Today": {
        sheet: "Client Tracker - Today",
        range: "B2:G",
        title: "Activity Today",
        headers: [
          "Client",
          "Status",
          "Member",
          "Work Hour",
          "Charged Hour",
          "Report Stat",
        ],
      },
    },
  },
};
