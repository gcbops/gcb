import { AppUtils } from "../utils";
import {
  setInvalidSessionHandler,
  setGetAuthArgsHandler,
  showInvalidSessionUI,
} from "./auth-error-handler.js";

const GcbAuthModule = (() => {
  const SESSION_ID_KEY = "gcb_session_id";
  const SESSION_SIGNATURE_KEY = "gcb_session_signature";
  const SESSION_TIME_KEY = "gcb_session_time";

  let initialized = false;
  let initializing = null;
  let currentCapabilities = [];
  let currentRole = "";

  function getSessionId() {
    return localStorage.getItem(SESSION_ID_KEY) || "";
  }

  function getSessionSignature() {
    return localStorage.getItem(SESSION_SIGNATURE_KEY) || "";
  }

  function hasSession() {
    // Presence is only a local hint.
    // The backend determines whether the session is valid.
    return Boolean(getSessionId() && getSessionSignature());
  }

  function saveSession(result) {
    if (
      !result?.sessionId ||
      !result?.signature ||
      !Number.isFinite(result.createdAt) ||
      !Number.isFinite(result.expiresAt)
    ) {
      throw new Error("Invalid GCB session response.");
    }

    localStorage.setItem(SESSION_ID_KEY, result.sessionId);
    localStorage.setItem(SESSION_SIGNATURE_KEY, result.signature);
    localStorage.setItem(SESSION_TIME_KEY, String(result.createdAt));
  }

  function clearSession() {
    localStorage.removeItem(SESSION_ID_KEY);
    localStorage.removeItem(SESSION_SIGNATURE_KEY);
    localStorage.removeItem(SESSION_TIME_KEY);

    // Clean up sessions created before the localStorage migration.
    sessionStorage.removeItem(SESSION_ID_KEY);
    sessionStorage.removeItem(SESSION_SIGNATURE_KEY);

    clearAuthorizationState();
  }

  function exchangeTicket(ticket) {
    return new Promise((resolve, reject) => {
      google.script.run
        .withSuccessHandler((result) => {
          try {
            // console.log(
            //   "[GCB Auth] Authentication handoff exchange succeeded:",
            //   result,
            // );

            saveSession(result);

            window.GCB_AUTH_TICKET = "";

            if (window.GCB_IS_GITHUB_EMBEDDED === true) {
              // console.log(
              //   "[GCB Auth] Sending GCB_AUTH_HANDOFF_COMPLETE to GitHub wrapper.",
              // );

              window.top.postMessage(
                {
                  type: "GCB_AUTH_HANDOFF_COMPLETE",
                },
                "https://gcbops.github.io",
              );

              // console.log(
              //   "[GCB Auth] Authentication handoff completion message sent.",
              // );
            }

            console.log("[GCB Auth] Session handoff completed.");

            resolve(true);
          } catch (error) {
            reject(error);
          }
        })
        .withFailureHandler((error) => {
          console.error(
            "[GCB Auth] Authentication handoff exchange failed:",
            error,
          );
          reject(error);
        })
        .exchangeGcbSessionHandoff(ticket);
    });
  }

  function setAuthorizationState(user) {
    currentRole = String(user?.role || "");

    currentCapabilities = Array.isArray(user?.capabilities)
      ? [...user.capabilities]
      : [];
  }

  function clearAuthorizationState() {
    currentRole = "";
    currentCapabilities = [];
  }

  function getRole() {
    return currentRole;
  }

  function getCapabilities() {
    return [...currentCapabilities];
  }

  function hasCapability(capability) {
    if (!capability) {
      return false;
    }

    return (
      currentCapabilities.includes("*") ||
      currentCapabilities.includes(capability)
    );
  }

  function hasAnyCapability(capabilities = []) {
    if (!Array.isArray(capabilities) || !capabilities.length) {
      return false;
    }

    return capabilities.some((capability) => hasCapability(capability));
  }

  function hasAllCapabilities(capabilities = []) {
    if (!Array.isArray(capabilities) || !capabilities.length) {
      return false;
    }

    return capabilities.every((capability) => hasCapability(capability));
  }

  async function init() {
    if (initialized) {
      return true;
    }

    if (initializing) {
      return initializing;
    }

    initializing = (async () => {
      try {
        /*
         * Existing authenticated session.
         *
         * Do this first so a previously consumed
         * one-time handoff ticket is never exchanged
         * again.
         */
        if (hasSession()) {
          await loadAuthorizationState();

          initialized = true;

          return true;
        }

        if (!window.GCB_AUTH_TICKET) {
          // console.error(
          //   "[GCB Auth] Authentication ticket not detected"
          // );
          clearSession();
          initialized = false;

          return false;
        }

        // console.log(
        //   "[GCB Auth] Authentication ticket detected:",
        //   window.GCB_AUTH_TICKET,
        // );

        const ticket = String(window.GCB_AUTH_TICKET || "").trim();

        /*
         * Fresh OAuth login.
         */
        if (ticket) {
          console.log("[GCB Auth] Exchanging authentication handoff ticket.");
          await exchangeTicket(ticket);
        }

        /*
         * The ticket exchange should have created
         * the session.
         */
        if (!hasSession()) {
          console.warn("[GCB Auth] No authenticated session.");

          return false;
        }

        await loadAuthorizationState();

        initialized = true;

        return true;
      } catch (error) {
        console.warn(
          "[GCB Auth] Session validation or initialization failed.",
          error?.message || error,
        );

        clearSession();

        initialized = false;

        return false;
      } finally {
        initializing = null;
      }
    })();

    return initializing;
  }

  async function getAuthArgs() {
    const authenticated = await init();

    if (!authenticated) {
      throw new Error("Authentication required.");
    }

    return [getSessionId(), getSessionSignature()];
  }

  async function loadAuthorizationState() {
    const sessionId = getSessionId();
    const signature = getSessionSignature();

    if (!sessionId || !signature) {
      throw new Error("Authentication required.");
    }

    return new Promise((resolve, reject) => {
      google.script.run
        .withSuccessHandler((user) => {
          try {
            if (
              !user ||
              !Number.isFinite(user.createdAt) ||
              !Number.isFinite(user.expiresAt) ||
              Date.now() >= user.expiresAt
            ) {
              throw new Error("The backend session is invalid or expired.");
            }

            // Synchronize frontend metadata with backend-issued timestamps.
            localStorage.setItem(SESSION_TIME_KEY, String(user.createdAt));

            setAuthorizationState(user);
            resolve(user);
          } catch (error) {
            reject(error);
          }
        })
        .withFailureHandler(reject)
        .getCurrentGcbUser(sessionId, signature);
    });
  }

  async function logout() {
    if (!hasSession()) {
      clearSession();
      return true;
    }

    const sessionId = getSessionId();
    const signature = getSessionSignature();

    try {
      await new Promise((resolve, reject) => {
        google.script.run
          .withSuccessHandler(() => {
            resolve();
          })
          .withFailureHandler((error) => {
            reject(error);
          })
          .logoutGcbSession(sessionId, signature);
      });
    } finally {
      clearSession();
      window.GCB_AUTH_TICKET = "";

      AppUtils.clearAppCache();
    }

    return true;
  }

  function handleInvalidSession() {
    clearSession();
    window.GCB_AUTH_TICKET = "";
    initialized = false;

    AppUtils.clearAppCache();

    showInvalidSessionUI();
  }

  return {
    init,
    getSessionId,
    getSessionSignature,
    hasSession,
    clearSession,
    getAuthArgs,
    logout,
    handleInvalidSession,

    getRole,
    getCapabilities,
    hasCapability,
    hasAnyCapability,
    hasAllCapabilities,
  };
})();

setInvalidSessionHandler(() => {
  GcbAuthModule.handleInvalidSession();
});

setGetAuthArgsHandler(() => GcbAuthModule.getAuthArgs());

export { GcbAuthModule };
