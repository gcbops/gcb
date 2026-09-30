const Validation = (() => {
  const START_ROW = 3;

  /*
   * ----------------------------------------------------------
   * Basic helpers
   * ----------------------------------------------------------
   */

  function requireObject(value, label = "Data") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`${label} is required.`);
    }

    return value;
  }

  function requiredString(
    value,
    label,
    { maxLength = 500, allowEmpty = false, rejectFormula = true } = {},
  ) {
    const result = String(value ?? "").trim();

    if (!allowEmpty && !result) {
      throw new Error(`${label} is required.`);
    }

    if (result.length > maxLength) {
      throw new Error(`${label} must not exceed ${maxLength} characters.`);
    }

    if (rejectFormula && result) {
      rejectFormulaText(result, label);
    }

    return result;
  }

  function optionalString(
    value,
    label,
    { maxLength = 500, rejectFormula = true } = {},
  ) {
    return requiredString(value, label, {
      maxLength,
      allowEmpty: true,
      rejectFormula,
    });
  }

  function rejectFormulaText(value, label = "Value") {
    const text = String(value ?? "").trim();

    if (!text) {
      return text;
    }

    if (/^[=+\-@]/.test(text)) {
      throw new Error(
        `${label} contains an invalid spreadsheet formula or expression.`,
      );
    }

    return text;
  }

  function number(value, label, { min = -Infinity, max = Infinity } = {}) {
    if (value === "" || value === null || value === undefined) {
      throw new Error(`${label} is required.`);
    }

    const result = Number(value);

    if (!Number.isFinite(result)) {
      throw new Error(`${label} must be a valid number.`);
    }

    if (result < min) {
      throw new Error(`${label} must be at least ${min}.`);
    }

    if (result > max) {
      throw new Error(`${label} must not exceed ${max}.`);
    }

    return result;
  }

  function integer(value, label, { min = -Infinity, max = Infinity } = {}) {
    const result = number(value, label, {
      min,
      max,
    });

    if (!Number.isInteger(result)) {
      throw new Error(`${label} must be a whole number.`);
    }

    return result;
  }

  function action(value, label = "Action") {
    const result = requiredString(value, label, {
      maxLength: 20,
    }).toLowerCase();

    if (result !== "update" && result !== "delete") {
      throw new Error(`Invalid ${label.toLowerCase()}.`);
    }

    return result;
  }

  function enumValue(value, label, allowedValues) {
    if (!allowedValues.includes(value)) {
      throw new Error(`Invalid ${label}.`);
    }

    return value;
  }
  
  function sheetName(value, label = "Sheet name", { maxLength = 100 } = {}) {
    const result = String(value ?? "").trim();

    if (!result) {
      throw new Error(`${label} is required.`);
    }

    if (result.length > maxLength) {
      throw new Error(`${label} must not exceed ${maxLength} characters.`);
    }

    if (/[:\\/?*[\]]/.test(result)) {
      throw new Error(
        `${label} contains characters that are not allowed in a sheet name.`,
      );
    }

    rejectFormulaText(result, label);

    return result;
  }

  function sanitizeSheetName(name) {
    return String(name ?? "")
      .trim()
      .replace(/[\[\]*?\/\\:]/g, "-")
      .substring(0, 100)
      .trim();
  }

  function cellReference(value, label = "Cell reference") {
    const result = String(value ?? "")
      .trim()
      .toUpperCase();

    if (!result) {
      throw new Error(`${label} is required.`);
    }

    if (!/^[A-Z]+[1-9][0-9]*$/.test(result)) {
      throw new Error(`${label} is invalid. Example: B39 or AB25.`);
    }

    return result;
  }

  function formula(value, label = "Formula", { maxLength = 5000 } = {}) {
    const result = String(value ?? "").trim();

    if (!result) {
      throw new Error(`${label} is required.`);
    }

    if (result.length > maxLength) {
      throw new Error(`${label} must not exceed ${maxLength} characters.`);
    }

    if (!result.startsWith("=")) {
      throw new Error(`${label} must be a valid Google Sheets formula.`);
    }

    return result;
  }

  function email(value, label = "Email") {
    const result = String(value ?? "").trim();

    if (!result) {
      throw new Error(`${label} is required.`);
    }

    if (result.length > 254) {
      throw new Error(`${label} is too long.`);
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) {
      throw new Error(`${label} is invalid.`);
    }

    return result;
  }

  function discordWebhook(value, label = "Discord webhook") {
    const result = String(value ?? "").trim();

    if (!result) {
      throw new Error(`${label} is required.`);
    }

    if (
      !result.startsWith("https://discord.com/api/webhooks/") &&
      !result.startsWith("https://discordapp.com/api/webhooks/")
    ) {
      throw new Error(`${label} is invalid.`);
    }

    return result;
  }

  function spreadsheetId(value, label = "Spreadsheet ID") {
    const result = String(value ?? "").trim();

    if (!result) {
      throw new Error(`${label} is required.`);
    }

    if (!/^[a-zA-Z0-9_-]{20,}$/.test(result)) {
      throw new Error(`${label} is invalid.`);
    }

    return result;
  }

  function driveFolderId(value, label = "Drive folder ID") {
    const result = String(value ?? "").trim();

    if (!result) {
      throw new Error(`${label} is required.`);
    }

    if (!/^[a-zA-Z0-9_-]{10,}$/.test(result)) {
      throw new Error(`${label} is invalid.`);
    }

    return result;
  }

  return {
    requireObject,
    requiredString,
    optionalString,
    rejectFormulaText,
    number,
    integer,
    action,
    enumValue,
    sheetName,
    sanitizeSheetName,
    cellReference,
    formula,
    email,
    discordWebhook,
    spreadsheetId,
    driveFolderId,

    START_ROW,
  };
})();
