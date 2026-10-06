const GcbAuthModule = (() => {
  const SESSION_ID_KEY = "gcb_session_id";

  const SESSION_SIGNATURE_KEY = "gcb_session_signature";

  const APP_CACHE_PREFIX = "gcb_";

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
      google.script.run
        .withSuccessHandler((result) => {
          try {
            console.log(
              "[GCB Auth] Authentication handoff exchange succeeded:",
              result,
            );

            saveSession(result);

            window.GCB_AUTH_TICKET = "";

            if (
              window.GCB_IS_GITHUB_EMBEDDED === true &&
              window.parent !== window
            ) {
              console.log(
                "[GCB Auth] Sending GCB_AUTH_HANDOFF_COMPLETE to GitHub wrapper.",
              );

              window.top.postMessage(
                {
                  type: "GCB_AUTH_HANDOFF_COMPLETE",
                },
                "https://gcbops.github.io",
              );

              console.log(
                "[GCB Auth] Authentication handoff completion message sent.",
              );
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

  function clearAppCache() {
    const keysToRemove = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);

      if (key && key.startsWith(APP_CACHE_PREFIX)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => {
      localStorage.removeItem(key);
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

        if (!window.GCB_AUTH_TICKET) {
          console.error(
            "[GCB Auth] Authentication ticket not detected"
          );
          return;
        }

        console.log(
          "[GCB Auth] Authentication ticket detected:",
          window.GCB_AUTH_TICKET,
        );

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

  async function getAuthArgs() {
    const authenticated = await init();

    if (!authenticated) {
      throw new Error("Authentication required.");
    }

    return [getSessionId(), getSessionSignature()];
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

      clearAppCache();
    }

    return true;
  }

  return {
    init,
    getSessionId,
    getSessionSignature,
    hasSession,
    clearSession,
    getAuthArgs,
    logout,
  };
})();

export { GcbAuthModule };
