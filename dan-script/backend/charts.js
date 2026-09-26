function getDailyChartData() {
  const sheet = getLabSheet();

  if (!sheet) {
    return [];
  }

  return sheet
    .getRange("AB3:AC")
    .getValues()
    .filter(([label, value]) => label && value)
    .map(([label, value]) => [String(label), Number(value)]);
}

function getMonthlyChartData() {
  const sheet = getLabSheet();

  if (!sheet) {
    return [];
  }

  return sheet
    .getRange("X3:Y")
    .getValues()
    .filter(([label, value]) => label && value)
    .map(([label, value]) => [String(label), Number(value)]);
}

function getYearlyChartData(year = "all") {
  const sheet = getLabSheet();

  if (!sheet) {
    return [];
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < 11) {
    return [];
  }

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

  // Return latest 5 years
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

  // Return specific year
  return values.filter((row) => Number(row[0]) === Number(year)).map(mapRow);
}

function getPrevYearMonthlyChartData() {
  const sheet = getLabSheet();

  if (!sheet) {
    return [];
  }

  return sheet
    .getRange("BA5:BB16")
    .getValues()
    .filter(([label, value]) => label && value)
    .map(([label, value]) => [String(label), Number(value)]);
}

function getCurrentYearTargetChartData() {
  try {
    const analyticsSheet = getSheetSafe("Other Analytics");

    const hoursSheet = getSheetSafe("Monthly Hours Log");

    if (!analyticsSheet) {
      throw new Error('Sheet "Other Analytics" was not found.');
    }

    if (!hoursSheet) {
      throw new Error('Sheet "Monthly Hours Log" was not found.');
    }

    /*
     * Monthly target is stored in:
     * Other Analytics!R2
     */
    const monthlyTarget = Number(analyticsSheet.getRange("R2").getValue()) || 0;

    if (monthlyTarget <= 0) {
      return [];
    }

    const lastColumn = hoursSheet.getLastColumn();

    if (lastColumn < 13) {
      return [];
    }

    const values = hoursSheet.getRange(1, 13, 2, lastColumn - 12).getValues();

    const headers = values[0];
    const hours = values[1];

    const currentYear = new Date().getFullYear();

    const result = headers
      .map((header, index) => {
        if (!header) {
          return null;
        }

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

        if (!Number.isFinite(actual)) {
          return null;
        }

        return {
          month: Utilities.formatDate(date, Session.getScriptTimeZone(), "MMM"),
          actual,
          target: monthlyTarget,
        };
      })
      .filter(Boolean);

    return result;
  } catch (err) {
    throw new Error(err.message || String(err));
  }
}

function getCurrentMonthLogChartData(month, year) {
  try {
    const sheet = getSheetSafe("Data Generator For Chart");

    if (!sheet) {
      return [];
    }

    // Set the requested month/year.
    sheet.getRange("AR3").setValue(Number(month));
    sheet.getRange("AR6").setValue(Number(year));

    SpreadsheetApp.flush();

    return sheet
      .getRange("AT2:AU")
      .getValues()
      .filter(([label, value]) => label && value !== "")
      .map(([label, value]) => [String(label), Number(value) || 0]);
  } catch (err) {
    console.error("[getCurrentMonthLogChartData]", err);
    throw new Error(
      err.message || "Failed to load current month log chart data.",
    );
  }
}

function getYearlyMonthlyHoursChartData(year) {
  try {
    const sheet = getSheetSafe("Data Generator For Chart");

    if (!sheet) {
      return [];
    }

    const selectedYear = Number(year);

    if (!selectedYear) {
      return [];
    }

    // Set selected year
    sheet.getRange("AR10").setValue(selectedYear);

    // Make sure AW:AX formulas have recalculated
    SpreadsheetApp.flush();

    return sheet
      .getRange("AW2:AX")
      .getValues()
      .filter(([label, value]) => label && value !== "")
      .map(([label, value]) => [String(label), Number(value) || 0]);
  } catch (err) {
    console.error("[getYearlyMonthlyHoursChartData]", err);

    throw new Error(
      err.message || "Failed to load yearly monthly hours chart data.",
    );
  }
}

function getMonthlyHoursByYears(years) {
  try {
    const sheet = getSheetSafe("Monthly Hours Log");

    if (!sheet) {
      return {};
    }

    const selectedYears = (Array.isArray(years) ? years : [])
      .map(Number)
      .filter((year) => Number.isFinite(year));

    if (!selectedYears.length) {
      return {};
    }

    const lastCol = sheet.getLastColumn();

    if (lastCol < 13) {
      return {};
    }

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

      if (!text) {
        return;
      }

      const match = text.match(/^([A-Za-z]+)\s+(\d{4})$/);

      if (!match) {
        return;
      }

      const monthName = match[1];
      const year = Number(match[2]);

      if (!selectedYears.includes(year)) {
        return;
      }

      const monthIndex = MONTHS.findIndex(
        (month) => month.toLowerCase() === monthName.toLowerCase(),
      );

      if (monthIndex === -1) {
        return;
      }

      const hours = Number(String(totals[index] || "").replace(/,/g, "")) || 0;

      // Return month index directly
      result[year].push([monthIndex, hours]);
    });

    Object.keys(result).forEach((year) => {
      result[year].sort((a, b) => a[0] - b[0]);
    });

    console.log("[getMonthlyHoursByYears] result:", JSON.stringify(result));

    return result;
  } catch (err) {
    console.error("[getMonthlyHoursByYears]", err);

    throw new Error(err.message || "Failed to load monthly hours data.");
  }
}

function updateDailyOverviewChartRange(startDate, endDate) {
  try {
    const sheet = getSheetSafe("Data Generator For Chart");

    if (!sheet) {
      throw new Error('Sheet "Data Generator For Chart" not found.');
    }

    const spreadsheet = sheet.getParent();

    const timeZone = spreadsheet.getSpreadsheetTimeZone();

    const start = Utilities.parseDate(startDate, timeZone, "yyyy-MM-dd");

    const end = Utilities.parseDate(endDate, timeZone, "yyyy-MM-dd");

    if (!start || !end) {
      throw new Error("Invalid date range.");
    }

    if (start > end) {
      throw new Error("Start date cannot be after end date.");
    }

    sheet.getRange("BA1").setValue(start);

    sheet.getRange("BB1").setValue(end);

    SpreadsheetApp.flush();

    const lastRow = sheet.getLastRow();

    if (lastRow < 4) {
      return [];
    }

    return sheet
      .getRange(4, 52, lastRow - 3, 2)
      .getDisplayValues()
      .filter(([client]) => String(client || "").trim())
      .map(([client, hours]) => [
        String(client).trim(),
        Number(String(hours || "").replace(/,/g, "")) || 0,
      ]);
  } catch (err) {
    console.error("[updateDailyOverviewChartRange]", err);

    throw new Error(err.message || "Failed to update daily overview chart.");
  }
}