const CONFIG = {
  SPREADSHEET_ID: "1_Xh5jVAUMO6xMRrDD_kKSa7Vggxv9ntR0_uDCvt1HmY",

  EXCLUDED_SHEETS: new Set([
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
};

const DIALOG_STATUS_CONFIG = {
  "Outstanding Accounts": {
    range: "J2:M",
    header: "Outstanding Accounts",
    headers: ["Client", "Paid", "Owed", "Status"],
    sheet: "Paid & Owed Log",
  },

  "Active Clients": {
    range: "J2:M",
    header: "Active Clients",
    headers: ["Client", "Paid", "Owed", "Status"],
    sheet: "Paid & Owed Log",
  },

  "Top Paid": {
    range: "J2:M",
    header: "Top Paid Accounts",
    headers: ["Client", "Paid", "Owed", "Status"],
    sheet: "Paid & Owed Log",
  },

  "Activity Today": {
    range: "B2:G",
    header: "Activity Today",
    headers: [
      "Client",
      "Status",
      "Member",
      "Work Hour",
      "Charged Hour",
      "Report Stat",
    ],
    sheet: "Client Tracker - Today",
  },
};
