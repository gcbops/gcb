function getLabSheet() {
  return getSheetSafe("Lab 3.0");
}

function getLabCell(cellRange) {
  const sheet = getLabSheet();

  if (!sheet) {
    return "";
  }

  try {
    return sheet.getRange(cellRange).getValue();
  } catch (err) {
    logResponse(`getLabCell(${cellRange}) failed: ${err.message}`);

    return "";
  }
}

function selectClient(data) {
  const sheet = getLabSheet();

  if (sheet) {
    sheet.getRange("P24").setValue(data.client);
  }
}

function getP24Client() {
  const sheet = getLabSheet();

  return sheet ? sheet.getRange("P24").getValue() || "" : "";
}

function getPerformanceSummary(yearType) {
  const sheet = getSheetSafe("Other Analytics");

  if (!sheet) {
    throw new Error('Sheet "Other Analytics" was not found.');
  }

  const currentYear = new Date().getFullYear();

  const year =
    yearType === "current"
      ? currentYear
      : yearType === "previous"
        ? currentYear - 1
        : null;

  if (!year) {
    return null;
  }

  const lastColumn = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();

  if (lastColumn < 1 || lastRow < 5) {
    return {
      year,
      percentages: [],
      paidGrowth: 0,
    };
  }

  const headers = sheet
    .getRange(4, 1, 1, lastColumn)
    .getValues()[0]
    .map((header) => String(header).trim());

  const data = sheet.getRange(5, 1, lastRow - 4, lastColumn).getValues();

  const columnMap = {};

  headers.forEach((header, index) => {
    if (header) {
      columnMap[header] = index;
    }
  });

  const requiredMetrics = [
    "Collection Rate",
    "Debt Exposure Rate",
    "Net Hours Yield",
    "% of Lifetime Vol",
  ];

  const requiredColumns = ["Net Yr", ...requiredMetrics, "Paid vs Last Year"];

  const missing = requiredColumns.filter(
    (column) => columnMap[column] === undefined,
  );

  if (missing.length) {
    throw new Error(
      `Missing columns in Other Analytics: ${missing.join(", ")}`,
    );
  }

  const yearRow = data.find((row) => Number(row[columnMap["Net Yr"]]) === year);

  if (!yearRow) {
    return {
      year,
      percentages: [],
      paidGrowth: 0,
    };
  }

  const percentages = requiredMetrics.map((metric) => {
    const value = Number(yearRow[columnMap[metric]]) || 0;

    return [metric, value * 100];
  });

  const paidGrowth =
    (Number(yearRow[columnMap["Paid vs Last Year"]]) || 0) * 100;

  return {
    year,
    percentages,
    paidGrowth,
  };
}


