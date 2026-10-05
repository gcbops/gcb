import { AppUtils } from "../utils";

const GcbAuthModule = (() => {
  const SESSION_ID_KEY = "gcb_session_id";

  const SESSION_SIGNATURE_KEY = "gcb_session_signature";

  let initialized = false;
  let initializing = null;

  function getSessionId() {
    return sessionStorage.getItem(SESSION_ID_KEY) || "";
  }

  function getSessionSignature() {
    return sessionStorage.getItem(SESSION_SIGNATURE_KEY) || "";
  }

  function hasSession() {
    return Boolean(getSessionId() && getSessionSignature());
  }

  function saveSession(result) {
    if (!result?.sessionId || !result?.signature) {
      throw new Error("Invalid GCB session response.");
    }

    sessionStorage.setItem(SESSION_ID_KEY, result.sessionId);

    sessionStorage.setItem(SESSION_SIGNATURE_KEY, result.signature);
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_ID_KEY);

    sessionStorage.removeItem(SESSION_SIGNATURE_KEY);
  }

  function exchangeTicket(ticket) {
    return new Promise((resolve, reject) => {
      AppUtils.gScriptRun({
        gscriptFunc: "exchangeGcbSessionHandoff",
        args: [ticket],

        onSuccess: (result) => {
          try {
            saveSession(result);

            window.GCB_AUTH_TICKET = "";

            if (
              window.GCB_IS_GITHUB_EMBEDDED === true &&
              window.parent !== window
            ) {
              window.parent.postMessage(
                {
                  type: "GCB_AUTH_HANDOFF_COMPLETE",
                },
                "https://gcbops.github.io",
              );
            }

            console.log("[GCB Auth] Session handoff completed.");

            resolve(true);
          } catch (error) {
            reject(error);
          }
        },

        onError: (error) => {
          reject(error);
        },
      });
    });
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
          initialized = true;

          return true;
        }

        const ticket = String(window.GCB_AUTH_TICKET || "").trim();

        /*
         * Fresh OAuth login.
         */
        if (ticket) {
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

        initialized = true;

        return true;
      } catch (error) {
        console.error("[GCB Auth] Initialization failed:", error);

        clearSession();

        initialized = false;

        return false;
      } finally {
        initializing = null;
      }
    })();

    return initializing;
  }

  return {
    init,
    getSessionId,
    getSessionSignature,
    hasSession,
    clearSession,
  };
})();

export { GcbAuthModule };
