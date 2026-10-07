function handleGcbOAuthCallback(e) {
  const state = String(e?.parameter?.state || "").trim();

  if (!validateGcbOAuthState(state)) {
    return HtmlService.createHtmlOutput(`
      <h2>Authentication failed</h2>
      <p>The OAuth request could not be verified.</p>
    `);
  }

  const code = String(e?.parameter?.code || "").trim();

  if (!code) {
    return HtmlService.createHtmlOutput(`
      <h2>Authentication failed</h2>
      <p>The Google authorization code is missing.</p>
    `);
  }

  try {
    const identity = authenticateGcbGoogleCode(code);

    const authorizedUser = getAuthorizedUserByGoogleIdentity(
      identity.email,
      identity.sub,
    );

    if (!authorizedUser) {
      return HtmlService.createHtmlOutput(`
        <h2>Access denied</h2>
        <p>Your Google account is not authorized for GCB.</p>
      `);
    }

    if (!authorizedUser.enabled) {
      return HtmlService.createHtmlOutput(`
        <h2>Access denied</h2>
        <p>Your GCB account is currently disabled.</p>
      `);
    }

    const gcbSession = createGcbSession(authorizedUser);

    // console.log("[GCB Auth] GCB session created.");

    const handoffTicket = createGcbSessionHandoff(gcbSession);

    // console.log("[GCB Auth] Handoff ticket created.");

    const githubUrl = "https://gcbops.github.io/gcb/";

    const redirectUrl = `${githubUrl}?gcb_auth_ticket=${encodeURIComponent(
      handoffTicket,
    )}`;

    console.log("[GCB Auth] Redirect URL:", redirectUrl);

    return HtmlService.createHtmlOutput(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <base target="_blank">
        <meta charset="UTF-8">

        <title>Go Crayons GS</title>

        <style>
          html,
          body {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
          }

          body {
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

            background: #f8f9fa;
            color: #212529;
          }

          .gcb-auth-result {
            width: min(420px, 100%);

            padding: 32px;

            text-align: center;

            background: #fff;

            border: 1px solid rgba(0, 0, 0, 0.06);
            border-radius: 16px;

            box-shadow:
              0 16px 40px rgba(0, 0, 0, 0.08);
          }

          .gcb-auth-icon {
            width: 48px;
            height: 48px;

            margin: 0 auto 18px;

            display: flex;
            align-items: center;
            justify-content: center;

            border-radius: 50%;

            background: #ecfdf3;
            color: #12b76a;

            font-size: 24px;
            font-weight: 700;
          }

          .gcb-auth-result h1 {
            margin: 0 0 8px;

            font-size: 22px;
            font-weight: 700;
          }

          .gcb-auth-result p {
            margin: 0 0 24px;

            color: #667085;

            font-size: 14px;
            line-height: 1.6;
          }

          .gcb-auth-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;

            width: 100%;
            min-height: 48px;

            padding: 0 20px;

            box-sizing: border-box;

            border: 0;
            border-radius: 10px;

            background: #008B8B;
            color: #fff;

            font-size: 14px;
            font-weight: 600;

            text-decoration: none;

            cursor: pointer;

            transition:
              background-color 0.15s ease,
              box-shadow 0.15s ease;
          }

          .gcb-auth-button:hover {
            background: #007A7A;

            box-shadow:
              0 4px 12px rgba(13, 110, 253, 0.2);
          }

          .gcb-auth-note {
            margin-top: 14px;

            font-size: 11px;
            color: #98a2b3;
          }
        </style>
      </head>

      <body>
        <div class="gcb-auth-result">

          <div class="gcb-auth-icon">
            ✓
          </div>

          <h1>
            Authentication successful
          </h1>

          <p>
            Your Google account has been verified.
            Continue to Go Crayons GS to open the dashboard.
          </p>

          <a
            id="gcb-continue-button"
            class="gcb-auth-button"
            href="${redirectUrl}"
            target="_blank"
            rel="noopener noreferrer"
            onclick="setTimeout(() => window.close(), 10000);"
          >
            Continue to Go Crayons GS
          </a>

          <div class="gcb-auth-note">
            This tab will close 10 seconds after continuing.
          </div>

        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error("[GCB Auth] OAuth callback failed:", error);

    return HtmlService.createHtmlOutput(`
      <h2>Authentication failed</h2>
      <p>${escapeHtml(error?.message || String(error))}</p>
    `);
  }
}

function getAuthorizedUserByGoogleIdentity(googleEmail, googleSub) {
  const sheet =
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName("AUTHORIZED_USERS");

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

  const normalizedEmail = String(googleEmail || "")
    .trim()
    .toLowerCase();

  const normalizedSub = String(googleSub || "").trim();

  if (!normalizedEmail || !normalizedSub) {
    return null;
  }

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    const rowEmail = String(row[emailIndex] || "")
      .trim()
      .toLowerCase();

    if (!rowEmail) {
      continue;
    }

    if (rowEmail !== normalizedEmail) {
      continue;
    }

    const rowSub = String(row[subIndex] || "").trim();

    // Existing Google Sub must match.
    if (rowSub && rowSub !== normalizedSub) {
      return null;
    }

    // First successful login:
    // automatically save the Google Sub.
    if (!rowSub) {
      sheet.getRange(i + 1, subIndex + 1).setValue(normalizedSub);
    }

    return {
      email: rowEmail,
      googleSub: normalizedSub,
      enabled:
        String(row[enabledIndex] || "")
          .trim()
          .toLowerCase() === "true",
      role: String(row[roleIndex] || "").trim(),
      capabilities: String(row[capabilitiesIndex] || "").trim(),
      notes: notesIndex !== -1 ? String(row[notesIndex] || "").trim() : "",
    };
  }

  return null;
}

function getAuthorizedUserByGoogleSub(googleSub) {
  const sheet =
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName("AUTHORIZED_USERS");

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

function createGcbSession(authorizedUser) {
  const props = PropertiesService.getScriptProperties();

  const sessionSecret = props.getProperty("GCB_SESSION_SECRET");

  if (!sessionSecret) {
    throw new Error("GCB_SESSION_SECRET is not configured.");
  }

  const sessionId = Utilities.getUuid() + "-" + Utilities.getUuid();

  const createdAt = Date.now();

  const sessionPayload = {
    sessionId,
    googleSub: authorizedUser.googleSub,
    email: authorizedUser.email,
    role: authorizedUser.role,
    capabilities: authorizedUser.capabilities,
    createdAt,
  };

  const signatureBytes = Utilities.computeHmacSha256Signature(
    JSON.stringify(sessionPayload),
    sessionSecret,
  );

  const signature = Utilities.base64EncodeWebSafe(signatureBytes);

  const session = {
    ...sessionPayload,
    signature,
  };

  CacheService.getScriptCache().put(
    `gcb_session_${sessionId}`,
    JSON.stringify(session),
    86400, // GCB session lifetime = 1 day
  );

  return session;
}

function createGcbOAuthState() {
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

  const state = createGcbOAuthState();

  const params = {
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
  };

  const query = Object.entries(params)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&");

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${query}`;

  Logger.log("[GCB Auth] Login URL: %s", url);

  return url;
}

function createGcbSessionHandoff(session) {
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
  const session = validateGcbSession(sessionId, signature);

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

function validateGcbSession(sessionId, signature) {
  if (!sessionId || !signature) {
    return null;
  }

  const sessionCacheKey = `gcb_session_${sessionId}`;

  const cachedSession = CacheService.getScriptCache().get(sessionCacheKey);

  if (!cachedSession) {
    console.error("[Auth] Session not found in ScriptCache:", sessionCacheKey);

    return null;
  }

  let session;

  try {
    session = JSON.parse(cachedSession);
  } catch (error) {
    console.error("[Auth] Invalid cached session data.", error);

    return null;
  }

  if (!session || session.sessionId !== sessionId || !session.signature) {
    return null;
  }

  const props = PropertiesService.getScriptProperties();

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
  };

  const signatureBytes = Utilities.computeHmacSha256Signature(
    JSON.stringify(sessionPayload),
    sessionSecret,
  );

  const expectedSignature = Utilities.base64EncodeWebSafe(signatureBytes);

  if (signature !== expectedSignature) {
    console.error("[Auth] Session signature mismatch.");

    return null;
  }

  const SESSION_LIFETIME = 6 * 60 * 60 * 1000;

  if (
    !Number.isFinite(session.createdAt) ||
    Date.now() - session.createdAt > SESSION_LIFETIME
  ) {
    console.error("[Auth] Session expired.");

    return null;
  }

  const authorizedUser = getAuthorizedUserByGoogleSub(session.googleSub);

  if (!authorizedUser) {
    console.error("[Auth] Authorized user not found for session.");

    return null;
  }

  if (!authorizedUser.enabled) {
    console.error("[Auth] Authorized user is disabled.");

    return null;
  }

  return {
    sessionId: session.sessionId,
    googleSub: session.googleSub,
    email: session.email,
    role: authorizedUser.role,
    capabilities: authorizedUser.capabilities,
    createdAt: session.createdAt,
  };
}

function validateGcbOAuthState(state) {
  if (!state) {
    return false;
  }

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
    return false;
  }

  if (!data || data.state !== state) {
    return false;
  }

  const STATE_LIFETIME = 10 * 60 * 1000;

  if (
    !Number.isFinite(data.createdAt) ||
    Date.now() - data.createdAt > STATE_LIFETIME
  ) {
    return false;
  }

  // Consume the state so it cannot be reused.
  cache.remove(cacheKey);

  return true;
}

function authenticateGcbGoogleCode(code) {
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

  return identity;
}

function exchangeGcbSessionHandoff(ticket) {
  const normalizedTicket = String(ticket || "").trim();

  if (!normalizedTicket) {
    throw new Error("Authentication handoff ticket is required.");
  }

  const cache = CacheService.getScriptCache();

  const cacheKey = `gcb_handoff_${normalizedTicket}`;

  const cached = cache.get(cacheKey);

  if (!cached) {
    throw new Error("Authentication handoff ticket is invalid or expired.");
  }

  let handoff;

  try {
    handoff = JSON.parse(cached);
  } catch (error) {
    cache.remove(cacheKey);

    throw new Error("Authentication handoff data is invalid.");
  }

  if (
    !handoff ||
    handoff.ticket !== normalizedTicket ||
    !handoff.sessionId ||
    !handoff.signature
  ) {
    cache.remove(cacheKey);

    throw new Error("Authentication handoff ticket is invalid.");
  }

  const HANDOFF_LIFETIME = 2 * 60 * 1000;

  if (
    !Number.isFinite(handoff.createdAt) ||
    Date.now() - handoff.createdAt > HANDOFF_LIFETIME
  ) {
    cache.remove(cacheKey);

    throw new Error("Authentication handoff ticket has expired.");
  }

  // One-time use.
  cache.remove(cacheKey);

  const session = requireAuthenticatedUser(
    handoff.sessionId,
    handoff.signature,
  );

  return {
    sessionId: session.sessionId,
    signature: handoff.signature,
  };
}

function logoutGcbSession(sessionId, signature) {
  const session = requireAuthenticatedUser(sessionId, signature);

  CacheService.getScriptCache().remove(`gcb_session_${session.sessionId}`);

  return true;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
