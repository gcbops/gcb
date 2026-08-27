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
  const {
    type,
    task,
    hours,
  } = data;

  const startRow = 3;
  const lastRow = sheet.getLastRow();

  const today = formatDateSafe(
    new Date(),
    "M/d/yyyy",
  );

  const rowCount = Math.max(
    1,
    lastRow - startRow + 1,
  );

  const values = sheet
    .getRange(startRow, 5, rowCount, 4)
    .getValues();

  /* ---------- Update existing entry ---------- */

  for (let i = 0; i < values.length; i++) {
    const [
      typeDev,
      taskProject,
      existingHours,
      entryDate,
    ] = values[i];

    const sameType =
      normalizeText(typeDev) ===
      normalizeText(type);

    const sameTask =
      normalizeText(taskProject) ===
      normalizeText(task);

    const sameDate =
      formatDateSafe(
        entryDate,
        "M/d/yyyy",
      ) === today;

    if (sameType && sameTask && sameDate) {
      const currentHours =
        Number(existingHours) || 0;

      const newHours =
        currentHours + hours;

      sheet
        .getRange(startRow + i, 7)
        .setValue(newHours);

      return {
        success: true,
        action: "updated",
      };
    }
  }

  /* ---------- Create new entry ---------- */

  const emptyRow = getFirstEmptyRow(
    sheet,
    5,
    startRow,
  );

  sheet
    .getRange(emptyRow, 5, 1, 4)
    .setValues([
      [type, task, hours, today],
    ]);

  return {
    success: true,
    action: "created",
  };
}

function recordManualClientHoursFromForm(formData) {
  try {
    const data =
      validateManualHoursFormData(formData);

    const clientSheet =
      getSheetSafe(data.client);

    if (!clientSheet) {
      throw new Error(
        `Sheet "${data.client}" not found.`,
      );
    }

    return recordClientHoursToSheet(
      clientSheet,
      data,
    );
  } catch (err) {
    throw new Error(
      err.message || String(err),
    );
  }
}

function recordExternalClientHoursFromForm(formData) {
  try {
    const data = validateManualHoursFormData(formData);

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const registrySheet = ss.getSheetByName("External Sheets");

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
  const sheet = getLabSheet();
  if (!sheet) return {};

  const values = sheet.getRange("AW3:AW6").getValues().flat();

  return {
    totalHours: values[0],
    totalPaid: values[1],
    owedHours: values[2],
    netHours: values[3],
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