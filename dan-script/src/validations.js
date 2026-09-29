const ValidationModule = (() => {

  function requiredString(value, label, { maxLength = 500 } = {}) {
    const result = String(value ?? "").trim();

    if (!result) {
      return {
        valid: false,
        message: `${label} is required.`,
      };
    }

    if (result.length > maxLength) {
      return {
        valid: false,
        message: `${label} must not exceed ${maxLength} characters.`,
      };
    }

    if (/^[=+\-@]/.test(result)) {
      return {
        valid: false,
        message: `${label} contains an invalid spreadsheet expression.`,
      };
    }

    return {
      valid: true,
      value: result,
    };
  }

  function number(value, label, { min = -Infinity, max = Infinity } = {}) {
    if (value === "" || value === null || value === undefined) {
      return {
        valid: false,
        message: `${label} is required.`,
      };
    }

    const result = Number(value);

    if (!Number.isFinite(result)) {
      return {
        valid: false,
        message: `${label} must be a valid number.`,
      };
    }

    if (result < min) {
      return {
        valid: false,
        message: `${label} must be at least ${min}.`,
      };
    }

    if (result > max) {
      return {
        valid: false,
        message: `${label} must not exceed ${max}.`,
      };
    }

    return {
      valid: true,
      value: result,
    };
  }

  return {
    requiredString,
    number,
  };
})();

export { ValidationModule };
