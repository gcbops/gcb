function getLabSheet(sessionId, signature) {
  // Manager-aware path for authenticated requests.
  if (sessionId && signature) {
    const workspace = getManagerWorkspaceForCapability_(
      sessionId,
      signature,
      "hours.view",
    );

    return workspace?.spreadsheet?.getSheetByName("Lab 3.0") || null;
  }

  // Preserve existing legacy callers.
  return getSheetSafe("Lab 3.0");
}

function getLabCell(cellRange, sessionId, signature) {
  const sheet = getLabSheet(sessionId, signature);

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
