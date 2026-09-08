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