function getDailyChartData(sessionId, signature) {
  const sheet = getManagerChartSheet_(sessionId, signature, "Lab 3.0");

  if (!sheet) return [];

  return sheet
    .getRange("AB3:AC")
    .getValues()
    .filter(([label, value]) => label && value)
    .map(([label, value]) => [String(label), Number(value)]);
}

function getMonthlyChartData(sessionId, signature) {
  const sheet = getManagerChartSheet_(sessionId, signature, "Lab 3.0");

  if (!sheet) return [];

  return sheet
    .getRange("X3:Y")
    .getValues()
    .filter(([label, value]) => label && value)
    .map(([label, value]) => [String(label), Number(value)]);
}

function getHourlyChartData(sessionId, signature) {
  const sheet = getManagerChartSheet_(sessionId, signature, "Hourly History");

  if (!sheet) return [];

  return sheet
    .getRange("J4:K")
    .getValues()
    .filter(([label]) => label !== "" && label !== null)
    .map(([label, value]) => [String(label), Number(value) || 0]);
}

function getYearlyChartData(sessionId, signature, year = "all") {
  const sheet = getManagerChartSheet_(sessionId, signature, "Lab 3.0");

  if (!sheet) return [];

  const lastRow = sheet.getLastRow();

  if (lastRow < 11) return [];

  const values = sheet
    .getRange(`AJ11:AN${lastRow}`)
    .getValues()
    .filter((row) => row[0] && !isNaN(row[1]));

  const mapRow = (row) => [
    String(row[0]),
    Number(row[1]),
    Number(row[2]),
    Number(row[3]),
    Number(row[4]),
  ];

  if (year === "all") {
    const YEARS_TO_SHOW = 5;
    const currentYear = new Date().getFullYear();
    const startYear = currentYear - (YEARS_TO_SHOW - 1);

    return values
      .filter((row) => {
        const rowYear = Number(row[0]);
        return rowYear >= startYear && rowYear <= currentYear;
      })
      .map(mapRow);
  }

  return values.filter((row) => Number(row[0]) === Number(year)).map(mapRow);
}

function getPrevYearMonthlyChartData(sessionId, signature) {
  const sheet = getManagerChartSheet_(sessionId, signature, "Lab 3.0");

  if (!sheet) return [];

  return sheet
    .getRange("BA5:BB16")
    .getValues()
    .filter(([label, value]) => label && value)
    .map(([label, value]) => [String(label), Number(value)]);
}

function getCurrentYearTargetChartData(sessionId, signature) {
  const workspace = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "hours.view",
  );

  try {
    const spreadsheet = workspace.spreadsheet;
    const analyticsSheet = spreadsheet.getSheetByName("Other Analytics");
    const hoursSheet = spreadsheet.getSheetByName("Monthly Hours Log");

    if (!analyticsSheet) {
      throw new Error('Sheet "Other Analytics" was not found.');
    }

    if (!hoursSheet) {
      throw new Error('Sheet "Monthly Hours Log" was not found.');
    }

    const monthlyTarget = Number(analyticsSheet.getRange("R2").getValue()) || 0;

    if (monthlyTarget <= 0) return [];

    const lastColumn = hoursSheet.getLastColumn();

    if (lastColumn < 13) return [];

    const values = hoursSheet.getRange(1, 13, 2, lastColumn - 12).getValues();

    const headers = values[0];
    const hours = values[1];
    const currentYear = new Date().getFullYear();
    const timeZone = spreadsheet.getSpreadsheetTimeZone();

    return headers
      .map((header, index) => {
        if (!header) return null;

        let date;

        if (header instanceof Date) {
          date = header;
        } else {
          date = new Date(String(header).trim() + " 1");
        }

        if (
          Number.isNaN(date.getTime()) ||
          date.getFullYear() !== currentYear
        ) {
          return null;
        }

        const value = hours[index];

        if (value === "" || value === null || value === undefined) {
          return null;
        }

        const actual = Number(value);

        if (!Number.isFinite(actual)) return null;

        return {
          month: Utilities.formatDate(date, timeZone, "MMM"),
          actual,
          target: monthlyTarget,
        };
      })
      .filter(Boolean);
  } catch (err) {
    console.error("[getCurrentYearTargetChartData]", err);
    throw new Error(err.message || "Failed to load current-year target data.");
  }
}

function withChartGeneratorLock_(callback) {
  const lock = LockService.getScriptLock();

  lock.waitLock(30000);

  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function getCurrentMonthLogChartData(sessionId, signature, month, year) {
  const workspace = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "hours.view",
  );

  const spreadsheet = workspace.spreadsheet;
  const logSheet = spreadsheet.getSheetByName("Monthly Hours Log");

  if (!logSheet) {
    throw new Error('Sheet "Monthly Hours Log" was not found.');
  }

  const selectedMonth = Validation.integer(month, "Month", {
    min: 1,
    max: 12,
  });

  const selectedYear = Validation.integer(year, "Year", {
    min: 2024,
  });

  const timeZone = spreadsheet.getSpreadsheetTimeZone();
  const lastColumn = logSheet.getLastColumn();
  if (lastColumn < 13) return [];

  const headers = logSheet
    .getRange(1, 13, 1, lastColumn - 12)
    .getDisplayValues()[0];

  const targetHeader = `${
    [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ][selectedMonth - 1]
  } ${selectedYear}`;

  const monthColumnOffset = headers.findIndex(
    (header) =>
      String(header).trim().toLowerCase() === targetHeader.toLowerCase(),
  );

  if (monthColumnOffset < 0) return [];

  const lastRow = Math.min(Math.max(logSheet.getLastRow(), 3), 1000);
  if (lastRow < 3) return [];

  const rowCount = lastRow - 2;
  const clients = logSheet.getRange(3, 12, rowCount, 1).getDisplayValues();
  const monthTotals = logSheet
    .getRange(3, 13 + monthColumnOffset, rowCount, 1)
    .getValues();

  // Match J3:J: only clients with a positive monthly total are included.
  const activeClients = [];
  const seenClients = new Set();

  clients.forEach(([name], index) => {
    const clientName = String(name || "").trim();
    const total = Number(monthTotals[index][0]);

    if (
      clientName &&
      Number.isFinite(total) &&
      total > 0 &&
      !seenClients.has(clientName)
    ) {
      seenClients.add(clientName);
      activeClients.push(clientName);
    }
  });

  const now = new Date();
  const isCurrentMonth =
    selectedYear === Number(Utilities.formatDate(now, timeZone, "yyyy")) &&
    selectedMonth === Number(Utilities.formatDate(now, timeZone, "M"));

  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
  const maxDay = isCurrentMonth
    ? Number(Utilities.formatDate(now, timeZone, "d"))
    : daysInMonth;

  const dailyTotals = new Map();

  // Match the M1 formula: include all days except Sundays.
  for (let day = 1; day <= maxDay; day++) {
    const date = new Date(selectedYear, selectedMonth - 1, day);
    if (date.getDay() === 0) continue;

    const key = Utilities.formatDate(date, timeZone, "yyyy-MM-dd");
    dailyTotals.set(key, 0);
  }

  activeClients.forEach((clientName) => {
    const clientMap = getClientDailyHoursMap_(
      spreadsheet,
      clientName,
      timeZone,
      `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`,
      `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${String(maxDay).padStart(2, "0")}`,
    );

    clientMap.forEach((hours, dateKey) => {
      if (dailyTotals.has(dateKey)) {
        dailyTotals.set(dateKey, dailyTotals.get(dateKey) + hours);
      }
    });
  });

  return [...dailyTotals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, hours]) => {
      const [, , day] = dateKey.split("-");
      return [`${String(selectedMonth).padStart(2, "0")}-${day}`, hours];
    });
}

function getYearlyMonthlyHoursChartData(sessionId, signature, year) {
  const workspace = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "hours.view",
  );

  const spreadsheet = workspace.spreadsheet;
  const sheet = spreadsheet.getSheetByName("Monthly Hours Log");

  if (!sheet) {
    throw new Error('Sheet "Monthly Hours Log" was not found.');
  }

  const selectedYear = Validation.integer(year, "Year", {
    min: 2024,
  });

  const lastColumn = sheet.getLastColumn();
  if (lastColumn < 13) return [];

  const values = sheet.getRange(1, 13, 2, lastColumn - 12).getDisplayValues();

  const headers = values[0];
  const totals = values[1];

  return headers.reduce((result, header, index) => {
    const month = parseChartMonthHeader_(header);

    if (!month || month.year !== selectedYear) return result;

    const rawTotal = String(totals[index] ?? "")
      .replace(/,/g, "")
      .trim();
    if (!rawTotal) return result;

    const hours = Number(rawTotal);
    if (!Number.isFinite(hours)) return result;

    result.push([month.label, hours]);
    return result;
  }, []);
}

function getMonthlyHoursByYears(sessionId, signature, years) {
  const selectedYears = [
    ...new Set(
      (Array.isArray(years) ? years : []).map((year) =>
        Validation.integer(year, "Year", {
          min: 2024,
        }),
      ),
    ),
  ];

  if (!selectedYears.length) return {};

  const sheet = getManagerChartSheet_(
    sessionId,
    signature,
    "Monthly Hours Log",
  );

  if (!sheet) return {};

  try {
    const lastCol = sheet.getLastColumn();

    if (lastCol < 13) return {};

    const values = sheet.getRange(1, 13, 2, lastCol - 12).getDisplayValues();

    const headers = values[0];
    const totals = values[1];

    const MONTHS = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    const result = {};

    selectedYears.forEach((year) => {
      result[year] = [];
    });

    headers.forEach((header, index) => {
      const text = String(header || "").trim();

      if (!text) return;

      const match = text.match(/^([A-Za-z]+)\s+(\d{4})$/);

      if (!match) return;

      const monthIndex = MONTHS.findIndex(
        (month) => month.toLowerCase() === match[1].toLowerCase(),
      );

      const year = Number(match[2]);

      if (monthIndex === -1 || !selectedYears.includes(year)) return;

      const hours = Number(String(totals[index] || "").replace(/,/g, "")) || 0;

      result[year].push([monthIndex, hours]);
    });

    Object.keys(result).forEach((year) => {
      result[year].sort((a, b) => a[0] - b[0]);
    });

    return result;
  } catch (err) {
    console.error("[getMonthlyHoursByYears]", err);

    throw new Error(err.message || "Failed to load monthly hours data.");
  }
}

function updateDailyOverviewChartRange(
  sessionId,
  signature,
  startDate,
  endDate,
) {
  const workspace = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "hours.view",
  );

  const spreadsheet = workspace.spreadsheet;
  const metricsSheet = spreadsheet.getSheetByName("Daily Activities Metrics");

  if (!metricsSheet) {
    throw new Error('Sheet "Daily Activities Metrics" was not found.');
  }

  const timeZone = spreadsheet.getSpreadsheetTimeZone();

  let start;
  let end;

  try {
    start = Utilities.parseDate(startDate, timeZone, "yyyy-MM-dd");

    // Blank end date means a single-day range, matching the sheet formula.
    end = endDate
      ? Utilities.parseDate(endDate, timeZone, "yyyy-MM-dd")
      : start;
  } catch (err) {
    throw new Error("Invalid date range.");
  }

  if (
    !(start instanceof Date) ||
    Number.isNaN(start.getTime()) ||
    !(end instanceof Date) ||
    Number.isNaN(end.getTime())
  ) {
    throw new Error("Invalid date range.");
  }

  const startKey = Utilities.formatDate(start, timeZone, "yyyy-MM-dd");
  const endKey = Utilities.formatDate(end, timeZone, "yyyy-MM-dd");

  if (startKey > endKey) {
    throw new Error("Start date cannot be after end date.");
  }

  const lastRow = metricsSheet.getLastRow();
  if (lastRow < 2) return [];

  // Source columns: A = activity date, B = client name.
  const activityRows = metricsSheet.getRange(2, 1, lastRow - 1, 2).getValues();

  const activeClients = [];
  const seenClients = new Set();

  activityRows.forEach(([dateValue, clientValue]) => {
    const dateKey = getChartDateKey_(dateValue, timeZone);
    const clientName = String(clientValue || "").trim();

    if (
      !dateKey ||
      dateKey < startKey ||
      dateKey > endKey ||
      !clientName ||
      clientName === "NO DATA"
    ) {
      return;
    }

    if (!seenClients.has(clientName)) {
      seenClients.add(clientName);
      activeClients.push(clientName);
    }
  });

  if (!activeClients.length) return [];

  return activeClients.map((clientName) => {
    const dailyHours = getClientDailyHoursMap_(
      spreadsheet,
      clientName,
      timeZone,
      startKey,
      endKey,
    );

    let total = 0;

    dailyHours.forEach((hours, dateKey) => {
      if (dateKey >= startKey && dateKey <= endKey) {
        total += hours;
      }
    });

    return [clientName, total];
  });
}

/**
 * Returns a manager-specific sheet after checking the required capability.
 * Uses the existing manager-aware workspace helper.
 */
function getManagerChartSheet_(sessionId, signature, sheetName) {
  const workspace = getManagerWorkspaceForCapability_(
    sessionId,
    signature,
    "hours.view",
  );

  return workspace?.spreadsheet?.getSheetByName(sheetName) || null;
}

/**
 * Converts a sheet date value to yyyy-MM-dd or M/D/YYYY in the spreadsheet timezone.
 * Returns an empty string for blank or invalid values.
 */
function getChartDateKey_(value, timeZone) {
  if (value === "" || value === null || value === undefined) {
    return "";
  }

  let date;

  if (value instanceof Date) {
    date = value;
  } else {
    const text = String(value).trim();
    if (!text) return "";

    // ISO date string: yyyy-MM-dd
    let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

    if (match) {
      date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    } else {
      // US date string: M/D/YYYY or MM/DD/YYYY
      match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

      if (match) {
        date = new Date(
          Number(match[3]),
          Number(match[1]) - 1,
          Number(match[2]),
        );
      } else {
        return "";
      }
    }
  }

  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }

  return Utilities.formatDate(date, timeZone, "yyyy-MM-dd");
}

/**
 * Reads hours and dates from columns G:H for a single client sheet.
 * Returns a map keyed by yyyy-MM-dd, with hours summed for each date.
 */
/**
 * Reads only hours for dates within the requested range.
 *
 * Client sheets:
 *   G = hours
 *   H = date
 *
 * Dates need not be sorted.
 */
function getClientDailyHoursMap_(
  spreadsheet,
  clientName,
  timeZone,
  startDateKey,
  endDateKey,
) {
  const sheet = spreadsheet.getSheetByName(clientName);
  if (!sheet) return new Map();

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return new Map();

  // Read dates only, rather than all G:H values.
  const dates = sheet.getRange(2, 8, lastRow - 1, 1).getValues();
  const matchingRows = [];

  for (let i = 0; i < dates.length; i++) {
    const dateKey = getChartDateKey_(dates[i][0], timeZone);
    if (!dateKey) continue;

    if (
      (!startDateKey || dateKey >= startDateKey) &&
      (!endDateKey || dateKey <= endDateKey)
    ) {
      matchingRows.push({
        row: i + 2,
        dateKey,
      });
    }
  }

  const totals = new Map();
  if (!matchingRows.length) return totals;

  // Read only the contiguous runs of matching rows from column G.
  // This avoids reading unrelated hours, even when matching rows are scattered.
  const runs = [];
  let runStart = matchingRows[0].row;
  let previousRow = runStart;

  for (let i = 1; i < matchingRows.length; i++) {
    const row = matchingRows[i].row;

    if (row !== previousRow + 1) {
      runs.push({ start: runStart, end: previousRow });
      runStart = row;
    }

    previousRow = row;
  }

  runs.push({ start: runStart, end: previousRow });

  const hoursByRow = new Map();

  runs.forEach((run) => {
    const values = sheet
      .getRange(run.start, 7, run.end - run.start + 1, 1)
      .getValues();

    values.forEach(([value], index) => {
      hoursByRow.set(run.start + index, value);
    });
  });

  matchingRows.forEach(({ row, dateKey }) => {
    const hours = Number(hoursByRow.get(row));
    if (!Number.isFinite(hours)) return;

    totals.set(dateKey, (totals.get(dateKey) || 0) + hours);
  });

  return totals;
}

/**
 * Resolves a Monthly Hours Log header such as "October 2026".
 */
function parseChartMonthHeader_(value) {
  const text = String(value || "").trim();
  const match = text.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return null;

  const monthIndex = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ].indexOf(match[1].toLowerCase());

  if (monthIndex < 0) return null;

  return {
    monthIndex,
    year: Number(match[2]),
    label: `${match[1]} ${match[2]}`,
  };
}

// admin

function getAdminMonthName_(label) {
  if (!label) return "";

  const MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  if (label instanceof Date && !isNaN(label.getTime())) {
    return MONTHS[label.getMonth()];
  }

  const value = String(label).trim().toLowerCase();

  return (
    MONTHS.find((month) =>
      month.toLowerCase().startsWith(value.substring(0, 3)),
    ) || ""
  );
}

function getAdminMonthlyChartData(sessionId, signature) {
  requireAdminSession_(sessionId, signature);

  const managers = getAdminDashboardManagers_();

  const result = {
    labels: [],
    managers: [],
    overall: [],
    managerCount: managers.length,
    successfulManagerCount: 0,
    errors: [],
    generatedAt: new Date().toISOString(),
  };

  // Internal map: month label -> combined hours.
  const overallByMonth = new Map();
  const monthLabels = new Set();

  managers.forEach((manager) => {
    try {
      const managerSS = openSpreadsheetById(manager.spreadsheetId);
      const sheet = managerSS.getSheetByName("Lab 3.0");

      if (!sheet) {
        throw new Error('Missing "Lab 3.0" sheet.');
      }

      const lastRow = sheet.getLastRow();

      if (lastRow < 3) {
        result.managers.push({
          managerId: manager.managerId,
          managerName: manager.managerName,
          _monthData: new Map(),
        });

        result.successfulManagerCount++;
        return;
      }

      const rows = sheet
        .getRange(3, 24, lastRow - 2, 2) // X3:Y
        .getValues();

      const managerByMonth = new Map();

      rows.forEach(([label, value]) => {
        const monthLabel = String(label || "").trim();

        if (!monthLabel) return;

        const hours = Number(value) || 0;

        monthLabels.add(monthLabel);
        managerByMonth.set(monthLabel, hours);

        overallByMonth.set(
          monthLabel,
          (overallByMonth.get(monthLabel) || 0) + hours,
        );
      });

      // Keep the manager's values keyed by month until all
      // managers have been read and the common labels are known.
      result.managers.push({
        managerId: manager.managerId,
        managerName: manager.managerName,
        _monthData: managerByMonth,
      });

      result.successfulManagerCount++;
    } catch (error) {
      console.error(
        `[Admin Dashboard] Monthly chart failed for ${manager.managerId}: ${error.message}`,
      );

      result.errors.push({
        managerId: manager.managerId,
        managerName: manager.managerName,
        message: error.message || "Failed to read monthly chart data.",
      });
    }
  });

  // Sort full month-year labels chronologically.
  const labels = Array.from(monthLabels).sort((a, b) => {
    const dateA = Date.parse(`1 ${a}`);
    const dateB = Date.parse(`1 ${b}`);

    if (Number.isNaN(dateA) || Number.isNaN(dateB)) {
      return a.localeCompare(b);
    }

    return dateA - dateB;
  });

  result.labels = labels;

  // Convert each manager's month map into an aligned data array.
  result.managers = result.managers.map((manager) => ({
    managerId: manager.managerId,
    managerName: manager.managerName,
    data: labels.map((label) => manager._monthData.get(label) || 0),
  }));

  // Combined hours for every month.
  result.overall = labels.map((label) => overallByMonth.get(label) || 0);

  return result;
}

function getAdminMonthlyComparisonChartData(sessionId, signature) {
  requireAdminSession_(sessionId, signature);

  const managers = getAdminDashboardManagers_();

  const MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const result = {
    managers: [],
    overall: {
      prevYear: [],
      currentYear: [],
    },
    managerCount: managers.length,
    successfulManagerCount: 0,
    errors: [],
  };

  const overallPrev = new Map();
  const overallCurrent = new Map();

  MONTHS.forEach((month) => {
    overallPrev.set(month, 0);
    overallCurrent.set(month, 0);
  });

  managers.forEach((manager) => {
    try {
      const managerSS = openSpreadsheetById(manager.spreadsheetId);
      const sheet = managerSS.getSheetByName("Lab 3.0");

      if (!sheet) {
        throw new Error('Missing "Lab 3.0" sheet.');
      }

      const prevRows = sheet.getRange("BA5:BB16").getValues();

      const lastRow = sheet.getLastRow();

      const currentRows =
        lastRow >= 3 ? sheet.getRange(3, 24, lastRow - 2, 2).getValues() : [];

      const prevMap = new Map();
      const currentMap = new Map();

      MONTHS.forEach((month) => {
        prevMap.set(month, 0);
        currentMap.set(month, 0);
      });

      prevRows.forEach(([label, value]) => {
        const month = getAdminMonthName_(label);

        if (!month) return;

        const hours = Number(value) || 0;

        prevMap.set(month, hours);

        overallPrev.set(month, overallPrev.get(month) + hours);
      });

      currentRows.forEach(([label, value]) => {
        const month = getAdminMonthName_(label);

        if (!month) return;

        const hours = Number(value) || 0;

        currentMap.set(month, hours);

        overallCurrent.set(month, overallCurrent.get(month) + hours);
      });

      result.managers.push({
        managerId: manager.managerId,
        managerName: manager.managerName,

        prevYear: MONTHS.map((month) => [month, prevMap.get(month)]),

        currentYear: MONTHS.map((month) => [month, currentMap.get(month)]),
      });

      result.successfulManagerCount++;
    } catch (error) {
      console.error(
        `[Admin Dashboard] Monthly comparison failed for ${manager.managerId}: ${error.message}`,
      );

      result.errors.push({
        managerId: manager.managerId,
        managerName: manager.managerName,
        message: error.message || "Failed to read monthly comparison data.",
      });
    }
  });

  result.overall.prevYear = MONTHS.map((month) => [
    month,
    overallPrev.get(month),
  ]);

  result.overall.currentYear = MONTHS.map((month) => [
    month,
    overallCurrent.get(month),
  ]);

  return result;
}