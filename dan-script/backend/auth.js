const GCB_SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000;
const GCB_SESSION_PROPERTY_PREFIX = "GCB_SESSION_RECORD_";

function handleGcbOAuthCallback(e) {
  const startedAt = Date.now();
  const state = String(e?.parameter?.state || "").trim();

  if (!validateGcbOAuthState_(state)) {
    logGcbAuthEvent_({
      operation: "LOGIN",
      status: "FAILED",
      startedAt,
      message: "OAuth state validation failed.",
    });

    return buildGcbAuthResultPage({
      type: "error",
      title: "Authentication failed",
      message: "The OAuth request could not be verified.",
    });
  }

  const code = String(e?.parameter?.code || "").trim();

  if (!code) {
    logGcbAuthEvent_({
      operation: "LOGIN",
      status: "FAILED",
      startedAt,
      message: "OAuth authorization code was missing.",
    });
    return buildGcbAuthResultPage({
      type: "error",
      title: "Authentication failed",
      message: "The Google authorization code is missing.",
    });
  }

  try {
    const identity = authenticateGcbGoogleCode_(code);

    const authorizedUser = getAuthorizedUserByGoogleIdentity_(
      identity.email,
      identity.sub,
    );

    if (!authorizedUser) {
      logGcbAuthEvent_({
        operation: "LOGIN",
        status: "DENIED",
        email: identity.email,
        startedAt,
        message: "Google identity is not authorized for GCB access.",
      });

      return buildGcbAuthResultPage({
        type: "error",
        title: "Access denied",
        message:
          "Your Google account is not authorized to access Go Crayons GS.",
        note: "Please contact your GCB administrator if you believe you should have access.",
      });
    }

    if (!authorizedUser.enabled) {
      logGcbAuthEvent_({
        operation: "LOGIN",
        status: "DENIED",
        email: authorizedUser.email,
        startedAt,
        message: "GCB account is disabled.",
      });

      return buildGcbAuthResultPage({
        type: "error",
        title: "Account disabled",
        message: "Your GCB account is currently disabled.",
        note: "Please contact your GCB administrator for assistance.",
      });
    }

    const gcbSession = createGcbSession_(authorizedUser);

    const handoffTicket = createGcbSessionHandoff_(gcbSession);

    logGcbAuthEvent_({
      operation: "LOGIN",
      status: "SUCCESS",
      email: authorizedUser.email,
      startedAt,
      message: "GCB session created successfully.",
    });

    const githubUrl = "https://gcbops.github.io/gcb/";

    const redirectUrl = `${githubUrl}?gcb_auth_ticket=${encodeURIComponent(
      handoffTicket,
    )}`;

    // console.log(
    //   "[GCB Auth] Redirect URL:",
    //   redirectUrl,
    // );

    return buildGcbAuthResultPage({
      type: "success",
      title: "Authentication successful",
      message:
        "Your Google account has been verified. Continue to Go Crayons GS to open the dashboard.",
      buttonText: "Continue to Go Crayons GS",
      buttonUrl: redirectUrl,
      note: "You can close this tab after continuing.",
    });
  } catch (error) {
    console.error(
      "[GCB Auth] OAuth callback failed:",
      error?.message || "Unknown error",
    );

    logGcbAuthEvent_({
      operation: "LOGIN",
      status: "FAILED",
      startedAt,
      message: "OAuth callback failed.",
      error: error?.message || "Unknown authentication error",
    });

    return buildGcbAuthResultPage({
      type: "error",
      title: "Authentication failed",
      message:
        "We couldn't complete sign-in. Please try again. If the problem persists, contact your GCB administrator.",
    });
  }
}

function buildGcbAuthResultPage({
  type = "error",
  title = "Authentication failed",
  message = "",
  buttonText = "",
  buttonUrl = "",
  note = "",
} = {}) {
  const isSuccess = type === "success";

  const icon = isSuccess ? "✓" : "!";

  const iconClass = isSuccess ? "gcb-auth-icon-success" : "gcb-auth-icon-error";

  const buttonHtml =
    buttonUrl && buttonText
      ? `
        <a
          id="gcb-auth-button"
          class="gcb-auth-button"
          href="${escapeHtml(buttonUrl)}"
          target="_blank"
          rel="noopener noreferrer"
        >
          ${escapeHtml(buttonText)}
        </a>
      `
      : "";

  const noteHtml = note
    ? `
        <div class="gcb-auth-note">
          ${escapeHtml(note)}
        </div>
      `
    : "";

  return HtmlService.createHtmlOutput(
    `
    <!DOCTYPE html>
    <html lang="en">

    <head>
      <base target="_blank">

      <meta charset="UTF-8">

      <meta
        name="viewport"
        content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,shrink-to-fit=no"
      >

      <title>Go Crayons GS</title>

      <style>
        html,
        body {
          margin: 0;
          padding: 0;

          width: 100%;
          min-height: 100%;
        }

        body {
          min-height: 100vh;

          display: flex;
          align-items: center;
          justify-content: center;

          padding: 24px;

          box-sizing: border-box;

          font-family:
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            Roboto,
            Arial,
            sans-serif;

          background:
            linear-gradient(
              180deg,
              #f8fafc 0%,
              #f1f5f9 100%
            );

          color: #212529;
        }

        .gcb-auth-wrapper {
          width: 100%;
          max-width: 440px;
        }

        .gcb-auth-brand {
          margin-bottom: 18px;

          text-align: center;
        }

        .gcb-auth-brand-name {
          margin: 0;

          color: #008B8B;

          font-size: 18px;
          font-weight: 700;

          letter-spacing: -0.2px;
        }

        .gcb-auth-brand-subtitle {
          margin-top: 4px;

          color: #98a2b3;

          font-size: 12px;
        }

        .gcb-auth-result {
          width: 100%;

          padding: 36px 32px 32px;

          box-sizing: border-box;

          text-align: center;

          background: #ffffff;

          border: 1px solid rgba(0, 0, 0, 0.06);

          border-radius: 16px;

          box-shadow:
            0 18px 45px rgba(16, 24, 40, 0.08);
        }

        .gcb-auth-icon {
          width: 52px;
          height: 52px;

          margin: 0 auto 20px;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 50%;

          font-size: 24px;
          font-weight: 700;
        }

        .gcb-auth-icon-success {
          background: #ecfdf3;
          color: #12b76a;
        }

        .gcb-auth-icon-error {
          background: #fef3f2;
          color: #d92d20;
        }

        .gcb-auth-result h1 {
          margin: 0 0 10px;

          color: #101828;

          font-size: 22px;
          font-weight: 700;

          line-height: 1.3;
        }

        .gcb-auth-message {
          margin: 0 auto 24px;

          max-width: 360px;

          color: #667085;

          font-size: 14px;
          line-height: 1.65;
        }

        .gcb-auth-button {
          display: flex;
          align-items: center;
          justify-content: center;

          width: 100%;
          min-height: 48px;

          padding: 0 20px;

          box-sizing: border-box;

          border: 0;
          border-radius: 10px;

          background: #008B8B;
          color: #ffffff;

          font-size: 14px;
          font-weight: 600;

          text-decoration: none;

          cursor: pointer;

          transition:
            background-color 0.15s ease,
            box-shadow 0.15s ease,
            transform 0.15s ease;
        }

        .gcb-auth-button:hover {
          background: #007A7A;

          color: #ffffff;

          box-shadow:
            0 5px 14px rgba(0, 139, 139, 0.20);

          transform: translateY(-1px);
        }

        .gcb-auth-button:active {
          transform: translateY(0);
        }

        .gcb-auth-note {
          margin-top: 14px;

          color: #98a2b3;

          font-size: 11px;
          line-height: 1.5;
        }

        .gcb-auth-footer {
          margin-top: 18px;

          text-align: center;

          color: #98a2b3;

          font-size: 11px;
        }

        @media (max-width: 480px) {
          body {
            padding: 16px;
          }

          .gcb-auth-result {
            padding: 30px 22px 26px;
          }

          .gcb-auth-result h1 {
            font-size: 20px;
          }
        }
      </style>
    </head>

    <body>
      <div class="gcb-auth-wrapper">

        <div class="gcb-auth-brand">
          <div class="gcb-auth-brand-name">
            Go Crayons GS
          </div>

          <div class="gcb-auth-brand-subtitle">
            GCB Operations Dashboard
          </div>
        </div>

        <div class="gcb-auth-result">

          <div class="gcb-auth-icon ${iconClass}">
            ${icon}
          </div>

          <h1>
            ${escapeHtml(title)}
          </h1>

          <p class="gcb-auth-message">
            ${escapeHtml(message)}
          </p>

          ${buttonHtml}

          ${noteHtml}

        </div>

        <div class="gcb-auth-footer">
          Go Crayons GS &middot; Secure Authentication
        </div>

      </div>
    </body>

    </html>
  `,
  )
    .setTitle("Go Crayons GS")
    .addMetaTag(
      "viewport",
      "width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,shrink-to-fit=no",
    )
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getAuthorizedUserByGoogleIdentity_(googleEmail, googleSub) {
  const normalizedEmail = String(googleEmail || "")
    .trim()
    .toLowerCase();

  const normalizedSub = String(googleSub || "").trim();

  if (!normalizedEmail || !normalizedSub) {
    return null;
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    throw new Error(
      "Authorization registry is busy. Please try signing in again.",
    );
  }

  try {
    const sheet = getAuthorizedUsersSheet_();
    const values = sheet.getDataRange().getValues();

    if (values.length < 2) {
      return null;
    }

    const headers = values[0];

    const emailIndex = headers.indexOf("Email");
    const subIndex = headers.indexOf("Google Sub");
    const enabledIndex = headers.indexOf("Enabled");
    const roleIndex = headers.indexOf("Role");
    const capabilitiesIndex = headers.indexOf("Capabilities");
    const notesIndex = headers.indexOf("Notes");

    if (
      emailIndex === -1 ||
      subIndex === -1 ||
      enabledIndex === -1 ||
      roleIndex === -1 ||
      capabilitiesIndex === -1
    ) {
      throw new Error("AUTHORIZED_USERS is missing required columns.");
    }

    const seenEmails = new Set();
    const seenSubs = new Set();
    let matchedRow = -1;

    // Validate uniqueness throughout the registry.
    for (let i = 1; i < values.length; i++) {
      const row = values[i];

      const rowEmail = String(row[emailIndex] || "")
        .trim()
        .toLowerCase();

      const rowSub = String(row[subIndex] || "").trim();

      if (rowEmail) {
        if (seenEmails.has(rowEmail)) {
          throw new Error(`Duplicate email in AUTHORIZED_USERS: ${rowEmail}`);
        }

        seenEmails.add(rowEmail);
      }

      if (rowSub) {
        if (seenSubs.has(rowSub)) {
          throw new Error("Duplicate Google Sub found in AUTHORIZED_USERS.");
        }

        seenSubs.add(rowSub);
      }

      if (rowEmail === normalizedEmail) {
        matchedRow = i;
      }
    }

    if (matchedRow === -1) {
      return null;
    }

    const row = values[matchedRow];
    const rowSub = String(row[subIndex] || "").trim();

    // Never replace an existing Google identity binding.
    if (rowSub && rowSub !== normalizedSub) {
      return null;
    }

    // A Google identity must not already belong to another account.
    const boundRow = values.findIndex(
      (candidate, index) =>
        index !== matchedRow &&
        String(candidate[subIndex] || "").trim() === normalizedSub,
    );

    if (boundRow !== -1) {
      throw new Error(
        "This Google identity is already bound to another account.",
      );
    }

    const enabled =
      String(row[enabledIndex] || "")
        .trim()
        .toLowerCase() === "true";

    // Only enabled accounts may establish their initial identity binding.
    if (!rowSub) {
      if (!enabled) {
        return {
          email: normalizedEmail,
          googleSub: normalizedSub,
          enabled: false,
          role: String(row[roleIndex] || "").trim(),
          capabilities: String(row[capabilitiesIndex] || "").trim(),
          notes: notesIndex !== -1 ? String(row[notesIndex] || "").trim() : "",
        };
      }

      sheet.getRange(matchedRow + 1, subIndex + 1).setValue(normalizedSub);
    }

    return {
      email: normalizedEmail,
      googleSub: normalizedSub,
      enabled,
      role: String(row[roleIndex] || "").trim(),
      capabilities: String(row[capabilitiesIndex] || "").trim(),
      notes: notesIndex !== -1 ? String(row[notesIndex] || "").trim() : "",
    };
  } finally {
    lock.releaseLock();
  }
}

function getAuthorizedUserByGoogleSub_(googleSub) {
  const sheet = getAuthorizedUsersSheet_();

  if (!sheet) {
    throw new Error("AUTHORIZED_USERS sheet was not found.");
  }

  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return null;
  }

  const headers = values[0];

  const emailIndex = headers.indexOf("Email");
  const subIndex = headers.indexOf("Google Sub");
  const enabledIndex = headers.indexOf("Enabled");
  const roleIndex = headers.indexOf("Role");
  const capabilitiesIndex = headers.indexOf("Capabilities");
  const notesIndex = headers.indexOf("Notes");

  if (
    emailIndex === -1 ||
    subIndex === -1 ||
    enabledIndex === -1 ||
    roleIndex === -1 ||
    capabilitiesIndex === -1
  ) {
    throw new Error("AUTHORIZED_USERS is missing required columns.");
  }

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    const rowSub = String(row[subIndex] || "").trim();

    if (!rowSub || rowSub !== googleSub) {
      continue;
    }

    return {
      email: String(row[emailIndex] || "").trim(),
      googleSub: rowSub,
      enabled:
        String(row[enabledIndex] || "")
          .trim()
          .toLowerCase() === "true",
      role: String(row[roleIndex] || "").trim(),
      capabilities: String(row[capabilitiesIndex] || "").trim(),
      notes: String(row[notesIndex] || "").trim(),
    };
  }

  return null;
}

function getAuthorizedUsersSheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty(
    "MANAGER_REGISTRY_SPREADSHEET_ID",
  );

  if (!spreadsheetId) {
    throw new Error("MANAGER_REGISTRY_SPREADSHEET_ID is not configured.");
  }

  const spreadsheet = openSpreadsheetById(spreadsheetId);
  const sheet = spreadsheet.getSheetByName("AUTHORIZED_USERS");

  if (!sheet) {
    throw new Error(
      'Sheet "AUTHORIZED_USERS" was not found in the central registry.',
    );
  }

  return sheet;
}

function getSessionCapabilities(session) {
  if (!session) {
    return [];
  }

  if (session.capabilities === "*") {
    return ["*"];
  }

  return String(session.capabilities || "")
    .split(",")
    .map((capability) => capability.trim())
    .filter(Boolean);
}

function getCurrentGcbUser(sessionId, signature) {
  const session = requireAuthenticatedUser(sessionId, signature);

  return {
    email: session.email,
    role: session.role,
    capabilities: getSessionCapabilities(session),
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
  };
}

function createGcbSession_(authorizedUser) {
  if (!authorizedUser?.googleSub || !authorizedUser?.email) {
    throw new Error("A valid authorized user is required.");
  }

  const props = PropertiesService.getScriptProperties();
  const sessionSecret = props.getProperty("GCB_SESSION_SECRET");

  if (!sessionSecret) {
    throw new Error("GCB_SESSION_SECRET is not configured.");
  }

  // Remove a limited number of expired records before creating a session.
  cleanupExpiredGcbSessions_(20);

  const createdAt = Date.now();

  const sessionPayload = {
    sessionId: Utilities.getUuid() + "-" + Utilities.getUuid(),
    googleSub: authorizedUser.googleSub,
    email: authorizedUser.email,
    role: authorizedUser.role,
    capabilities: authorizedUser.capabilities,
    createdAt,
    expiresAt: createdAt + GCB_SESSION_LIFETIME_MS,
  };

  const signature = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(
      JSON.stringify(sessionPayload),
      sessionSecret,
    ),
  );

  const session = {
    ...sessionPayload,
    signature,
  };

  props.setProperty(
    `${GCB_SESSION_PROPERTY_PREFIX}${session.sessionId}`,
    JSON.stringify(session),
  );

  return session;
}

function validateGcbSession_(sessionId, signature) {
  if (
    typeof sessionId !== "string" ||
    !sessionId ||
    typeof signature !== "string" ||
    !signature
  ) {
    return null;
  }

  const props = PropertiesService.getScriptProperties();
  const propertyKey = `${GCB_SESSION_PROPERTY_PREFIX}${sessionId}`;
  const storedSession = props.getProperty(propertyKey);

  if (!storedSession) {
    return null;
  }

  let session;

  try {
    session = JSON.parse(storedSession);
  } catch (error) {
    console.warn("[Auth] Invalid stored session record.");
    props.deleteProperty(propertyKey);
    return null;
  }

  if (
    !session ||
    session.sessionId !== sessionId ||
    typeof session.googleSub !== "string" ||
    !session.googleSub ||
    typeof session.email !== "string" ||
    !session.email ||
    typeof session.signature !== "string" ||
    !session.signature ||
    !Number.isFinite(session.createdAt) ||
    !Number.isFinite(session.expiresAt)
  ) {
    return null;
  }

  const now = Date.now();

  if (
    session.createdAt > now ||
    session.expiresAt !== session.createdAt + GCB_SESSION_LIFETIME_MS ||
    now >= session.expiresAt
  ) {
    props.deleteProperty(propertyKey);
    return null;
  }

  const sessionSecret = props.getProperty("GCB_SESSION_SECRET");

  if (!sessionSecret) {
    throw new Error("GCB_SESSION_SECRET is not configured.");
  }

  const sessionPayload = {
    sessionId: session.sessionId,
    googleSub: session.googleSub,
    email: session.email,
    role: session.role,
    capabilities: session.capabilities,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
  };

  const expectedSignature = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(
      JSON.stringify(sessionPayload),
      sessionSecret,
    ),
  );

  if (
    signature !== expectedSignature ||
    session.signature !== expectedSignature
  ) {
    console.warn("[Auth] Session signature validation failed.");
    return null;
  }

  const authorizedUser = getAuthorizedUserByGoogleSub_(session.googleSub);

  if (!authorizedUser || !authorizedUser.enabled) {
    return null;
  }

  return {
    sessionId: session.sessionId,
    googleSub: session.googleSub,
    email: authorizedUser.email,
    role: authorizedUser.role,
    capabilities: authorizedUser.capabilities,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
  };
}

function cleanupExpiredGcbSessions_(maxDeletes = 20) {
  const props = PropertiesService.getScriptProperties();
  const allProperties = props.getProperties();
  const now = Date.now();

  let deleted = 0;

  for (const [key, value] of Object.entries(allProperties)) {
    if (deleted >= maxDeletes || !key.startsWith(GCB_SESSION_PROPERTY_PREFIX)) {
      continue;
    }

    let session;

    try {
      session = JSON.parse(value);
    } catch (error) {
      props.deleteProperty(key);
      deleted++;
      continue;
    }

    if (
      !session ||
      !Number.isFinite(session.createdAt) ||
      !Number.isFinite(session.expiresAt) ||
      session.createdAt > now ||
      session.expiresAt !== session.createdAt + GCB_SESSION_LIFETIME_MS ||
      now >= session.expiresAt
    ) {
      props.deleteProperty(key);
      deleted++;
    }
  }

  return deleted;
}

function createGcbOAuthState_() {
  const state = Utilities.getUuid() + "-" + Utilities.getUuid();

  const cacheKey = `gcb_oauth_state_${state}`;

  CacheService.getScriptCache().put(
    cacheKey,
    JSON.stringify({
      state,
      createdAt: Date.now(),
    }),
    600, // 10 minutes
  );

  return state;
}

function createGcbLoginUrl() {
  const props = PropertiesService.getScriptProperties();

  const clientId = props.getProperty("GCB_OAUTH_CLIENT_ID");

  if (!clientId) {
    throw new Error("GCB_OAUTH_CLIENT_ID is not configured.");
  }

  const redirectUri =
    "https://script.google.com/macros/s/AKfycbwdipuZqlldoU7utdQ6gAK0XLsog96TMCg02MUYvNz8ix6LWsOt-cqX5R5YCvsQ4OnT/exec";

  const state = createGcbOAuthState_();

  const params = {
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  };

  const query = Object.entries(params)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&");

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${query}`;

  // Logger.log("[GCB Auth] Login URL: %s", url);

  return url;
}

function createGcbSessionHandoff_(session) {
  if (!session?.sessionId || !session?.signature) {
    throw new Error("A valid GCB session is required for handoff.");
  }

  const ticket = Utilities.getUuid() + "-" + Utilities.getUuid();

  const cacheKey = `gcb_handoff_${ticket}`;

  const handoff = {
    ticket,
    sessionId: session.sessionId,
    signature: session.signature,
    createdAt: Date.now(),
  };

  CacheService.getScriptCache().put(cacheKey, JSON.stringify(handoff), 120);

  return ticket;
}

function requireAuthenticatedUser(sessionId, signature) {
  const session = validateGcbSession_(sessionId, signature);

  if (!session) {
    throw new Error("Authentication required.");
  }

  return session;
}

function requireRole(sessionId, signature, requiredRole) {
  const session = requireAuthenticatedUser(sessionId, signature);

  if (!requiredRole || session.role !== requiredRole) {
    throw new Error("Insufficient permissions.");
  }

  return session;
}

function requireCapability(sessionId, signature, requiredCapability) {
  const session = requireAuthenticatedUser(sessionId, signature);

  if (!requiredCapability) {
    throw new Error("Capability is required.");
  }

  const capabilities = getSessionCapabilities(session);

  if (capabilities.includes("*") || capabilities.includes(requiredCapability)) {
    return session;
  }

  throw new Error("Insufficient permissions.");
}

function requireAnyCapability(sessionId, signature, requiredCapabilities) {
  const session = requireAuthenticatedUser(sessionId, signature);

  if (
    !Array.isArray(requiredCapabilities) ||
    requiredCapabilities.length === 0
  ) {
    throw new Error("At least one capability is required.");
  }

  const capabilities = getSessionCapabilities(session);

  if (capabilities.includes("*")) {
    return session;
  }

  const hasCapability = requiredCapabilities.some((capability) =>
    capabilities.includes(capability),
  );

  if (!hasCapability) {
    throw new Error("Insufficient permissions.");
  }

  return session;
}

function requireAllCapabilities(sessionId, signature, requiredCapabilities) {
  const session = requireAuthenticatedUser(sessionId, signature);

  if (
    !Array.isArray(requiredCapabilities) ||
    requiredCapabilities.length === 0
  ) {
    throw new Error("At least one capability is required.");
  }

  const capabilities = getSessionCapabilities(session);

  if (capabilities.includes("*")) {
    return session;
  }

  const hasAllCapabilities = requiredCapabilities.every((capability) =>
    capabilities.includes(capability),
  );

  if (!hasAllCapabilities) {
    throw new Error("Insufficient permissions.");
  }

  return session;
}

function validateGcbOAuthState_(state) {
  if (!state) {
    return false;
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(5000)) {
    return false;
  }

  try {
    const cache = CacheService.getScriptCache();

    const cacheKey = `gcb_oauth_state_${state}`;

    const cachedState = cache.get(cacheKey);

    if (!cachedState) {
      return false;
    }

    let data;

    try {
      data = JSON.parse(cachedState);
    } catch (error) {
      cache.remove(cacheKey);
      return false;
    }

    if (!data || data.state !== state || !Number.isFinite(data.createdAt)) {
      cache.remove(cacheKey);
      return false;
    }

    const STATE_LIFETIME = 10 * 60 * 1000;
    const age = Date.now() - data.createdAt;

    if (age < 0 || age > STATE_LIFETIME) {
      cache.remove(cacheKey);
      return false;
    }

    // Consume the state so it cannot be reused.
    cache.remove(cacheKey);

    return true;
  } finally {
    lock.releaseLock();
  }
}

function authenticateGcbGoogleCode_(code) {
  if (!code) {
    throw new Error("Google authorization code is missing.");
  }

  const props = PropertiesService.getScriptProperties();

  const clientId = props.getProperty("GCB_OAUTH_CLIENT_ID");

  const clientSecret = props.getProperty("GCB_OAUTH_CLIENT_SECRET");

  const redirectUri =
    "https://script.google.com/macros/s/AKfycbwdipuZqlldoU7utdQ6gAK0XLsog96TMCg02MUYvNz8ix6LWsOt-cqX5R5YCvsQ4OnT/exec";

  if (!clientId || !clientSecret) {
    throw new Error("GCB OAuth client credentials are missing.");
  }

  const response = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", {
    method: "post",
    payload: {
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    },
    muteHttpExceptions: true,
  });

  const status = response.getResponseCode();

  const body = response.getContentText();

  Logger.log("[GCB Auth] Token response status: %s", status);

  if (status < 200 || status >= 300) {
    throw new Error(`OAuth token exchange failed. Status: ${status}`);
  }

  let tokenData;

  try {
    tokenData = JSON.parse(body);
  } catch (error) {
    throw new Error("Google returned an invalid token response.");
  }

  const idToken = tokenData.id_token;

  if (!idToken) {
    throw new Error("Google did not return an ID token.");
  }

  const verifyResponse = UrlFetchApp.fetch(
    "https://oauth2.googleapis.com/tokeninfo",
    {
      method: "get",
      payload: {
        id_token: idToken,
      },
      muteHttpExceptions: true,
    },
  );

  const verifyStatus = verifyResponse.getResponseCode();

  const verifyBody = verifyResponse.getContentText();

  Logger.log("[GCB Auth] Identity verification status: %s", verifyStatus);

  if (verifyStatus < 200 || verifyStatus >= 300) {
    throw new Error("Google ID token verification failed.");
  }

  let identity;

  try {
    identity = JSON.parse(verifyBody);
  } catch (error) {
    throw new Error("Google returned an invalid identity response.");
  }

  if (identity.aud !== clientId) {
    throw new Error(
      "Google ID token audience does not match the GCB OAuth client.",
    );
  }

  if (
    identity.iss !== "https://accounts.google.com" &&
    identity.iss !== "accounts.google.com"
  ) {
    throw new Error("Google ID token issuer is invalid.");
  }

  const expiresAt = Number(identity.exp);

  if (!Number.isFinite(expiresAt)) {
    throw new Error("Google ID token expiration is missing.");
  }

  if (expiresAt <= Math.floor(Date.now() / 1000)) {
    throw new Error("Google ID token has expired.");
  }

  if (!identity.sub) {
    throw new Error("Google ID token subject is missing.");
  }

  if (!identity.email) {
    throw new Error("Google ID token email is missing.");
  }

  if (String(identity.email_verified).toLowerCase() !== "true") {
    throw new Error("Google email verification is required.");
  }

  return identity;
}

function exchangeGcbSessionHandoff(ticket) {
  const normalizedTicket = String(ticket || "").trim();

  if (!normalizedTicket) {
    throw new Error("Authentication handoff ticket is required.");
  }

  let handoff;

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(5000)) {
    throw new Error("Authentication service is busy. Please try again.");
  }

  try {
    const cache = CacheService.getScriptCache();
    const cacheKey = `gcb_handoff_${normalizedTicket}`;
    const cached = cache.get(cacheKey);

    if (!cached) {
      throw new Error("Authentication handoff ticket is invalid or expired.");
    }

    try {
      handoff = JSON.parse(cached);
    } catch (error) {
      cache.remove(cacheKey);
      throw new Error("Authentication handoff data is invalid.");
    }

    if (
      !handoff ||
      handoff.ticket !== normalizedTicket ||
      typeof handoff.sessionId !== "string" ||
      !handoff.sessionId ||
      typeof handoff.signature !== "string" ||
      !handoff.signature
    ) {
      cache.remove(cacheKey);
      throw new Error("Authentication handoff ticket is invalid.");
    }

    const HANDOFF_LIFETIME = 2 * 60 * 1000;
    const age = Date.now() - handoff.createdAt;

    if (
      !Number.isFinite(handoff.createdAt) ||
      age < 0 ||
      age > HANDOFF_LIFETIME
    ) {
      cache.remove(cacheKey);
      throw new Error("Authentication handoff ticket has expired.");
    }

    // Consume the ticket while holding the lock.
    cache.remove(cacheKey);
  } finally {
    lock.releaseLock();
  }

  // Validate the session after releasing the lock.
  const session = requireAuthenticatedUser(
    handoff.sessionId,
    handoff.signature,
  );

  return {
    sessionId: session.sessionId,
    signature: handoff.signature,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
  };
}

function logoutGcbSession(sessionId, signature) {
  const startedAt = Date.now();

  const session = requireAuthenticatedUser(sessionId, signature);

  try {
    PropertiesService.getScriptProperties().deleteProperty(
      `${GCB_SESSION_PROPERTY_PREFIX}${session.sessionId}`,
    );

    logGcbAuthEvent_({
      operation: "LOGOUT",
      status: "SUCCESS",
      email: session.email,
      startedAt,
      message: "GCB session invalidated successfully.",
    });

    return true;
  } catch (error) {
    logGcbAuthEvent_({
      operation: "LOGOUT",
      status: "FAILED",
      email: session.email,
      startedAt,
      message: "Failed to invalidate GCB session.",
      error: error?.message || "Unknown logout error",
    });

    throw error;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function logGcbAuthEvent_({
  operation,
  status,
  email = "",
  startedAt = Date.now(),
  message = "",
  error = "",
} = {}) {
  try {
    recordGcbOperationLog_({
      category: "AUTH",
      operation,
      status,
      trigger: "OAUTH",
      durationMs: Math.max(0, Date.now() - startedAt),
      target: email || "Unknown user",
      message,
      error: String(error || "").slice(0, 500),
    });
  } catch (logError) {
    // Authentication must not fail because logging failed.
    console.error(
      "[GCB Auth] Failed to record authentication event:",
      logError?.message || "Unknown logging error",
    );
  }
}

// Re-authorize the Apps Script project for Google Drive
function authorizeDrive() {
  const properties = PropertiesService.getScriptProperties();

  const backupFolderId = properties.getProperty("BACKUP_FOLDER_ID");
  const templateId = properties.getProperty("EXTERNAL_SHEET_TEMPLATE_ID");

  if (!backupFolderId) {
    throw new Error("BACKUP_FOLDER_ID is not configured.");
  }

  if (!templateId) {
    throw new Error("EXTERNAL_SHEET_TEMPLATE_ID is not configured.");
  }

  const folder = DriveApp.getFolderById(backupFolderId);
  const template = DriveApp.getFileById(templateId);

  Logger.log("Drive authorization successful.");
  Logger.log("Backup folder: " + folder.getName());
  Logger.log("Folder URL: " + folder.getUrl());

  let testCopy;

  try {
    // Verify DriveApp.File.makeCopy() authorization.
    testCopy = template.makeCopy(
      "__GCB_DRIVE_AUTH_TEST__" + Date.now(),
      folder,
    );

    Logger.log("makeCopy authorization successful.");
    Logger.log("Test copy ID: " + testCopy.getId());
    Logger.log("Test copy URL: " + testCopy.getUrl());
  } finally {
    // Remove the temporary test copy, if one was created.
    if (testCopy) {
      testCopy.setTrashed(true);
      Logger.log("Temporary test copy moved to Trash.");
    }
  }
}

// Re-authorize the Apps Script project: Running a function manually is the documented way to authorize newly required services when the script cannot prompt for authorization during an automated execution.
function authorizeExternalRequests() {
  const response = UrlFetchApp.fetch("https://www.google.com", {
    muteHttpExceptions: true,
  });

  Logger.log("HTTP status: " + response.getResponseCode());
}

// Re-authorize the Apps Script project: Authorize without sending an actual email. This requests the MailApp authorization without sending an email.
function authorizeEmailAccess() {
  MailApp.getRemainingDailyQuota();
}