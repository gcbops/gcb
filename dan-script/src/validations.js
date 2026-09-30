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

  function sheetName(value, label = "Sheet name", { maxLength = 100 } = {}) {
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

    if (/[:\\/?*[\]]/.test(result)) {
      return {
        valid: false,
        message: `${label} contains characters that are not allowed in a sheet name.`,
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

  function sanitizeSheetName(name) {
    return String(name ?? "")
      .trim()
      .replace(/\[|\]|\*|\?|\/|\\|:/g, "-")
      .substring(0, 100)
      .trim();
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

  function cellReference(value, label = "Cell reference") {
    const result = String(value ?? "")
      .trim()
      .toUpperCase();

    if (!result) {
      return {
        valid: false,
        message: `${label} is required.`,
      };
    }

    if (!/^[A-Z]+[1-9][0-9]*$/.test(result)) {
      return {
        valid: false,
        message: `${label} is invalid. Example: B39 or AB25.`,
      };
    }

    return {
      valid: true,
      value: result,
    };
  }

  function formula(value, label = "Formula", { maxLength = 5000 } = {}) {
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

    if (!result.startsWith("=")) {
      return {
        valid: false,
        message: `${label} must be a valid Google Sheets formula.`,
      };
    }

    return {
      valid: true,
      value: result,
    };
  }

  function email(value, label = "Email") {
    const result = String(value ?? "").trim();

    if (!result) {
      return {
        valid: false,
        message: `${label} is required.`,
      };
    }

    if (result.length > 254) {
      return {
        valid: false,
        message: `${label} is too long.`,
      };
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) {
      return {
        valid: false,
        message: `${label} is invalid.`,
      };
    }

    return {
      valid: true,
      value: result,
    };
  }

  function discordWebhook(value, label = "Discord webhook") {
    const result = String(value ?? "").trim();

    if (!result) {
      return {
        valid: false,
        message: `${label} is required.`,
      };
    }

    if (
      !result.startsWith("https://discord.com/api/webhooks/") &&
      !result.startsWith("https://discordapp.com/api/webhooks/")
    ) {
      return {
        valid: false,
        message: `${label} is invalid.`,
      };
    }

    return {
      valid: true,
      value: result,
    };
  }

  function spreadsheetId(value, label = "Spreadsheet ID") {
    const result = String(value ?? "").trim();

    if (!result) {
      return {
        valid: false,
        message: `${label} is required.`,
      };
    }

    if (!/^[a-zA-Z0-9_-]{20,}$/.test(result)) {
      return {
        valid: false,
        message: `${label} is invalid.`,
      };
    }

    return {
      valid: true,
      value: result,
    };
  }

  function driveFolderId(value, label = "Drive folder ID") {
    const result = String(value ?? "").trim();

    if (!result) {
      return {
        valid: false,
        message: `${label} is required.`,
      };
    }

    if (!/^[a-zA-Z0-9_-]{10,}$/.test(result)) {
      return {
        valid: false,
        message: `${label} is invalid.`,
      };
    }

    return {
      valid: true,
      value: result,
    };
  }

  return {
    requiredString,
    sheetName,
    sanitizeSheetName,
    number,
    cellReference,
    formula,
    email,
    discordWebhook,
    spreadsheetId,
    driveFolderId,
  };
})();

export { ValidationModule };
