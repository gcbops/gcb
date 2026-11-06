const GCB_ADMIN_REGISTRY_PROPERTY = "MANAGER_REGISTRY_SPREADSHEET_ID";

const GCB_ADMIN_SHEETS = {
  AUTHORIZED_USERS: "AUTHORIZED_USERS",
  MANAGERS: "Managers",
  AUDIT_LOG: "Audit_Log",
};

const GCB_ADMIN_AUDIT_HEADERS = [
  "Timestamp",
  "Actor Email",
  "Actor Role",
  "Action",
  "Target Manager ID",
  "Target Email",
  "Resource Type",
  "Resource ID",
  "Outcome",
  "Details",
  "Request ID",
];

/**
 * Validates an authenticated GCB session and requires admin role.
 *
 * The session identity and role are always resolved by the backend.
 * Never accept an email, role, or capability from the frontend here.
 */
function requireAdminSession_(sessionId, signature) {
  const session = requireAuthenticatedUser(sessionId, signature);

  const email = String(session.email || "")
    .trim()
    .toLowerCase();
  const googleSub = String(session.googleSub || "").trim();
  const role = String(session.role || "")
    .trim()
    .toLowerCase();

  if (!email || !googleSub) {
    throw new Error("A valid administrator identity is required.");
  }

  if (role !== "admin") {
    throw new Error("Administrator access is required.");
  }

  return session;
}

/**
 * Returns the central GCB Admin & Manager Registry spreadsheet.
 */
function getAdminRegistrySpreadsheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty(
    GCB_ADMIN_REGISTRY_PROPERTY,
  );

  if (!spreadsheetId) {
    throw new Error("MANAGER_REGISTRY_SPREADSHEET_ID is not configured.");
  }

  try {
    return openSpreadsheetById(spreadsheetId);
  } catch (error) {
    console.error(
      "[GCB Admin] Failed to open central registry:",
      error?.message || error,
    );

    throw new Error("The central GCB registry is currently unavailable.");
  }
}

/**
 * Returns enabled manager records from the central registry.
 * Operational spreadsheet IDs are read only from the trusted registry.
 */
function getAdminDashboardManagers_() {
  const registryId = PropertiesService.getScriptProperties()
    .getProperty("MANAGER_REGISTRY_SPREADSHEET_ID");

  if (!registryId) {
    throw new Error("Manager registry spreadsheet ID is not configured.");
  }

  const registrySS = SpreadsheetApp.openById(registryId);
  const managersSheet = registrySS.getSheetByName("Managers");

  if (!managersSheet) {
    throw new Error('The registry is missing the "Managers" sheet.');
  }

  const values = managersSheet.getDataRange().getValues();

  if (values.length < 2) return [];

  const headers = values[0].map((header) => String(header).trim());
  const column = {
    managerId: headers.indexOf("Manager ID"),
    managerName: headers.indexOf("Manager Name"),
    enabled: headers.indexOf("Enabled"),
    spreadsheetId: headers.indexOf("Operational Spreadsheet ID"),
  };

  const missingHeaders = Object.entries(column)
    .filter(([, index]) => index === -1)
    .map(([name]) => name);

  if (missingHeaders.length) {
    throw new Error(
      `Managers sheet is missing required columns: ${missingHeaders.join(", ")}`,
    );
  }

  return values.slice(1)
    .filter((row) => {
      const enabled = row[column.enabled];

      return (
        enabled === true ||
        String(enabled).trim().toUpperCase() === "TRUE"
      );
    })
    .map((row) => ({
      managerId: String(row[column.managerId] || "").trim(),
      managerName: String(row[column.managerName] || "").trim(),
      spreadsheetId: String(row[column.spreadsheetId] || "").trim(),
    }))
    .filter((manager) =>
      manager.managerId &&
      manager.managerName &&
      manager.spreadsheetId
    );
}

/**
 * Returns a required sheet from the central registry.
 */
function getAdminRegistrySheet_(sheetName) {
  const spreadsheet = getAdminRegistrySpreadsheet_();
  const sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(`The central registry sheet "${sheetName}" was not found.`);
  }

  return sheet;
}

/**
 * Returns the AUTHORIZED_USERS sheet.
 */
function getAdminAuthorizedUsersSheet_() {
  return getAdminRegistrySheet_(GCB_ADMIN_SHEETS.AUTHORIZED_USERS);
}

/**
 * Returns the Managers sheet.
 */
function getAdminManagersSheet_() {
  return getAdminRegistrySheet_(GCB_ADMIN_SHEETS.MANAGERS);
}

/**
 * Returns the Audit_Log sheet.
 */
function getAdminAuditLogSheet_() {
  return getAdminRegistrySheet_(GCB_ADMIN_SHEETS.AUDIT_LOG);
}

/**
 * Records an administrative action in the central Audit_Log sheet.
 *
 * Call this after releasing any ScriptLock used by the main mutation.
 * This helper obtains its own lock to protect concurrent audit appends.
 */
function recordAdminAuditLog_(session, entry = {}) {
  if (!session?.email || !session?.googleSub) {
    throw new Error(
      "A valid administrator session is required for audit logging.",
    );
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    throw new Error("The admin audit log is busy. Please try again.");
  }

  try {
    const sheet = getAdminAuditLogSheet_();
    const lastColumn = Math.max(sheet.getLastColumn(), 1);

    const headers = sheet
      .getRange(1, 1, 1, lastColumn)
      .getValues()[0]
      .map((header) => String(header || "").trim());

    const missingHeaders = GCB_ADMIN_AUDIT_HEADERS.filter(
      (header) => !headers.includes(header),
    );

    if (missingHeaders.length) {
      throw new Error(
        `Audit_Log is missing required columns: ${missingHeaders.join(", ")}`,
      );
    }

    const timestamp = new Date();

    const valuesByHeader = {
      Timestamp: timestamp,
      "Actor Email": String(session.email || "")
        .trim()
        .toLowerCase(),
      "Actor Role": String(session.role || "").trim(),
      Action: String(entry.action || "").trim(),
      "Target Manager ID": String(entry.targetManagerId || "").trim(),
      "Target Email": String(entry.targetEmail || "")
        .trim()
        .toLowerCase(),
      "Resource Type": String(entry.resourceType || "").trim(),
      "Resource ID": String(entry.resourceId || "").trim(),
      Outcome: String(entry.outcome || "SUCCESS")
        .trim()
        .toUpperCase(),
      Details: String(entry.details || "")
        .trim()
        .slice(0, 2000),
      "Request ID": String(entry.requestId || "").trim(),
    };

    const row = headers.map((header) => valuesByHeader[header] ?? "");

    sheet.appendRow(row);

    return true;
  } finally {
    lock.releaseLock();
  }
}

/* =========================================================
   ADMIN — READ-ONLY ENDPOINTS
   ========================================================= */

/**
 * Reads a registry sheet and converts its rows into objects
 * using the sheet's header names.
 */
function getAdminRegistryRecords_(sheetName, requiredHeaders) {
  const sheet = getAdminRegistrySheet_(sheetName);
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (lastColumn < 1) {
    throw new Error(`The "${sheetName}" sheet has no headers.`);
  }

  const headers = sheet
    .getRange(1, 1, 1, lastColumn)
    .getValues()[0]
    .map((header) => String(header || "").trim());

  const missingHeaders = requiredHeaders.filter(
    (header) => !headers.includes(header),
  );

  if (missingHeaders.length) {
    throw new Error(
      `"${sheetName}" is missing required columns: ${missingHeaders.join(", ")}`,
    );
  }

  if (lastRow < 2) {
    return [];
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();

  return rows.flatMap((row, index) => {
    const hasData = row.some((value) => value !== "" && value !== null);

    if (!hasData) return [];

    const record = {};

    headers.forEach((header, columnIndex) => {
      if (header) {
        record[header] = row[columnIndex];
      }
    });

    // Preserve the actual spreadsheet row number.
    record._rowNumber = index + 2;

    return [record];
  });
}

/**
 * Converts spreadsheet values into JSON-safe values.
 */
function serializeAdminValue_(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
}

/**
 * Normalizes a registry Enabled value.
 */
function isAdminRecordEnabled_(value) {
  return (
    value === true ||
    String(value || "")
      .trim()
      .toLowerCase() === "true"
  );
}

/**
 * Returns manager records from the central registry.
 *
 * Does not open or modify manager operational spreadsheets.
 */
function getAdminManagers(sessionId, signature) {
  requireAdminSession_(sessionId, signature);

  const records = getAdminRegistryRecords_(GCB_ADMIN_SHEETS.MANAGERS, [
    "Manager ID",
    "Manager Name",
    "Login Email",
    "Enabled",
    "Operational Spreadsheet ID",
    "External Sheets Folder ID",
    "Backup Folder ID",
    "Reports Folder ID",
  ]);

  const managers = records.map((record) => ({
    managerId: String(record["Manager ID"] || "").trim(),
    managerName: String(record["Manager Name"] || "").trim(),
    email: String(record["Login Email"] || "")
      .trim()
      .toLowerCase(),
    enabled: isAdminRecordEnabled_(record["Enabled"]),
    spreadsheetId: String(record["Operational Spreadsheet ID"] || "").trim(),
    externalSheetsFolderId: String(
      record["External Sheets Folder ID"] || "",
    ).trim(),
    backupFolderId: String(record["Backup Folder ID"] || "").trim(),
    reportsFolderId: String(record["Reports Folder ID"] || "").trim(),
    notes: String(record["Notes"] || "").trim(),
    createdAt: serializeAdminValue_(record["Created At"] || ""),
    updatedAt: serializeAdminValue_(record["Updated At"] || ""),
    rowNumber: record._rowNumber,
  }));

  return {
    success: true,
    managers,
    total: managers.length,
    enabledCount: managers.filter((manager) => manager.enabled).length,
    disabledCount: managers.filter((manager) => !manager.enabled).length,
  };
}

/**
 * Returns authorized-user records from the central registry.
 *
 * Google Sub is deliberately excluded from the response.
 */
function getAdminAuthorizedUsers(sessionId, signature) {
  requireAdminSession_(sessionId, signature);

  const records = getAdminRegistryRecords_(GCB_ADMIN_SHEETS.AUTHORIZED_USERS, [
    "Email",
    "Google Sub",
    "Enabled",
    "Role",
    "Capabilities",
    "Notes",
  ]);

  const onlineEmails = getAdminOnlineUserEmails_();

  const users = records.map((record) => {
    const email = String(record["Email"] || "").trim();
    const enabled = isAdminRecordEnabled_(record["Enabled"]);

    return {
      email,
      enabled,
      role: String(record["Role"] || "").trim(),
      capabilities: String(record["Capabilities"] || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      notes: String(record["Notes"] || ""),
      online: enabled && onlineEmails.has(email.toLowerCase()),
      rowNumber: record._rowNumber,
    };
  });

  return {
    success: true,
    users,
    total: users.length,
    enabledCount: users.filter((user) => user.enabled).length,
    disabledCount: users.filter((user) => !user.enabled).length,
    onlineCount: users.filter((user) => user.online).length,
    summary: {
      total: users.length,
      enabled: users.filter((user) => user.enabled).length,
      disabled: users.filter((user) => !user.enabled).length,
      online: users.filter((user) => user.online).length,
    },
  };
}

/**
 * Returns audit log records from the central registry.
 *
 * Supported filters:
 * {
 *   actorEmail: "admin@example.com",
 *   action: "UPDATE_MANAGER",
 *   outcome: "SUCCESS",
 *   managerId: "MGR-0001",
 *   targetEmail: "user@example.com",
 *   startDate: "2026-11-01",
 *   endDate: "2026-11-04",
 *   limit: 100
 * }
 */
function getAdminAuditLogs(sessionId, signature, filters = {}) {
  requireAdminSession_(sessionId, signature);

  filters = filters && typeof filters === "object" ? filters : {};

  const records = getAdminRegistryRecords_(
    GCB_ADMIN_SHEETS.AUDIT_LOG,
    GCB_ADMIN_AUDIT_HEADERS,
  );

  const normalize = (value) =>
    String(value || "")
      .trim()
      .toLowerCase();

  const parseFilterDate = (value, endOfDay = false) => {
    if (!value) return null;

    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) {
      throw new Error("An audit log date filter is invalid.");
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    const date = new Date(year, month - 1, day);

    // Reject invalid calendar dates.
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      throw new Error("An audit log date filter is invalid.");
    }

    if (endOfDay) {
      date.setHours(23, 59, 59, 999);
    } else {
      date.setHours(0, 0, 0, 0);
    }

    return date;
  };

  const startDate = parseFilterDate(filters.startDate);
  const endDate = parseFilterDate(filters.endDate, true);

  if (startDate && endDate && startDate > endDate) {
    throw new Error("The audit log start date cannot be after the end date.");
  }

  const requestedLimit = Number(filters.limit);
  const limit =
    Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(Math.floor(requestedLimit), 200)
      : 100;

  const filtered = records.filter((record) => {
    const actorEmail = normalize(record["Actor Email"]);
    const action = normalize(record["Action"]);
    const outcome = normalize(record["Outcome"]);
    const managerId = normalize(record["Target Manager ID"]);
    const targetEmail = normalize(record["Target Email"]);

    if (
      filters.actorEmail &&
      !actorEmail.includes(normalize(filters.actorEmail))
    ) {
      return false;
    }

    if (filters.action && action !== normalize(filters.action)) {
      return false;
    }

    if (filters.outcome && outcome !== normalize(filters.outcome)) {
      return false;
    }

    if (filters.managerId && managerId !== normalize(filters.managerId)) {
      return false;
    }

    if (
      filters.targetEmail &&
      !targetEmail.includes(normalize(filters.targetEmail))
    ) {
      return false;
    }

    const timestamp =
      record["Timestamp"] instanceof Date
        ? record["Timestamp"]
        : new Date(record["Timestamp"]);

    if (!Number.isNaN(timestamp.getTime())) {
      if (startDate && timestamp < startDate) return false;
      if (endDate && timestamp > endDate) return false;
    } else if (startDate || endDate) {
      return false;
    }

    return true;
  });

  // Newest audit records first.
  filtered.sort((a, b) => {
    const dateA = new Date(a["Timestamp"]).getTime() || 0;
    const dateB = new Date(b["Timestamp"]).getTime() || 0;

    return dateB - dateA;
  });

  const total = filtered.length;

  const logs = filtered.slice(0, limit).map((record) => ({
    timestamp: serializeAdminValue_(record["Timestamp"]),
    actorEmail: String(record["Actor Email"] || "").trim(),
    actorRole: String(record["Actor Role"] || "").trim(),
    action: String(record["Action"] || "").trim(),
    targetManagerId: String(record["Target Manager ID"] || "").trim(),
    targetEmail: String(record["Target Email"] || "").trim(),
    resourceType: String(record["Resource Type"] || "").trim(),
    resourceId: String(record["Resource ID"] || "").trim(),
    outcome: String(record["Outcome"] || "").trim(),
    details: String(record["Details"] || "").trim(),
    requestId: String(record["Request ID"] || "").trim(),
  }));

  return {
    success: true,
    logs,
    total,
    returned: logs.length,
    limit,
    hasMore: total > logs.length,
  };
}

/**
 * Returns summary metrics for the Admin dashboard.
 *
 * Counts are based exclusively on central registry records.
 */
function getAdminDashboardData(sessionId, signature) {
  requireAdminSession_(sessionId, signature);

  const managersResult = getAdminManagers(sessionId, signature);
  const usersResult = getAdminAuthorizedUsers(sessionId, signature);

  const auditResult = getAdminAuditLogs(sessionId, signature, { limit: 10 });

  const roleCounts = {};

  usersResult.users.forEach((user) => {
    const role = user.role || "unassigned";
    roleCounts[role] = (roleCounts[role] || 0) + 1;
  });

  return {
    success: true,

    summary: {
      totalManagers: managersResult.total,
      enabledManagers: managersResult.enabledCount,
      disabledManagers: managersResult.disabledCount,

      totalAuthorizedUsers: usersResult.total,
      enabledAuthorizedUsers: usersResult.enabledCount,
      disabledAuthorizedUsers: usersResult.disabledCount,

      usersByRole: roleCounts,
    },

    recentAuditLogs: auditResult.logs,
  };
}

const GCB_ADMIN_USER_ROLE_OPTIONS = ["admin", "manager", "workforce", "staff"];

const GCB_ADMIN_USER_CAPABILITY_OPTIONS = ["*", "settings.manage"];

function getAdminAuthorizedUserOptions(sessionId, signature) {
  requireAdminSession_(sessionId, signature);

  const records = getAdminRegistryRecords_(GCB_ADMIN_SHEETS.AUTHORIZED_USERS, [
    "Email",
    "Google Sub",
    "Enabled",
    "Role",
    "Capabilities",
    "Notes",
  ]);

  const roles = new Set(GCB_ADMIN_USER_ROLE_OPTIONS);
  const capabilities = new Set(GCB_ADMIN_USER_CAPABILITY_OPTIONS);

  records.forEach((record) => {
    const role = String(record.Role || "").trim();

    if (role) roles.add(role);

    String(record.Capabilities || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => capabilities.add(item));
  });

  return {
    success: true,
    roles: Array.from(roles).sort(),
    capabilities: Array.from(capabilities).sort(),
  };
}

const GCB_ADMIN_SESSION_PROPERTY_PREFIX = "GCB_SESSION_RECORD_";

function getAdminOnlineUserEmails_() {
  const properties = PropertiesService.getScriptProperties().getProperties();
  const now = Date.now();
  const onlineEmails = new Set();

  Object.entries(properties).forEach(([key, value]) => {
    if (!key.startsWith(GCB_ADMIN_SESSION_PROPERTY_PREFIX)) return;

    try {
      const record = JSON.parse(value);

      if (!record || typeof record !== "object") return;

      const email = String(
        record.email || record.userEmail || record.user?.email || "",
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

// Allow changing a manager's Enabled status, capabilities, and notes. 
// Keep their role as manager. 
// Synchronize their Enabled value in both AUTHORIZED_USERS and Managers. 
// Update the manager's Updated At timestamp. 
// Don't allow promoting an ordinary account to manager through Edit User, because that would bypass Drive provisioning. 
// Don't allow demoting a manager through this function, because that needs a coordinated manager deactivation/demotion workflow.
function updateAdminAuthorizedUser(sessionId, signature, payload) {
  const session = requireAdminSession_(sessionId, signature);

  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid user update.");
  }

  const email = String(payload.email || "")
    .trim()
    .toLowerCase();

  const role = String(payload.role || "")
    .trim()
    .toLowerCase();

  const enabled = payload.enabled === true;
  const notes = String(payload.notes || "").trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("A valid user email is required.");
  }

  if (!role) {
    throw new Error("A role is required.");
  }

  if (notes.length > 1000) {
    throw new Error("Notes cannot exceed 1000 characters.");
  }

  if (!Array.isArray(payload.capabilities)) {
    throw new Error("Capabilities must be a list.");
  }

  const capabilities = [
    ...new Set(
      payload.capabilities
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  ];

  if (capabilities.includes("*") && capabilities.length > 1) {
    throw new Error(
      'The "*" capability cannot be combined with other capabilities.',
    );
  }

  const options = getAdminAuthorizedUserOptions(sessionId, signature);

  if (!options.roles.includes(role)) {
    throw new Error("Invalid role selected.");
  }

  const invalidCapability = capabilities.find(
    (item) => !options.capabilities.includes(item),
  );

  if (invalidCapability) {
    throw new Error(`Invalid capability selected: ${invalidCapability}`);
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    throw new Error("User management is busy. Please try again.");
  }

  let previousUser;
  let managerUpdate = null;

  try {
    const sheet = getAdminAuthorizedUsersSheet_();
    const values = sheet.getDataRange().getValues();

    if (!values.length) {
      throw new Error("AUTHORIZED_USERS has no header row.");
    }

    const headers = values[0].map((item) => String(item || "").trim());

    const requiredHeaders = [
      "Email",
      "Google Sub",
      "Enabled",
      "Role",
      "Capabilities",
      "Notes",
    ];

    const columns = {};

    requiredHeaders.forEach((header) => {
      const index = headers.indexOf(header);

      if (index === -1) {
        throw new Error(`AUTHORIZED_USERS is missing "${header}".`);
      }

      columns[header] = index;
    });

    const matches = [];

    values.slice(1).forEach((row, index) => {
      const rowEmail = String(row[columns.Email] || "")
        .trim()
        .toLowerCase();

      if (rowEmail === email) {
        matches.push({
          rowNumber: index + 2,
          row,
        });
      }
    });

    if (matches.length !== 1) {
      throw new Error(
        matches.length
          ? "Duplicate email records were found. Resolve them before editing."
          : "User not found.",
      );
    }

    const target = matches[0];
    const row = target.row;

    const currentEnabled = isAdminRecordEnabled_(row[columns.Enabled]);

    const currentRole = String(row[columns.Role] || "")
      .trim()
      .toLowerCase();

    // Manager accounts must be created through the provisioning workflow.
    if (role === "manager" && currentRole !== "manager") {
      throw new Error(
        "Manager accounts must be created through Create User so their workspace can be provisioned.",
      );
    }

    // Prevent manager demotion through ordinary user editing.
    if (currentRole === "manager" && role !== "manager") {
      throw new Error(
        "Manager role changes must be handled through manager account management.",
      );
    }

    // Preserve at least one enabled administrator.
    const removesAdminAccess =
      currentEnabled &&
      currentRole === "admin" &&
      (!enabled || role !== "admin");

    if (removesAdminAccess) {
      const enabledAdmins = values.slice(1).filter(
        (item) =>
          isAdminRecordEnabled_(item[columns.Enabled]) &&
          String(item[columns.Role] || "")
            .trim()
            .toLowerCase() === "admin",
      );

      if (enabledAdmins.length <= 1) {
        throw new Error(
          "The last enabled admin cannot be disabled or demoted.",
        );
      }
    }

    previousUser = {
      email,
      googleSub: String(row[columns["Google Sub"]] || "").trim(),
      enabled: currentEnabled,
      role: currentRole,
      capabilities: String(row[columns.Capabilities] || ""),
      notes: String(row[columns.Notes] || ""),
    };

    // Prepare the authorized user update.
    const updatedRow = row.slice();

    updatedRow[columns.Enabled] = enabled;
    updatedRow[columns.Role] = role;
    updatedRow[columns.Capabilities] = capabilities.join(", ");
    updatedRow[columns.Notes] = notes;

    // If this is an existing manager, also update Managers.Enabled.
    if (currentRole === "manager") {
      const managersSheet = getAdminManagersSheet_();
      const managerValues = managersSheet.getDataRange().getValues();

      if (!managerValues.length) {
        throw new Error("Managers has no header row.");
      }

      const managerHeaders = managerValues[0].map((item) =>
        String(item || "").trim(),
      );

      const managerIdColumn = managerHeaders.indexOf("Manager ID");
      const managerEmailColumn = managerHeaders.indexOf("Login Email");
      const managerEnabledColumn = managerHeaders.indexOf("Enabled");
      const managerUpdatedColumn = managerHeaders.indexOf("Updated At");

      if (
        managerIdColumn === -1 ||
        managerEmailColumn === -1 ||
        managerEnabledColumn === -1 ||
        managerUpdatedColumn === -1
      ) {
        throw new Error(
          "Managers is missing Manager ID, Login Email, Enabled, or Updated At.",
        );
      }

      const managerMatches = [];

      managerValues.slice(1).forEach((managerRow, index) => {
        const managerEmail = String(managerRow[managerEmailColumn] || "")
          .trim()
          .toLowerCase();

        if (managerEmail === email) {
          managerMatches.push({
            rowNumber: index + 2,
            row: managerRow,
          });
        }
      });

      if (managerMatches.length !== 1) {
        throw new Error(
          managerMatches.length
            ? "Duplicate manager records were found. Resolve them before editing."
            : "The manager account has no matching Managers registry record.",
        );
      }

      const managerTarget = managerMatches[0];
      const updatedManagerRow = managerTarget.row.slice();

      const previousManagerEnabled = managerTarget.row[managerEnabledColumn];

      const previousManagerUpdatedAt = managerTarget.row[managerUpdatedColumn];

      updatedManagerRow[managerEnabledColumn] = enabled;
      updatedManagerRow[managerUpdatedColumn] = new Date();

      managerUpdate = {
        sheet: managersSheet,
        rowNumber: managerTarget.rowNumber,
        updatedRow: updatedManagerRow,
        previousRow: managerTarget.row.slice(),
        previousEnabled: previousManagerEnabled,
        previousUpdatedAt: previousManagerUpdatedAt,
        managerId: String(managerTarget.row[managerIdColumn] || ""),
      };
    }

    // Update the manager registry first, then AUTHORIZED_USERS.
    // Update both registries with rollback protection.
    try {
      if (managerUpdate) {
        managerUpdate.sheet
          .getRange(
            managerUpdate.rowNumber,
            1,
            1,
            managerUpdate.updatedRow.length,
          )
          .setValues([managerUpdate.updatedRow]);
      }

      sheet
        .getRange(target.rowNumber, 1, 1, updatedRow.length)
        .setValues([updatedRow]);
    } catch (writeError) {
      // Restore AUTHORIZED_USERS.
      try {
        sheet.getRange(target.rowNumber, 1, 1, row.length).setValues([row]);
      } catch (rollbackError) {
        console.error(
          "[GCB Admin] AUTHORIZED_USERS rollback failed:",
          rollbackError,
        );
      }

      // Restore Managers.
      if (managerUpdate) {
        try {
          managerUpdate.sheet
            .getRange(
              managerUpdate.rowNumber,
              1,
              1,
              managerUpdate.previousRow.length,
            )
            .setValues([managerUpdate.previousRow]);
        } catch (rollbackError) {
          console.error("[GCB Admin] Managers rollback failed:", rollbackError);
        }
      }

      throw writeError;
    }
  } finally {
    lock.releaseLock();
  }

  // Revoke existing sessions when an account is disabled or its role changes.
  const shouldRevokeSessions =
    previousUser.googleSub &&
    ((previousUser.enabled && !enabled) || previousUser.role !== role);

  if (shouldRevokeSessions) {
    const revokedCount = revokeGcbSessionsForGoogleSub_(previousUser.googleSub);

    console.log(`[GCB Admin] Revoked ${revokedCount} sessions for ${email}.`);
  }

  // Audit after releasing the mutation lock.
  let auditWarning = "";

  try {
    recordAdminAuditLog_(session, {
      action: "UPDATE_AUTHORIZED_USER",
      targetManagerId: managerUpdate ? managerUpdate.managerId : "",
      targetEmail: email,
      resourceType: "AUTHORIZED_USER",
      resourceId: email,
      outcome: "SUCCESS",
      details: JSON.stringify({
        previous: previousUser,
        updated: {
          email,
          enabled,
          role,
          capabilities,
          notes,
        },
        managerRegistrySynchronized: Boolean(managerUpdate),
      }),
    });
  } catch (error) {
    console.error("[GCB Admin] User update audit failed:", error);

    auditWarning =
      " The user was updated, but the audit entry could not be saved.";
  }

  const result = getAdminAuthorizedUsers(sessionId, signature);

  return {
    success: true,
    message: `User access settings updated.${auditWarning}`,
    data: result,
    auditWarning: Boolean(auditWarning),
  };
}

/**
 * Creates an authorized user in the central AUTHORIZED_USERS registry.
 *
 * New users start with a blank Google Sub.
 * The existing authentication flow binds their Google identity on first login.
 */
/**
 * Creates an authorized user.
 *
 * Manager accounts additionally receive:
 * - Operational Drive folder
 * - External Sheets subfolder
 * - Cloned Manual Sheets spreadsheet
 * - Backup folder
 * - Reports folder
 * - Managers registry record
 */
function createAdminAuthorizedUser(sessionId, signature, payload = {}) {
  const session = requireAdminSession_(sessionId, signature);

  const email = String(payload.email || "").trim().toLowerCase();
  const role = String(payload.role || "").trim().toLowerCase();
  const enabled = payload.enabled !== false;
  const capabilities = Array.isArray(payload.capabilities)
    ? [
        ...new Set(
          payload.capabilities
            .map((item) => String(item || "").trim())
            .filter(Boolean),
        ),
      ]
    : [];

  if (capabilities.includes("*") && capabilities.length > 1) {
    throw new Error(
      'The "*" capability cannot be combined with other capabilities.',
    );
  }

  const availableOptions = getAdminAuthorizedUserOptions(sessionId, signature);

  const invalidCapability = capabilities.find(
    (item) => !availableOptions.capabilities.includes(item),
  );

  if (invalidCapability) {
    throw new Error(`Invalid capability selected: ${invalidCapability}`);
  }

  const notes = String(payload.notes || "").trim();

  if (notes.length > 1000) {
    throw new Error("Notes cannot exceed 1000 characters.");
  }

  const managerName = String(payload.managerName || "").trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Please provide a valid email address.");
  }

  if (!["admin", "manager", "workforce", "staff"].includes(role)) {
    throw new Error("Invalid user role.");
  }

  if (role === "manager" && !managerName) {
    throw new Error("Manager Name is required for manager accounts.");
  }

  if (managerName.length > 100) {
    throw new Error("Manager Name must not exceed 100 characters.");
  }

  const lock = LockService.getScriptLock();
  const createdDriveResources = [];
  let authorizedRowNumber = null;
  let managerRowNumber = null;
  let managerId = "";
  let managerWorkspace = null;

  let result;
  let operationError = null;

  lock.waitLock(30000);

  try {
    const usersSheet = getAdminAuthorizedUsersSheet_();
    const usersValues = usersSheet.getDataRange().getValues();
    const userHeaders = usersValues[0].map(String);

    const userColumn = {};
    userHeaders.forEach((header, index) => {
      userColumn[header.trim()] = index;
    });

    const requiredUserHeaders = [
      "Email",
      "Google Sub",
      "Enabled",
      "Role",
      "Capabilities",
      "Notes",
    ];

    requiredUserHeaders.forEach((header) => {
      if (userColumn[header] === undefined) {
        throw new Error(
          `AUTHORIZED_USERS is missing the "${header}" column.`,
        );
      }
    });

    const existingUser = usersValues.slice(1).some((row) => {
      return String(row[userColumn.Email] || "")
        .trim()
        .toLowerCase() === email;
    });

    if (existingUser) {
      throw new Error("A user with this email address already exists.");
    }

    const userRow = new Array(userHeaders.length).fill("");

    userRow[userColumn.Email] = email;
    userRow[userColumn["Google Sub"]] = "";
    userRow[userColumn.Enabled] = enabled;
    userRow[userColumn.Role] = role;
    userRow[userColumn.Capabilities] = capabilities.join(",");
    userRow[userColumn.Notes] = notes;

    if (role === "manager") {
      const managersSheet = getAdminManagersSheet_();
      const managerValues = managersSheet.getDataRange().getValues();
      const managerHeaders = managerValues[0].map(String);

      const managerColumn = {};
      managerHeaders.forEach((header, index) => {
        managerColumn[header.trim()] = index;
      });

      const requiredManagerHeaders = [
        "Manager ID",
        "Manager Name",
        "Login Email",
        "Enabled",
        "Operational Spreadsheet ID",
        "External Sheets Folder ID",
        "Backup Folder ID",
        "Reports Folder ID",
        "Operational Folder ID",
        "Notes",
        "Created At",
        "Updated At",
      ];

      requiredManagerHeaders.forEach((header) => {
        if (managerColumn[header] === undefined) {
          throw new Error(
            `Managers is missing the "${header}" column.`,
          );
        }
      });

      const existingManager = managerValues.slice(1).some((row) => {
        return String(row[managerColumn["Login Email"]] || "")
          .trim()
          .toLowerCase() === email;
      });

      if (existingManager) {
        throw new Error(
          "A manager record with this email address already exists.",
        );
      }

      // Generate the next manager ID.
      let highestId = 0;

      managerValues.slice(1).forEach((row) => {
        const currentId = String(
          row[managerColumn["Manager ID"]] || "",
        ).trim();

        const match = currentId.match(/^MGR-(\d+)$/i);

        if (match) {
          highestId = Math.max(highestId, Number(match[1]));
        }
      });

      managerId = `MGR-${String(highestId + 1).padStart(4, "0")}`;

      // Read required Drive configuration.
      const properties = PropertiesService.getScriptProperties();

      const operationalRootId = properties.getProperty(
        "MAIN_SHEETS_FOLDER_ID",
      );
      const backupRootId = properties.getProperty(
        "MAIN_BACKUPS_FOLDER_ID",
      );
      const reportsRootId = properties.getProperty(
        "MAIN_REPORTS_FOLDER_ID",
      );
      const templateId = properties.getProperty(
        "MAIN_SHEET_TEMPLATE_ID",
      );

      if (
        !operationalRootId ||
        !backupRootId ||
        !reportsRootId ||
        !templateId
      ) {
        throw new Error(
          "Manager Drive configuration is incomplete. Check MAIN_SHEETS_FOLDER_ID, MAIN_BACKUPS_FOLDER_ID, MAIN_REPORTS_FOLDER_ID, and MAIN_SHEET_TEMPLATE_ID.",
        );
      }

      // Validate the parent folders and template before creating anything.
      const operationalRoot = DriveApp.getFolderById(operationalRootId);
      const backupRoot = DriveApp.getFolderById(backupRootId);
      const reportsRoot = DriveApp.getFolderById(reportsRootId);
      const templateFile = DriveApp.getFileById(templateId);

      if (templateFile.getMimeType() !== MimeType.GOOGLE_SHEETS) {
        throw new Error(
          "MAIN_SHEET_TEMPLATE_ID must reference a Google Sheets spreadsheet.",
        );
      }

      // Folder names.
      const operationalFolderName =
        `${managerId} — ${managerName.toUpperCase()}`;

      const backupFolderName = `${managerId} — Backups`;
      const reportsFolderName = `${managerId} — Reports`;

      // Create operational folder.
      const operationalFolder = operationalRoot.createFolder(
        operationalFolderName,
      );
      createdDriveResources.push(operationalFolder);

      // Create empty External Sheets folder.
      const externalFolder = operationalFolder.createFolder(
        "External Sheets",
      );
      createdDriveResources.push(externalFolder);

      // Create backup folder.
      const backupFolder = backupRoot.createFolder(
        backupFolderName,
      );
      createdDriveResources.push(backupFolder);

      // Create reports folder.
      const reportsFolder = reportsRoot.createFolder(
        reportsFolderName,
      );
      createdDriveResources.push(reportsFolder);

      // Convert the manager name to title case for the spreadsheet filename.
      const spreadsheetName = managerName
        .toLowerCase()
        .replace(/\b\w/g, (character) => character.toUpperCase())
        + " - Manual Sheets";

      // Clone the blank operational template into the manager folder.
      const copiedSpreadsheet = templateFile.makeCopy(
        spreadsheetName,
        operationalFolder,
      );
      createdDriveResources.push(copiedSpreadsheet);

      const spreadsheetId = copiedSpreadsheet.getId();

      // Open and verify the copied operational spreadsheet.
      const managerSpreadsheet = SpreadsheetApp.openById(spreadsheetId);

      // Set the manager account creation date in Lab 3.0!BE15.
      const systemSheet = managerSpreadsheet.getSheetByName("Lab 3.0");

      if (!systemSheet) {
        throw new Error(
          'The manager spreadsheet template is missing the "Lab 3.0" sheet.',
        );
      }

      const creationDate = new Date();

      systemSheet
        .getRange("BE15")
        .setValue(creationDate)
        .setNumberFormat("m/d/yyyy");

      // Build the Managers record using header names.
      const managerRow = new Array(managerHeaders.length).fill("");

      managerRow[managerColumn["Manager ID"]] = managerId;
      managerRow[managerColumn["Manager Name"]] =
        managerName.toUpperCase();
      managerRow[managerColumn["Login Email"]] = email;
      managerRow[managerColumn.Enabled] = enabled;
      managerRow[managerColumn["Operational Spreadsheet ID"]] =
        spreadsheetId;
      managerRow[managerColumn["External Sheets Folder ID"]] =
        externalFolder.getId();
      managerRow[managerColumn["Backup Folder ID"]] =
        backupFolder.getId();
      managerRow[managerColumn["Reports Folder ID"]] =
        reportsFolder.getId();
      managerRow[managerColumn["Operational Folder ID"]] =
        operationalFolder.getId();
      managerRow[managerColumn.Notes] = notes;
      managerRow[managerColumn["Created At"]] = new Date();
      managerRow[managerColumn["Updated At"]] = new Date();

      // Write both registry records.
      managersSheet.appendRow(managerRow);
      managerRowNumber = managersSheet.getLastRow();

      usersSheet.appendRow(userRow);
      authorizedRowNumber = usersSheet.getLastRow();

      managerWorkspace = {
        managerId,
        managerName: managerName.toUpperCase(),
        spreadsheetId,
        operationalFolderId: operationalFolder.getId(),
        externalFolderId: externalFolder.getId(),
        backupFolderId: backupFolder.getId(),
        reportsFolderId: reportsFolder.getId(),
      };

      result = {
        success: true,
        message: "Manager account and workspace created successfully.",
        manager: managerWorkspace,
      };
    } else {
      // Non-manager accounts only need AUTHORIZED_USERS.
      usersSheet.appendRow(userRow);
      authorizedRowNumber = usersSheet.getLastRow();

      result = {
        success: true,
        message: "User account created successfully.",
      };
    }
  } catch (error) {
    operationError = error;

    // Remove any registry rows created by this operation.
    try {
      const managersSheet = getAdminManagersSheet_();

      if (managerRowNumber) {
        managersSheet.deleteRow(managerRowNumber);
      }
    } catch (rollbackError) {
      console.error("Manager registry rollback failed:", rollbackError);
    }

    try {
      const usersSheet = getAdminAuthorizedUsersSheet_();

      if (authorizedRowNumber) {
        usersSheet.deleteRow(authorizedRowNumber);
      }
    } catch (rollbackError) {
      console.error("Authorized user rollback failed:", rollbackError);
    }

    // Remove only resources created by this operation.
    createdDriveResources.reverse().forEach((resource) => {
      try {
        resource.setTrashed(true);
      } catch (rollbackError) {
        console.error("Drive rollback failed:", rollbackError);
      }
    });
  } finally {
    lock.releaseLock();
  }

  if (operationError) {
    throw operationError;
  }

  // Audit only after releasing the ScriptLock.
  try {
    recordAdminAuditLog_(session, {
      action: role === "manager"
        ? "CREATE_MANAGER"
        : "CREATE_AUTHORIZED_USER",
      targetManagerId: managerId,
      targetEmail: email,
      resourceType: role === "manager"
        ? "MANAGER"
        : "AUTHORIZED_USER",
      resourceId: role === "manager"
        ? managerId
        : email,
      outcome: "SUCCESS",
      details: role === "manager"
        ? `Created manager workspace and account. Operational Spreadsheet: ${managerWorkspace.spreadsheetId}`
        : `Created ${role} account.`,
    });
  } catch (auditError) {
    console.error("Admin audit logging failed:", auditError);

    result.warning =
      "The account was created, but the audit log could not be written.";
  }

  return result;
}