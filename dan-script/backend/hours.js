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

function recordManualClientHoursFromForm(formData) {
  try {
    /* ---------- Validate input ---------- */

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

    /* ---------- Get client sheet ---------- */

    const clientSheet = getSheetSafe(client);

    if (!clientSheet) {
      throw new Error(`Sheet "${client}" not found.`);
    }

    const startRow = 3;
    const lastRow = clientSheet.getLastRow();

    const today = formatDateSafe(new Date(), "M/d/yyyy");

    const rowCount = Math.max(1, lastRow - startRow + 1);

    const data = clientSheet.getRange(startRow, 5, rowCount, 4).getValues();

    /* ---------- Update existing entry ---------- */

    for (let i = 0; i < data.length; i++) {
      const [typeDev, taskProject, existingHours, entryDate] = data[i];

      const sameType = normalizeText(typeDev) === normalizeText(type);

      const sameTask = normalizeText(taskProject) === normalizeText(task);

      const sameDate = formatDateSafe(entryDate, "M/d/yyyy") === today;

      if (sameType && sameTask && sameDate) {
        const currentHours = Number(existingHours) || 0;
        const newHours = currentHours + hours;

        clientSheet.getRange(startRow + i, 7).setValue(newHours);

        return {
          success: true,
          action: "updated",
        };
      }
    }

    /* ---------- Create new entry ---------- */

    const emptyRow = getFirstEmptyRow(clientSheet, 5, startRow);

    clientSheet
      .getRange(emptyRow, 5, 1, 4)
      .setValues([[type, task, hours, today]]);

    return {
      success: true,
      action: "created",
    };
  } catch (err) {
    throw new Error(err.message || String(err));
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