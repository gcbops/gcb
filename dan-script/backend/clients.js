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

  pullClientProjects();

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
  const ss = getActiveSpreadsheet();
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

  const sheet = ss.getSheetByName(sheetName);

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
      .map((row) => ({
        client: row[0],
        totalOwed: Number(row[1]) || 0,
        currentMonthOwed: Number(row[2]) || 0,
        totalPaid: Number(row[3]) || 0,
        today: Number(row[4]) || 0,
      }));
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

  const ss = getActiveSpreadsheet();
  const sheet = ss.getSheetByName(name);

  if (!sheet) {
    throw new Error(`Sheet "${name}" not found`);
  }

  if (sheet.isSheetHidden()) {
    sheet.showSheet();
  }

  return `${ss.getUrl()}#gid=${sheet.getSheetId()}`;
}

function getClientDataWithNickname(dt) {
  const ss = getActiveSpreadsheet();
  const logSheet = ss.getSheetByName("Paid & Owed Log");
  const clientNamesSheet = ss.getSheetByName("Client Names");

  if (!logSheet) {
    throw new Error('Sheet "Paid & Owed Log" not found.');
  }

  if (!clientNamesSheet) {
    throw new Error('Sheet "Client Names" not found.');
  }

  const lastRow = logSheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  const data =
    dt === "activeClientsData"
      ? logSheet.getRange(2, 15, lastRow - 1, 4).getValues()
      : logSheet.getRange(2, 10, lastRow - 1, 4).getValues();

  /*
   * Client Names:
   * A = Client Name
   * E = Number of Projects
   * H = Nickname
   */
  const clientNamesLastRow = clientNamesSheet.getLastRow();

  const clientMap = new Map();

  if (clientNamesLastRow >= 2) {
    const clientNamesData = clientNamesSheet
      .getRange(2, 1, clientNamesLastRow - 1, 8)
      .getValues();

    clientNamesData.forEach((row) => {
      const name = String(row[0] ?? "").trim();

      if (!name) {
        return;
      }

      const projects = Number(row[4]) || 0;
      const nickname = String(row[7] ?? "").trim();

      clientMap.set(normalizeText(name), {
        projects,
        nickname,
      });
    });
  }

  return data
    .filter((row) => row[0] !== "" && row[0] !== null && row[0] !== undefined)
    .map((row) => {
      const name = String(row[0] ?? "").trim();

      const clientInfo = clientMap.get(normalizeText(name)) || {
        projects: 0,
        nickname: "",
      };

      return {
        name,
        paid: row[1],
        owed: row[2],
        status: row[3],
        role: clientInfo.nickname,
        projects: clientInfo.projects,
      };
    });
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
