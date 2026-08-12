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

function setLabCell(cellRange, value) {
  const sheet = getLabSheet();

  if (!sheet) {
    return;
  }

  try {
    sheet.getRange(cellRange).setValue(value);
  } catch (err) {
    logResponse(`setLabCell(${cellRange}) failed: ${err.message}`);
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
  const sheet = getLabSheet();
  if (!sheet) return null;

  let valueRange;
  let growthCell;

  if (yearType === "current") {
    valueRange = "AU20:AU23";
    growthCell = "AU24";
  } else if (yearType === "previous") {
    valueRange = "AT20:AT23";
    growthCell = "AT24";
  } else {
    return null;
  }

  const labels = sheet.getRange("AR20:AR23").getValues().flat();
  const values = sheet.getRange(valueRange).getValues().flat();
  const paidGrowth = sheet.getRange(growthCell).getValue();

  const currentYear = new Date().getFullYear();
  const year = yearType === "current" ? currentYear : currentYear - 1;

  const percentages = labels.map((label, i) => [`${year} ${label}`, values[i]]);

  return {
    percentages,
    paidGrowth,
  };
}

function getHourTotals() {
  const sheet = getLabSheet();
  if (!sheet) return null;

  const values = sheet.getRange("AW7:AW9").getValues().flat();

  return {
    daily: values[0],
    monthly: values[1],
    yearly: values[2],
  };
}

function getTargetPercents() {
  const sheet = getLabSheet();
  if (!sheet) return null;

  const values = sheet.getRange("AU29:AU31").getValues().flat();

  return {
    manual: values[0],
    hourly: values[1],
    combined: values[2],
  };
}

function getCurrentYearTargetProgress() {
  const sheet = getLabSheet();
  if (!sheet) return null;

  const values = sheet
    .getRangeList(["AU20", "AU21", "AU24", "AU29:AU31"])
    .getRanges()
    .map((range) => range.getValues());

  return {
    monthAvg: values[0][0][0],
    paidHr: values[1][0][0],
    paidGrowth: values[2][0][0],
    manual: values[3][0][0],
    hourly: values[3][1][0],
    combined: values[3][2][0],
  };
}

function getPreviousYearTargetProgress() {
  const sheet = getLabSheet();
  if (!sheet) return null;

  return {
    monthAvg: sheet.getRange("AT20").getValue(),
    paidHr: sheet.getRange("AT21").getValue(),
    paidGrowth: sheet.getRange("AT24").getValue(),
    manual: sheet.getRange("AU25").getValue(),
    hourly: sheet.getRange("AU26").getValue(),
    combined: sheet.getRange("AU27").getValue(),
  };
}