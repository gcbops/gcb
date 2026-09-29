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

  /*
   * ----------------------------------------------------------
   * Public API
   * ----------------------------------------------------------
   */

  return {
    requireObject,
    requiredString,
    optionalString,
    rejectFormulaText,
    number,
    integer,
    action,

    START_ROW,
  };
})();
