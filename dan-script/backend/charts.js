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
