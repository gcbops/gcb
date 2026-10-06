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





