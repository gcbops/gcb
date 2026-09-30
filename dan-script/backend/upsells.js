function addUpsellEntry(data) {
  // requireAuthorizedUser();

  Validation.requireObject(data, "Upsell data");

  const clientName = Validation.requiredString(data.clientName, "Client name", {
    maxLength: 100,
  });

  const screenshot = Validation.optionalString(data.screenshot, "Screenshot", {
    maxLength: 500,
  });

  const upsellHours = Validation.number(data.upsellHours, "Upsell hours", {
    min: Number.EPSILON,
  });

  let totalHours = "";

  if (
    data.totalHours !== "" &&
    data.totalHours !== null &&
    data.totalHours !== undefined
  ) {
    totalHours = Validation.number(data.totalHours, "Orasan hours", {
      min: Number.EPSILON,
    });
  }

  const orasanDate = Validation.optionalString(data.orasanDate, "Orasan date", {
    maxLength: 100,
  });

  const reportedDate = Validation.requiredString(
    data.reportedDate,
    "Reported date",
    { maxLength: 100 },
  );

  const sheet = getSheetSafe("Upsells");

  if (!sheet) {
    throw new Error('Sheet "Upsells" not found.');
  }

  const startRow = 21;
  const values = sheet.getRange(`A${startRow}:A`).getValues().flat();

  const emptyIndex = values.findIndex((value) => !value);

  const nextRow =
    emptyIndex >= 0 ? startRow + emptyIndex : sheet.getLastRow() + 1;

  const rowData = [
    clientName,
    screenshot,
    upsellHours,
    totalHours,
    orasanDate,
    reportedDate,
  ];

  sheet.getRange(nextRow, 1, 1, rowData.length).setValues([rowData]);

  return `Added upsell entry for ${clientName}`;
}

function getUpsellSummary() {
  try {
    const sheet = getSheetSafe("Upsells");

    if (!sheet) {
      throw new Error('Sheet "Upsells" not found.');
    }

    const getNumber = (range) => Number(sheet.getRange(range).getValue()) || 0;

    return {
      total: getNumber("A2"),
      today: getNumber("A4"),
      month: getNumber("A6"),
    };
  } catch (err) {
    logResponse(`⚠️ getUpsellSummary error: ${err.message}`);

    return {
      total: 0,
      today: 0,
      month: 0,
    };
  }
}

function getUpsellRecords() {
  try {
    const sheet = getSheetSafe("Upsells");

    if (!sheet) {
      throw new Error('Sheet "Upsells" not found.');
    }

    const startRow = 21;
    const lastRow = sheet.getLastRow();

    if (lastRow < startRow) {
      return [];
    }

    const numRows = lastRow - startRow + 1;

    const data = sheet.getRange(startRow, 1, numRows, 6).getValues();

    return data
      .filter((row) => isNonEmptyString(row[0]))
      .map((row) => [
        row[0], // Client
        row[2], // Upsell Hours
        formatDateSafe(row[4], "MM/dd/yyyy") || row[4],
      ]);
  } catch (err) {
    logResponse(`⚠️ getUpsellRecords error: ${err.message}`);

    return [];
  }
}
