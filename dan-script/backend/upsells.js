function addUpsellEntry(data) {
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
    data.clientName || "",
    data.screenshot || "",
    Number(data.upsellHours) || "",
    Number(data.totalHours) || "",
    data.orasanDate || "",
    data.reportedDate || "",
  ];

  sheet.getRange(nextRow, 1, 1, rowData.length).setValues([rowData]);

  return `✅ Added upsell entry for ${data.clientName || "Unknown Client"}`;
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
