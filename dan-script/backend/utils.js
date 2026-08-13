function logResponse(message, title = "Notice") {
  const text = `${title}: ${message}`;

  console.log(text);

  return {
    success: false,
    message: text,
  };
}

function formatDateSafe(date, format = "M/d/yyyy") {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return "";
  }

  return Utilities.formatDate(date, Session.getScriptTimeZone(), format);
}

function normalizeText(value) {
  return value == null ? "" : String(value).trim().toLowerCase();
}

function clearRange(sheet, rangeA1) {
  sheet.getRange(rangeA1).clearContent();
}

function isValidNumber(value) {
  return !isNaN(parseFloat(value)) && isFinite(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function isValidDate(value) {
  const date = value instanceof Date ? value : new Date(value);

  return date instanceof Date && !isNaN(date);
}

function toDate(value) {
  return isValidDate(value)
    ? value instanceof Date
      ? value
      : new Date(value)
    : new Date();
}

function getCleanValues(range) {
  return range.getValues().flat().filter(isNonEmptyString);
}

function logWithTime(message) {
  const timestamp = formatDateSafe(new Date(), "yyyy-MM-dd HH:mm:ss");

  logResponse(`[${timestamp}] ${message}`);
}

function maskSecret(value, visibleChars = 5) {
  if (!value) {
    return "";
  }

  const str = String(value);

  if (str.length <= visibleChars) {
    return "*".repeat(str.length);
  }

  return (
    str.slice(0, visibleChars) +
    "*".repeat(Math.min(str.length - visibleChars, 20))
  );
}