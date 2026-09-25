function recordManualClientHours(clientName, task, hours, date = new Date()) {
  if (!isNonEmptyString(clientName)) {
    return logResponse("Invalid client name provided.");
  }

  if (!isNonEmptyString(task)) {
    return logResponse("Task cannot be empty.");
  }

  const hoursNum = Number(hours);

  if (!isValidNumber(hoursNum)) {
    return logResponse("Hours must be a valid number (e.g. 1, 1.5).");
  }

  const sheet = getSheetSafe(clientName);

  if (!sheet) {
    return logResponse(`Client sheet "${clientName}" not found.`);
  }

  const dateObj = toDate(date);
  const row = getFirstEmptyRow(sheet, 1, 2);

  sheet
    .getRange(row, 1, 1, 3)
    .setValues([[formatDateSafe(dateObj, "M/d/yyyy"), task, hoursNum]]);

  logResponse(
    `Recorded ${hoursNum} hours for ${clientName} on "${task}".`,
    "Success",
  );
}

function validateManualHoursFormData(formData) {
  if (!formData || typeof formData !== "object") {
    throw new Error("Invalid form data.");
  }

  const client = String(formData.client ?? "").trim();
  const type = String(formData.type ?? "").trim();
  const task = String(formData.task ?? "").trim();
  const hourValue = String(formData.hour ?? "").trim();

  if (!client) {
    throw new Error("Client is required.");
  }

  if (!type) {
    throw new Error("Type is required.");
  }

  if (!task) {
    throw new Error("Task is required.");
  }

  if (task.toLowerCase() === "loading...") {
    throw new Error("Please select a valid task.");
  }

  if (!hourValue) {
    throw new Error("Hours are required.");
  }

  const hours = Number(hourValue);

  if (!Number.isFinite(hours)) {
    throw new Error("Hours must be a valid number.");
  }

  if (hours <= 0) {
    throw new Error("Hours must be greater than 0.");
  }

  return {
    client,
    type,
    task,
    hours,
  };
}

function recordClientHoursToSheet(sheet, data) {
  const { type, task, hours } = data;

  const startRow = 3;
  const lastRow = sheet.getLastRow();

  const today = formatDateSafe(new Date(), "M/d/yyyy");

  const rowCount = Math.max(1, lastRow - startRow + 1);

  const values = sheet.getRange(startRow, 5, rowCount, 4).getValues();

  /* ---------- Update existing entry ---------- */

  for (let i = 0; i < values.length; i++) {
    const [typeDev, taskProject, existingHours, entryDate] = values[i];

    const sameType = normalizeText(typeDev) === normalizeText(type);

    const sameTask = normalizeText(taskProject) === normalizeText(task);

    const sameDate = formatDateSafe(entryDate, "M/d/yyyy") === today;

    if (sameType && sameTask && sameDate) {
      const currentHours = Number(existingHours) || 0;

      const newHours = currentHours + hours;

      sheet.getRange(startRow + i, 7).setValue(newHours);

      return {
        success: true,
        action: "updated",
      };
    }
  }

  /* ---------- Create new entry ---------- */

  const emptyRow = getFirstEmptyRow(sheet, 5, startRow);

  sheet.getRange(emptyRow, 5, 1, 4).setValues([[type, task, hours, today]]);

  return {
    success: true,
    action: "created",
  };
}

function recordManualClientHoursFromForm(formData) {
  try {
    const data = validateManualHoursFormData(formData);

    const clientSheet = getSheetSafe(data.client);

    if (!clientSheet) {
      throw new Error(`Sheet "${data.client}" not found.`);
    }

    return recordClientHoursToSheet(clientSheet, data);
  } catch (err) {
    throw new Error(err.message || String(err));
  }
}

function recordExternalClientHoursFromForm(formData) {
  try {
    const data = validateManualHoursFormData(formData);

    const ss = getSpreadsheet();

    const registrySheet = getSheetSafe("External Sheets");

    if (!registrySheet || registrySheet.getLastRow() < 2) {
      throw new Error("External Sheets registry not found.");
    }

    /*
     * External Sheets registry:
     *
     * A = Spreadsheet ID
     * B = Client Name
     * C = Projects
     * D = Status
     * E = ...
     */
    const values = registrySheet
      .getRange(2, 1, registrySheet.getLastRow() - 1, 5)
      .getValues();

    const normalizedClient = normalizeText(data.client);

    /*
     * Find the external client.
     */
    const externalRow = values.find(
      (row) =>
        normalizeText(String(row[1] || "")) === normalizedClient &&
        String(row[0] || "").trim() !== "",
    );

    if (!externalRow) {
      throw new Error(
        `External client "${data.client}" was not found in the External Sheets registry.`,
      );
    }

    const spreadsheetId = String(externalRow[0] || "").trim();

    if (!spreadsheetId) {
      throw new Error(
        `No spreadsheet ID found for external client "${data.client}".`,
      );
    }

    /*
     * Open the client's external spreadsheet.
     */
    let externalSS;

    try {
      externalSS = SpreadsheetApp.openById(spreadsheetId);
    } catch (err) {
      throw new Error(
        `Unable to access the external spreadsheet for "${data.client}".`,
      );
    }

    /*
     * Find the project/task tab INSIDE the external spreadsheet.
     */
    const taskName = String(data.task || "").trim();

    if (!taskName) {
      throw new Error("Project/task is required.");
    }

    const projectSheet = externalSS.getSheetByName(taskName);

    if (!projectSheet) {
      throw new Error(
        `Project sheet "${taskName}" was not found in the external spreadsheet for "${data.client}".`,
      );
    }

    /*
     * Prevent writing to registry/system sheets.
     */
    const sheetName = projectSheet.getName();

    if (sheetName === "Projects" || sheetName === "BLANK") {
      throw new Error(`Invalid project sheet "${sheetName}".`);
    }

    /*
     * Record directly into the external client's
     * project/task sheet.
     */
    const result = recordClientHoursToSheet(projectSheet, data);

    /*
     * Rebuild/refresh aggregated external-sheet data.
     */
    combineExternalSheetData(spreadsheetId);

    return result;
  } catch (err) {
    throw new Error(err?.message || String(err));
  }
}

function getTaskOptions(clientName) {
  if (!clientName) {
    return [];
  }

  try {
    const sheet = getSheetSafe(clientName.trim());

    if (!sheet) {
      logResponse(`❌ No sheet found for client: ${clientName}`);
      return [];
    }

    SpreadsheetApp.flush();

    const tasks = sheet
      .getRange("F3:F")
      .getValues()
      .flat()
      .filter((task) => task && String(task).trim() !== "");

    return [...new Set(tasks)].sort();
  } catch (err) {
    logResponse(`⚠️ getTaskOptions error: ${err}`);
    return [];
  }
}

function getRecentRecordsForManualForm(clientSheetName, limit = 3) {
  if (!isNonEmptyString(clientSheetName)) {
    return [];
  }

  const sheet = getSheetSafe(clientSheetName);

  if (!sheet) {
    return [];
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < 3) {
    return [];
  }

  const startRow = 3;
  const numRows = lastRow - startRow + 1;

  const [dateCol, hourCol, typeCol, taskCol] = [8, 7, 5, 6].map((col) =>
    sheet.getRange(startRow, col, numRows).getValues(),
  );

  const rows = [];

  for (let i = 0; i < numRows; i++) {
    const date = dateCol[i][0];
    const hours = hourCol[i][0];
    const type = typeCol[i][0];
    const task = taskCol[i][0];

    if (
      ![date, hours, type, task].some((value) => value !== "" && value != null)
    ) {
      continue;
    }

    let dateTimestamp = 0;
    let dateString = "";

    if (date instanceof Date && !isNaN(date)) {
      dateTimestamp = date.getTime();
      dateString = formatDateSafe(date, "yyyy-MM-dd");
    } else if (date) {
      const parsed = new Date(String(date));

      if (!isNaN(parsed)) {
        dateTimestamp = parsed.getTime();
        dateString = formatDateSafe(parsed, "yyyy-MM-dd");
      } else {
        dateString = String(date);
      }
    }

    rows.push({
      dateTimestamp,
      row: [dateString, hours, type, task],
    });
  }

  return rows
    .sort((a, b) => b.dateTimestamp - a.dateTimestamp)
    .slice(0, limit)
    .map((item) => item.row);
}

function getDailyActivityData() {
  const sheet = getSheetSafe("Client Tracker - Today");

  return sheet
    ? sheet
        .getRange("B2:G")
        .getValues()
        .filter((row) => row.some(Boolean))
    : [];
}

function getHoursSummary() {
  const sheet = getSheetSafe("Other Analytics");

  if (!sheet) {
    return {};
  }

  const values = sheet.getRange("A2:I2").getValues()[0];

  return {
    totalHours: values[1] ?? 0,
    totalPaid: values[2] ?? 0,
    owedHours: values[3] ?? 0,
    netHours: values[4] ?? 0,

    lifetimePercent: values[5] ?? 0,
    collectionRate: values[6] ?? 0,
    debtExposureRate: values[7] ?? 0,
    netHoursYield: values[8] ?? 0,
  };
}

function getClientHoursForOverview(clientName) {
  if (!isNonEmptyString(clientName)) {
    return { error: "INVALID_CLIENT" };
  }

  const sheet = getSheetSafe(clientName);

  if (!sheet) {
    return { error: "NOT_FOUND" };
  }

  return {
    totalHrs: sheet.getRange("B8").getValue(),
    weekHrs: sheet.getRange("N18").getValue(),
    monthHrs: sheet.getRange("N19").getValue(),
    yearHrs: sheet.getRange("N20").getValue(),
  };
}

function getTodayClientHours(clientName) {
  try {
    if (!clientName || !String(clientName).trim()) {
      return {
        success: false,
        message: "Client is required.",
        records: [],
      };
    }

    const clientSheet = getSheetSafe(clientName);

    if (!clientSheet) {
      return {
        success: false,
        message: `Sheet "${clientName}" not found.`,
        records: [],
      };
    }

    const startRow = 3;
    const lastRow = clientSheet.getLastRow();

    if (lastRow < startRow) {
      return {
        success: true,
        records: [],
      };
    }

    const rowCount = lastRow - startRow + 1;

    // E:H
    const data = clientSheet.getRange(startRow, 5, rowCount, 4).getValues();

    const today = formatDateSafe(new Date(), "M/d/yyyy");

    const records = [];

    data.forEach((row, index) => {
      const [type, task, hours, date] = row;

      const rowNumber = startRow + index;

      const isToday = formatDateSafe(date, "M/d/yyyy") === today;

      if (!isToday) {
        return;
      }

      // Ignore completely empty rows.
      if (
        !type &&
        !task &&
        (hours === "" || hours === null || hours === undefined)
      ) {
        return;
      }

      records.push({
        row: rowNumber,
        type: type || "",
        task: task || "",
        hours: Number(hours) || 0,
        date: formatDateSafe(date, "M/d/yyyy"),
      });
    });

    return {
      success: true,
      records,
    };
  } catch (err) {
    throw new Error(err.message || String(err));
  }
}

function saveEditedTodayClientHours(formData) {
  try {
    if (!formData || !formData.client) {
      throw new Error("Client is required.");
    }

    const clientName = String(formData.client).trim();

    if (!clientName) {
      throw new Error("Client is required.");
    }

    const clientSheet = getSheetSafe(clientName);

    if (!clientSheet) {
      throw new Error(`Sheet "${clientName}" not found.`);
    }

    const records = Array.isArray(formData.records) ? formData.records : [];

    if (!records.length) {
      return {
        success: true,
        message: "No changes to save.",
      };
    }

    const startRow = 3;
    const lastRow = clientSheet.getLastRow();

    if (lastRow < startRow) {
      throw new Error("No records found.");
    }

    const today = formatDateSafe(new Date(), "M/d/yyyy");

    /*
     * --------------------------------------------------
     * 1. VALIDATE ALL REQUESTED ROWS FIRST
     * --------------------------------------------------
     */

    const requestedRows = new Set();

    records.forEach((record) => {
      const rowNumber = Number(record.row);

      if (!Number.isInteger(rowNumber)) {
        throw new Error("Invalid row number.");
      }

      if (rowNumber < startRow || rowNumber > lastRow) {
        throw new Error(`Row ${rowNumber} is no longer valid.`);
      }

      if (requestedRows.has(rowNumber)) {
        throw new Error(`Duplicate row submitted: ${rowNumber}`);
      }

      requestedRows.add(rowNumber);
    });

    /*
     * Read all E:H.
     */
    const rowCount = lastRow - startRow + 1;

    const data = clientSheet.getRange(startRow, 5, rowCount, 4).getValues();

    /*
     * Build a map of actual sheet rows.
     */
    const sheetRows = new Map();

    data.forEach((row, index) => {
      const rowNumber = startRow + index;

      sheetRows.set(rowNumber, {
        row: rowNumber,
        type: row[0] || "",
        task: row[1] || "",
        hours: Number(row[2]) || 0,
        date: row[3],
        dateFormatted: formatDateSafe(row[3], "M/d/yyyy"),
      });
    });

    /*
     * --------------------------------------------------
     * 2. VERIFY ROW + DATE
     * --------------------------------------------------
     */

    records.forEach((record) => {
      const rowNumber = Number(record.row);
      const actual = sheetRows.get(rowNumber);

      if (!actual) {
        throw new Error(`Row ${rowNumber} could not be found.`);
      }

      if (actual.dateFormatted !== today) {
        throw new Error(`Row ${rowNumber} is no longer a record from today.`);
      }
    });

    /*
     * --------------------------------------------------
     * 3. VALIDATE VALUES
     * --------------------------------------------------
     */

    records.forEach((record) => {
      if (record.action !== "delete" && record.action !== "update") {
        throw new Error(`Invalid action for row ${record.row}.`);
      }

      if (record.action === "update") {
        const type = String(record.type || "").trim();
        const task = String(record.task || "").trim();

        if (!type) {
          throw new Error(`Type is required for row ${record.row}.`);
        }

        if (!task) {
          throw new Error(`Task is required for row ${record.row}.`);
        }

        if (task.toLowerCase() === "loading...") {
          throw new Error(`Invalid task for row ${record.row}.`);
        }

        const hours = Number(record.hours);

        if (!Number.isFinite(hours) || hours < 0) {
          throw new Error(`Invalid hours for row ${record.row}.`);
        }
      }
    });

    /*
     * --------------------------------------------------
     * 4. APPLY UPDATES
     * --------------------------------------------------
     */

    records
      .filter((record) => record.action === "update")
      .forEach((record) => {
        const rowNumber = Number(record.row);

        clientSheet
          .getRange(rowNumber, 5, 1, 3)
          .setValues([
            [
              String(record.type).trim(),
              String(record.task).trim(),
              Number(record.hours),
            ],
          ]);
      });

    /*
     * --------------------------------------------------
     * 5. DELETE RECORDS
     * --------------------------------------------------
     */

    const deleteRows = records
      .filter((record) => record.action === "delete")
      .map((record) => Number(record.row));

    if (deleteRows.length) {
      deleteTodayRowsAndCompact(clientSheet, deleteRows, today, startRow);
    }

    return {
      success: true,
      message: "Today's records have been updated.",
    };
  } catch (err) {
    throw new Error(err.message || String(err));
  }
}

function deleteTodayRowsAndCompact(sheet, deleteRows, today, startRow) {
  const lastRow = sheet.getLastRow();

  if (lastRow < startRow) {
    return;
  }

  /*
   * Read E:H.
   */
  const rowCount = lastRow - startRow + 1;

  const data = sheet.getRange(startRow, 5, rowCount, 4).getValues();

  /*
   * Convert into objects containing
   * the original sheet row.
   */
  const rows = data.map((row, index) => ({
    rowNumber: startRow + index,
    values: row,
    dateFormatted: formatDateSafe(row[3], "M/d/yyyy"),
  }));

  const deleteSet = new Set(deleteRows);

  /*
   * Only today's records can be deleted.
   */
  const todayRows = rows.filter(
    (row) => row.dateFormatted === today && deleteSet.has(row.rowNumber),
  );

  /*
   * Safety check.
   */
  if (todayRows.length !== deleteRows.length) {
    throw new Error("One or more records are no longer valid for deletion.");
  }

  /*
   * Find all today's records.
   */
  const todayRecords = rows.filter((row) => row.dateFormatted === today);

  /*
   * Keep records that aren't being deleted.
   */
  const remainingRecords = todayRecords.filter(
    (row) => !deleteSet.has(row.rowNumber),
  );

  /*
   * Nothing left.
   */
  if (!remainingRecords.length) {
    todayRecords.forEach((row) => {
      sheet.getRange(row.rowNumber, 5, 1, 4).clearContent();
    });

    return;
  }

  /*
   * Write remaining records into the
   * original positions from the top.
   *
   * Example:
   *
   * Row 10 DELETE
   *
   * Row 11 -> Row 10
   * Row 12 -> Row 11
   *
   * etc.
   */
  const targetRows = todayRecords.map((row) => row.rowNumber);

  remainingRecords.forEach((record, index) => {
    const targetRow = targetRows[index];

    sheet.getRange(targetRow, 5, 1, 4).setValues([record.values]);
  });

  /*
   * Clear the rows that are now unused.
   *
   * Example:
   *
   * 3 records
   * delete 1
   *
   * 2 remain
   * last row gets cleared.
   */
  const rowsToClear = targetRows.slice(remainingRecords.length);

  rowsToClear.forEach((rowNumber) => {
    sheet.getRange(rowNumber, 5, 1, 4).clearContent();
  });
}

function getYearHoursSummary(year) {
  const sheet = getSheetSafe("Other Analytics");

  if (!sheet) {
    return null;
  }

  /*
   * A:M
   *
   * A = Net Yr
   * B = Hours
   * C = Net Paid
   * D = Net Owed
   * E = Net Hrs
   * F = % of Lifetime Vol
   * G = Collection Rate
   * H = Debt Exposure Rate
   * I = Net Hours Yield
   * J = Hours vs Last Year
   * K = Collection Rate vs Last Year
   * L = Debt Exposure Rate vs Last Year
   * M = Net Hours Yield vs Last Year
   */
  const data = sheet.getRange("A5:M").getValues();

  const row = data.find((item) => Number(item[0]) === Number(year));

  if (!row) {
    return null;
  }

  return {
    year: row[0],

    // Current year metrics
    hours: row[1],
    paid: row[2],
    owed: row[3],
    netHours: row[4],

    lifetime: row[5],
    collection: row[6],
    debt: row[7],
    yield: row[8],

    // Year-over-year metrics
    hoursYoY: row[9],
    collectionYoY: row[10],
    debtYoY: row[11],
    yieldYoY: row[12],
  };
}

function addCurrMthTotalHrly(value) {
  if (value === "" || value === null || value === undefined)
    throw new Error("❌ No value provided.");

  const sheet = getSheetSafe("Hourly History");
  if (!sheet) throw new Error('❌ Sheet "Hourly History" not found.');

  const lastRow = sheet.getLastRow();
  if (lastRow < 4) throw new Error("❌ Not enough data in Hourly History.");

  const colE = sheet.getRange("E4:E" + lastRow).getValues();
  const colF = sheet.getRange("F4:F" + lastRow).getValues();

  const targetRow = colE.findIndex((e, i) => e[0] && !colF[i][0]);
  if (targetRow === -1) throw new Error("⚠️ No empty F cell found to update.");

  const rowNum = targetRow + 4;
  const numVal = isNaN(Number(value)) ? value : Number(value);

  sheet.getRange(`F${rowNum}`).setValue(numVal);
  const monthYear = sheet.getRange(`E${rowNum}`).getValue();

  return {
    message: `✅ Added value to ${monthYear}`,
    row: rowNum,
    monthYear,
  };
}

function getDailyOverviewSummary() {
  const metricsSheet = getSheetSafe("Daily Activities Metrics");

  if (!metricsSheet) {
    return null;
  }

  const values = metricsSheet.getRange("R2:R29").getValues();

  const currentMonth = new Date().getMonth() + 1;

  const monthlyValues = metricsSheet
    .getRange("O2:Q")
    .getValues()
    .filter((row) => row[0] !== "");

  const currentMonthRow = monthlyValues.find(
    (row) => Number(row[0]) === currentMonth,
  );

  const currentMonthAverage = currentMonthRow?.[2] ?? null;

  return {
    overall: values[0][0],
    overallTotalHours: values[3][0],

    currentMonth: values[6][0],
    currentMonthAverage,

    activeClientsToday: values[12][0],
    activeClientsYesterday: values[15][0],

    todayHours: values[18][0],
    yesterdayHours: values[21][0],

    hoursVsYesterday: values[24][0],
    monthVsPreviousMonth: values[27][0],
  };
}

function getTodayChargedHours() {
  const sheet = getSheetSafe("Daily Activities Metrics");

  if (!sheet) return null;

  const values = sheet.getRange("R35:R41").getValues();

  return {
    todayHours: Number(values[0][0]) || 0,
    yesterdayHours: Number(values[3][0]) || 0,
    change:
      values[6][0] === "" || values[6][0] === null
        ? null
        : Number(values[6][0]),
  };
}

function getMonthlyHoursSummary() {
  const monthlySheet = getSheetSafe("Monthly Hours Log");
  const currentSheet = getSheetSafe("Current Month Log");

  if (!monthlySheet) {
    return {};
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-based

  /*
   * ---------------------------------------------------------
   * Monthly Hours Log
   * Row 1 = month labels
   * Row 2 = total hours
   * Starting at column M
   * ---------------------------------------------------------
   */

  const monthlyLastColumn = monthlySheet.getLastColumn();

  if (monthlyLastColumn < 13) {
    return {};
  }

  const monthHeaders = monthlySheet
    .getRange(1, 13, 1, monthlyLastColumn - 12)
    .getValues()[0];

  const monthTotals = monthlySheet
    .getRange(2, 13, 1, monthlyLastColumn - 12)
    .getValues()[0];

  const monthlyData = [];

  monthHeaders.forEach((header, index) => {
    if (!header) {
      return;
    }

    const date = header instanceof Date ? header : new Date(header);

    if (isNaN(date.getTime())) {
      return;
    }

    monthlyData.push({
      date,
      year: date.getFullYear(),
      month: date.getMonth(),
      label: Utilities.formatDate(
        date,
        Session.getScriptTimeZone(),
        "MMMM yyyy",
      ),
      hours: Number(monthTotals[index]) || 0,
    });
  });

  /*
   * Current month.
   */
  const currentMonthData = monthlyData.find(
    (item) => item.year === currentYear && item.month === currentMonth,
  );

  /*
   * Previous month.
   */
  const previousMonthDate = new Date(currentYear, currentMonth - 1, 1);

  const previousMonthData = monthlyData.find(
    (item) =>
      item.year === previousMonthDate.getFullYear() &&
      item.month === previousMonthDate.getMonth(),
  );

  /*
   * Same month last year.
   */
  const lastYearData = monthlyData.find(
    (item) => item.year === currentYear - 1 && item.month === currentMonth,
  );

  const currentHours = currentMonthData?.hours || 0;
  const previousHours = previousMonthData?.hours || 0;
  const lastYearHours = lastYearData?.hours || 0;

  /*
   * Percentage change helper.
   *
   * Returns null when there is no comparison value,
   * preventing divide-by-zero errors.
   */
  const percentageChange = (current, previous) => {
    if (!previous) {
      return null;
    }

    return ((current - previous) / Math.abs(previous)) * 100;
  };

  /*
   * ---------------------------------------------------------
   * Current Month Log
   *
   * AR:AV = Week 1 -> Week 5
   * Row 2 contains the totals.
   * ---------------------------------------------------------
   */

  let chargedHours = 0;
  let activeWeeks = 0;

  if (currentSheet) {
    const weeklyTotals = currentSheet
      .getRange("AR2:AV2")
      .getValues()[0]
      .map((value) => Number(value) || 0);

    chargedHours = weeklyTotals.reduce((total, value) => total + value, 0);

    activeWeeks = weeklyTotals.filter((value) => value > 0).length;
  }

  const chargedRate =
    currentHours > 0 ? (chargedHours / currentHours) * 100 : null;

  const averageWeekly = activeWeeks > 0 ? chargedHours / activeWeeks : 0;

  return {
    currentMonth: currentMonthData
      ? {
          label: currentMonthData.label,
          hours: currentHours,
        }
      : {
          label: Utilities.formatDate(
            now,
            Session.getScriptTimeZone(),
            "MMMM yyyy",
          ),
          hours: 0,
        },

    previousMonth: previousMonthData
      ? {
          label: previousMonthData.label,
          hours: previousHours,
        }
      : {
          label: "",
          hours: 0,
        },

    lastYear: lastYearData
      ? {
          label: lastYearData.label,
          hours: lastYearHours,
        }
      : {
          label: "",
          hours: 0,
        },

    previousMonthChange: percentageChange(currentHours, previousHours),

    lastYearChange: percentageChange(currentHours, lastYearHours),

    chargedHours,
    chargedRate,
    averageWeekly,
    activeWeeks,
  };
}

function getGrowthComparisonSummary(currentYear, comparisonYear) {
  const sheet = getSheetSafe("Other Analytics");

  if (!sheet) {
    return null;
  }

  currentYear = Number(currentYear);
  comparisonYear = Number(comparisonYear);

  if (!currentYear || !comparisonYear) {
    return null;
  }

  /*
   * Row 4 = headers
   * Row 5+ = yearly data
   */
  const lastRow = sheet.getLastRow();

  if (lastRow < 5) {
    return null;
  }

  const data = sheet.getRange(5, 1, lastRow - 4, 14).getValues();

  const current = data.find((row) => Number(row[0]) === currentYear);

  const previous = data.find((row) => Number(row[0]) === comparisonYear);

  if (!current || !previous) {
    return null;
  }

  return {
    currentYear,
    comparisonYear,

    current: {
      hours: Number(current[1]) || 0,
      paid: Number(current[2]) || 0,
      owed: Number(current[3]) || 0,
      netHours: Number(current[4]) || 0,
      lifetime: Number(current[5]) || 0,
      collection: Number(current[6]) || 0,
      debt: Number(current[7]) || 0,
      yield: Number(current[8]) || 0,
      monthlyAverage: Number(current[13]) || 0,
    },

    previous: {
      hours: Number(previous[1]) || 0,
      paid: Number(previous[2]) || 0,
      owed: Number(previous[3]) || 0,
      netHours: Number(previous[4]) || 0,
      lifetime: Number(previous[5]) || 0,
      collection: Number(previous[6]) || 0,
      debt: Number(previous[7]) || 0,
      yield: Number(previous[8]) || 0,
      monthlyAverage: Number(previous[13]) || 0,
    },
  };
}




