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
      "frontend/pages/",
      "frontend/js/",
      "frontend/css/",
      "frontend/old/",
      "backend/",
    ],
  },

  DIALOGS: {
    STATUS: {
      "Outstanding Accounts": {
        ...PAID_OWED_DIALOG,
        title: "Outstanding Accounts",
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
