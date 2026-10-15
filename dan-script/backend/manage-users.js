/**
 * Manage Users — admin-only backend.
 * Uses the existing AUTHORIZED_USERS sheet and GCB session properties.
 */

const MANAGE_USERS_SHEET_NAME = "AUTHORIZED_USERS";
const MANAGE_USERS_SESSION_PREFIX = "GCB_SESSION_RECORD_";

const MANAGE_USERS_ROLE_OPTIONS = ["admin", "workforce", "staff"];

const MANAGE_USERS_CAPABILITY_OPTIONS = [
  "*",
  "settings.manage",
  // Add other capabilities defined by your existing GCB authorization system.
];

/**
 * Every public endpoint must independently enforce admin access.
 */
function requireManageUsersAdmin_(sessionId, signature) {
  return requireRole(sessionId, signature, "admin");
}

function getManageUsersSheet_() {
  const sheet = getSheetSafe(MANAGE_USERS_SHEET_NAME);

  if (!sheet) {
    throw new Error(
      'Manage Users could not find the "' +
        MANAGE_USERS_SHEET_NAME +
        '" sheet.',
    );
  }

  const values = sheet.getDataRange().getValues();

  if (!values.length) {
    throw new Error("AUTHORIZED_USERS has no header row.");
  }

  const headers = values[0].map(function (header) {
    return String(header).trim().toLowerCase();
  });

  const requiredHeaders = [
    "email",
    "google sub",
    "enabled",
    "role",
    "capabilities",
    "notes",
  ];

  const columns = {};

  requiredHeaders.forEach(function (header) {
    const index = headers.indexOf(header);

    if (index === -1) {
      throw new Error(
        'AUTHORIZED_USERS is missing the "' + header + '" column.',
      );
    }

    columns[header] = index;
  });

  return {
    sheet: sheet,
    values: values,
    columns: columns,
  };
}

function manageUsersIsEnabled_(value) {
  return (
    value === true ||
    String(value).trim().toLowerCase() === "true" ||
    String(value).trim() === "1"
  );
}

function manageUsersGetOnlineEmails_() {
  const properties = PropertiesService.getScriptProperties().getProperties();

  const now = Date.now();
  const onlineEmails = new Set();

  Object.keys(properties).forEach(function (key) {
    if (key.indexOf(MANAGE_USERS_SESSION_PREFIX) !== 0) {
      return;
    }

    try {
      const record = JSON.parse(properties[key]);

      if (!record || typeof record !== "object") {
        return;
      }

      // Support common field names while keeping session IDs private.
      const email = String(
        record.email ||
          record.userEmail ||
          (record.user && record.user.email) ||
          "",
      )
        .trim()
        .toLowerCase();

      const expiresAt = record.expiresAt;
      const expiry =
        typeof expiresAt === "number" ? expiresAt : Date.parse(expiresAt);

      if (email && Number.isFinite(expiry) && expiry > now) {
        onlineEmails.add(email);
      }
    } catch (error) {
      // Ignore malformed session records.
    }
  });

  return onlineEmails;
}

/**
 * Returns users and summary counts.
 * Google Sub and session data are never returned to the frontend.
 */
function getManageUsersData(sessionId, signature) {
  requireManageUsersAdmin_(sessionId, signature);

  const data = getManageUsersSheet_();
  const c = data.columns;
  const onlineEmails = manageUsersGetOnlineEmails_();

  const users = data.values
    .slice(1)
    .map(function (row, index) {
      const email = String(row[c.email] || "").trim();

      if (!email) {
        return null;
      }

      return {
        rowNumber: index + 2,
        email: email,
        enabled: manageUsersIsEnabled_(row[c.enabled]),
        role: String(row[c.role] || "").trim(),
        capabilities: String(row[c.capabilities] || "")
          .split(",")
          .map(function (item) {
            return item.trim();
          })
          .filter(Boolean),
        notes: String(row[c.notes] || ""),
        online: onlineEmails.has(email.toLowerCase()),
      };
    })
    .filter(Boolean);

  return {
    users: users,
    summary: {
      total: users.length,
      enabled: users.filter(function (user) {
        return user.enabled;
      }).length,
      disabled: users.filter(function (user) {
        return !user.enabled;
      }).length,
      online: users.filter(function (user) {
        return user.online;
      }).length,
    },
  };
}

/**
 * Supplies Select2 options. Existing sheet values are included so
 * existing roles/capabilities are not accidentally omitted.
 */
function getManageUserOptions(sessionId, signature) {
  requireManageUsersAdmin_(sessionId, signature);

  const data = getManageUsersSheet_();
  const c = data.columns;

  const roles = new Set(MANAGE_USERS_ROLE_OPTIONS);
  const capabilities = new Set(MANAGE_USERS_CAPABILITY_OPTIONS);

  data.values.slice(1).forEach(function (row) {
    const role = String(row[c.role] || "").trim();

    if (role) {
      roles.add(role);
    }

    String(row[c.capabilities] || "")
      .split(",")
      .map(function (item) {
        return item.trim();
      })
      .filter(Boolean)
      .forEach(function (item) {
        capabilities.add(item);
      });
  });

  return {
    roles: Array.from(roles).sort(),
    capabilities: Array.from(capabilities).sort(),
  };
}

/**
 * Updates one existing user row.
 *
 * payload: {
 *   email, enabled, role, capabilities: [], notes
 * }
 *
 * Email is used to locate the row; callers cannot choose a sheet row,
 * change another user's email, or modify Google Sub.
 */
function updateManagedUser(sessionId, signature, payload) {
  requireManageUsersAdmin_(sessionId, signature);

  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid user update.");
  }

  const email = String(payload.email || "")
    .trim()
    .toLowerCase();
  const role = String(payload.role || "").trim();
  const enabled = payload.enabled === true;
  const notes = String(payload.notes || "").trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("A valid user email is required.");
  }

  if (!role || !MANAGE_USERS_ROLE_OPTIONS.includes(role)) {
    // Allow roles already in use by existing rows.
    const options = getManageUserOptions(sessionId, signature);

    if (!options.roles.includes(role)) {
      throw new Error("Invalid role selected.");
    }
  }

  if (notes.length > 1000) {
    throw new Error("Notes cannot exceed 1000 characters.");
  }

  if (!Array.isArray(payload.capabilities)) {
    throw new Error("Capabilities must be a list.");
  }

  const capabilities = Array.from(
    new Set(
      payload.capabilities
        .map(function (item) {
          return String(item || "").trim();
        })
        .filter(Boolean),
    ),
  );

  const options = getManageUserOptions(sessionId, signature);

  capabilities.forEach(function (capability) {
    if (!options.capabilities.includes(capability)) {
      throw new Error("Invalid capability selected: " + capability);
    }
  });

  // "*" is an unrestricted capability; do not combine it with others.
  if (capabilities.includes("*") && capabilities.length > 1) {
    throw new Error(
      'The "*" capability cannot be combined with other capabilities.',
    );
  }

  const data = getManageUsersSheet_();
  const c = data.columns;
  const matchingRows = [];

  data.values.slice(1).forEach(function (row, index) {
    if (
      String(row[c.email] || "")
        .trim()
        .toLowerCase() === email
    ) {
      matchingRows.push({
        rowNumber: index + 2,
        row: row,
      });
    }
  });

  if (matchingRows.length !== 1) {
    throw new Error(
      matchingRows.length
        ? "Duplicate email rows were found. Resolve them before editing."
        : "User not found.",
    );
  }

  const target = matchingRows[0];
  const currentEnabled = manageUsersIsEnabled_(target.row[c.enabled]);
  const currentRole = String(target.row[c.role] || "").trim();

  const removesAdminAccess =
    currentEnabled && currentRole === "admin" && (!enabled || role !== "admin");

  if (removesAdminAccess) {
    const enabledAdmins = data.values.slice(1).filter(function (row) {
      return (
        manageUsersIsEnabled_(row[c.enabled]) &&
        String(row[c.role] || "").trim() === "admin"
      );
    });

    if (enabledAdmins.length <= 1) {
      throw new Error("The last enabled admin cannot be disabled or demoted.");
    }
  }

  // Preserve unrelated columns and Google Sub.
  const updatedRow = target.row.slice();
  updatedRow[c.enabled] = enabled;
  updatedRow[c.role] = role;
  updatedRow[c.capabilities] = capabilities.join(", ");
  updatedRow[c.notes] = notes;

  data.sheet
    .getRange(target.rowNumber, 1, 1, updatedRow.length)
    .setValues([updatedRow]);

  return {
    success: true,
    message: "User access settings updated.",
    data: getManageUsersData(sessionId, signature),
  };
}
