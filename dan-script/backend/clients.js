function getClientSheetsList() {
  return getSpreadsheet()
    .getSheets()
    .map((sheet) => sheet.getName())
    .filter((name) => !CONFIG.SHEETS.EXCLUDED.has(name))
    .sort();
}

function getActiveClients() {
  const sheet = getSheetSafe("Client Names");

  if (!sheet) {
    return [];
  }

  return sheet.getRange("I2:I30").getValues().flat().filter(isNonEmptyString);
}

function getClientSheetsListAndActive() {
  return {
    sheets: getClientSheetsList(),
    activeClients: getActiveClients(),
  };
}

function syncClientSheetList() {
  // requireAuthorizedUser();

  const sheet = getSheetSafe("Client Names");

  if (!sheet) {
    logResponse('Missing "Client Names" sheet.');
    return [];
  }

  const names = getClientSheetsList();

  sheet.getRange("A2:A").clearContent();

  if (names.length) {
    sheet
      .getRange(2, 1, names.length, 1)
      .setValues(names.map((name) => [name]));
  }

  return names;
}

function getSheetByPartialName(partial) {
  const ss = getSpreadsheet();

  const normalizedPartial = normalizeText(partial);

  return (
    ss
      .getSheets()
      .find((sheet) =>
        normalizeText(sheet.getName()).includes(normalizedPartial),
      ) || null
  );
}

function getCellValueSafe(sheet, cellRange) {
  try {
    return sheet.getRange(cellRange).getValue();
  } catch (err) {
    logResponse(`Error reading ${cellRange}: ${err.message}`);

    return "";
  }
}

function getDirectCellValueSafe(sheetName, cellRange) {
  const sheet = getSheetSafe(sheetName);

  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found.`);
  }

  return sheet.getRange(cellRange).getValue();
}

function goToPresentClient(sheetName) {
  const ss = getSpreadsheet();
  const labSheet = getLabSheet();

  if (!labSheet) {
    return "⚠️ Lab sheet not found";
  }

  if (!sheetName) {
    sheetName = getLabCell("P24");

    if (!isNonEmptyString(sheetName)) {
      return "⚠️ No client name found in P24";
    }
  }

  const sheet = getSheetSafe(sheetName);

  if (!sheet) {
    return `⚠️ Sheet "${sheetName}" not found`;
  }

  return `${ss.getUrl()}#gid=${sheet.getSheetId()}`;
}

function getClientDataByStatus(status, customSheet) {
  const config = CONFIG.DIALOGS.STATUS[status];

  if (!config) {
    return [];
  }

  const sheet = getSheetSafe(customSheet || config.sheet);

  if (!sheet) {
    return [];
  }

  return sheet
    .getRange(config.range)
    .getValues()
    .filter((row) => row.some(Boolean));
}

function getActiveClientsPaidOwed() {
  try {
    const sheet = getSheetSafe("Paid & Owed Log");

    if (!sheet) {
      throw new Error('Sheet "Paid & Owed Log" was not found.');
    }

    const lastRow = sheet.getLastRow();

    if (lastRow < 2) {
      return [];
    }

    const values = sheet
      .getRange(2, 15, lastRow - 1, 5) // O:S
      .getValues();

    return values
      .filter((row) => row.some((value) => value !== ""))
      .map((row) => {
        const client = row[0] ?? "";
        return {
          client,
          totalOwed: Number(row[1]) || 0,
          currentMonthOwed: Number(row[2]) || 0,
          totalPaid: Number(row[3]) || 0,
          today: row[4] ?? "",
          paidOwedHistory: getClientPaidOwedDataHistory(client),
        };
      });
  } catch (err) {
    throw new Error(err.message || String(err));
  }
}

function getTopPaidClients() {
  const sheet = getSheetSafe("Paid & Owed Log");

  if (!sheet) {
    return [];
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  return sheet.getRange(2, 10, lastRow - 1, 4).getValues();
}

function getRoleFromSheet(name) {
  try {
    const sheet = getSheetSafe(name);

    if (!sheet) {
      return "";
    }

    return sheet.getRange("N17").getValue() || "";
  } catch (err) {
    return "";
  }
}

function getClientHourLogData(clientName) {
  const sheet = getSheetSafe(clientName);

  if (!sheet) {
    return [];
  }

  const values = sheet
    .getRange("E3:H")
    .getValues()
    .filter((row) => row.some(Boolean));

  const timezone = getSpreadsheet().getSpreadsheetTimeZone();

  return values.map((row) => {
    const date = row[3];

    row[3] =
      date instanceof Date
        ? Utilities.formatDate(date, timezone, "MM/dd/yyyy")
        : String(date ?? "");

    return row;
  });
}

function getClientSheetUrl(name) {
  if (!isNonEmptyString(name)) {
    throw new Error("No sheet name provided");
  }

  const ss = getSpreadsheet();
  const sheet = getSheetSafe(name);

  if (!sheet) {
    throw new Error(`Sheet "${name}" not found`);
  }

  if (sheet.isSheetHidden()) {
    sheet.showSheet();
  }

  return `${ss.getUrl()}#gid=${sheet.getSheetId()}`;
}

function createClientSheet(input) {
  if (!input || !isNonEmptyString(input.name)) {
    throw new Error("Client name cannot be empty.");
  }

  const sheetName = input.name.trim();

  if (sheetExists(sheetName)) {
    throw new Error(`Sheet "${sheetName}" already exists.`);
  }

  const template = getSheetSafe("BLANK");

  if (!template) {
    throw new Error('Template sheet "BLANK" not found.');
  }

  const ss = getSpreadsheet();
  const newSheet = template.copyTo(ss);

  newSheet.setName(sheetName);

  SpreadsheetApp.flush();

  newSheet.getRange("E1").setValue(sheetName);

  ss.setActiveSheet(newSheet);
  ss.moveActiveSheet(1);
}

function getClientDirectoryData() {
  const analyticsSheet = getSheetSafe("Client Analytics");

  if (!analyticsSheet) {
    return [];
  }

  const lastRow = analyticsSheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  const analytics = analyticsSheet
    .getRange(2, 1, lastRow - 1, 8)
    .getValues()
    .filter((row) => row[0] !== "" && row[0] !== null);

  return analytics.map((row) => {
    const name = String(row[0] || "").trim();

    return {
      name,

      paid: Number(row[1]) || 0,
      owed: Number(row[2]) || 0,
      netPaid: Number(row[3]) || 0,
      collectionRate: Number(row[4]) || 0,
      hours: Number(row[5]) || 0,
      projects: Number(row[6]) || 0,
      debtExposure: Number(row[7]) || 0,

      /*
       * Directory information can be added here.
       *
       * These will need to come from the existing
       * client-directory source.
       */
      role: "",
      status: "",
      category: "",
      externalUrl: "",
    };
  });
}

function getClientDirectoryAnalytics() {
  const sheet = getSheetSafe("Client Analytics");

  if (!sheet) {
    return {
      summary: {
        totalClients: 0,
        totalHours: 0,
        totalPaid: 0,
        totalOwed: 0,
        activeClients: 0,
      },
      clients: [],
    };
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return {
      summary: {
        totalClients: 0,
        totalHours: 0,
        totalPaid: 0,
        totalOwed: 0,
        activeClients: 0,
      },
      clients: [],
    };
  }

  const values = sheet
    .getRange(2, 1, lastRow - 1, 8)
    .getValues()
    .filter((row) => row[0] !== "" && row[0] !== null);

  const clients = values.map((row) => ({
    client: String(row[0] || ""),
    paid: Number(row[1]) || 0,
    owed: Number(row[2]) || 0,
    netPaid: Number(row[3]) || 0,
    collectionRate: Number(row[4]) || 0,
    hours: Number(row[5]) || 0,
    projects: Number(row[6]) || 0,
    debtExposure: Number(row[7]) || 0,
  }));

  const totalPaid = clients.reduce((sum, client) => sum + client.paid, 0);

  const totalOwed = clients.reduce((sum, client) => sum + client.owed, 0);

  const totalHours = clients.reduce((sum, client) => sum + client.hours, 0);

  return {
    summary: {
      totalClients: clients.length,
      totalHours,
      totalPaid,
      totalOwed,
      collectionRate:
        totalPaid + totalOwed > 0 ? totalPaid / (totalPaid + totalOwed) : 0,
    },

    clients,
  };
}

function getClientPaidOwedDataHistory(clientName) {
  try {
    const sheet = getSheetSafe(clientName);
    if (!sheet) return [];

    const lastRow = sheet.getLastRow();

    if (lastRow < 51) {
      return [];
    }

    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;

    const dataRange = sheet.getRange(51, 11, lastRow - 50, 4);

    const values = dataRange.getValues();

    return values
      .filter((r) => {
        if (!r.some((v) => v !== "" && v !== null)) {
          return false;
        }

        const year = Number(r[0]);

        return year === currentYear || year === previousYear;
      })
      .map((r) => ({
        year: Number(r[0]),
        hoursPaid: Number(r[1]) || 0,
        hoursOwed: Number(r[2]) || 0,
        netHours: Number(r[3]) || 0,
      }));
  } catch (e) {
    console.warn("Failed to load sales for client:", clientName, e);

    return [];
  }
}

function getClientActivityTrends() {
  try {
    const sheet = getSheetSafe("Other Analytics");

    if (!sheet) {
      throw new Error("Other Analytics sheet not found.");
    }

    // P8:U8
    // P = Active Clients
    // Q = Hours Logged
    // R = Tasks Completed
    // S = Projects Active
    // T = New Clients
    // U = New Projects
    const values = sheet.getRange("P8:U8").getValues()[0];

    return {
      activeClients: Number(values[0]) || 0,
      hoursLogged: Number(values[1]) || 0,
      tasksCompleted: Number(values[2]) || 0,
      projectsActive: Number(values[3]) || 0,
      newClients: Number(values[4]) || 0,
      newProjects: Number(values[5]) || 0,
    };
  } catch (err) {
    console.error("[getClientActivityTrends]", err);

    throw new Error(err.message || "Failed to load client activity trends.");
  }
}

function getClientRankings() {
  const sheet = getSheetSafe("Client Analytics");

  if (!sheet) {
    return {
      overview: {
        totalClients: 0,
        totalHours: 0,
        collectionRate: 0,
      },
      rankings: {},
    };
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return {
      overview: {
        totalClients: 0,
        totalHours: 0,
        collectionRate: 0,
      },
      rankings: {},
    };
  }

  /*
   * Client Analytics
   *
   * A = Client
   * B = Paid
   * C = Owed
   * D = Net Paid
   * E = Collection Rate
   * F = Hours
   * G = Projects
   * H = Debt Exposure
   */
  const values = sheet.getRange(2, 1, lastRow - 1, 8).getValues();

  const clients = values
    .filter((row) => row[0] !== "" && row[0] !== null)
    .map((row) => ({
      client: row[0] ?? "",
      paid: Number(row[1]) || 0,
      owed: Number(row[2]) || 0,
      netPaid: Number(row[3]) || 0,
      collectionRate: Number(row[4]) || 0,
      hours: Number(row[5]) || 0,
      projects: Number(row[6]) || 0,
      debtExposure: Number(row[7]) || 0,
    }));

  if (!clients.length) {
    return {
      overview: {
        totalClients: 0,
        totalHours: 0,
        collectionRate: 0,
      },
      rankings: {},
    };
  }

  const sortDesc = (key) =>
    [...clients].sort((a, b) => (b[key] || 0) - (a[key] || 0)).slice(0, 10);

  const totalPaid = clients.reduce((total, client) => total + client.paid, 0);

  const totalOwed = clients.reduce((total, client) => total + client.owed, 0);

  const totalHours = clients.reduce((total, client) => total + client.hours, 0);

  const collectionClients = clients.filter(
    (client) => client.paid > 0 && client.owed > 0,
  );

  const sortDescFrom = (data, key) =>
    [...data].sort((a, b) => (b[key] || 0) - (a[key] || 0)).slice(0, 10);

  return {
    overview: {
      totalClients: clients.length,
      totalHours,
      collectionRate:
        totalPaid + totalOwed > 0 ? totalPaid / (totalPaid + totalOwed) : 0,
    },

    rankings: {
      topClients: sortDesc("netPaid"),
      topPaid: sortDesc("paid"),
      highestHours: sortDesc("hours"),
      highestOwed: sortDesc("owed"),
      bestCollection: sortDescFrom(collectionClients, "collectionRate"),
      highestDebtExposure: sortDescFrom(collectionClients, "debtExposure"),
    },
  };
}