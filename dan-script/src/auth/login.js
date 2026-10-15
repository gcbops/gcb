const GcbLoginModule = (() => {
  let initialized = false;

  function getElements() {
    return {
      screen: document.getElementById("gcb-login-screen"),
      button: document.getElementById("gcb-google-login-button"),
      buttonText: document.querySelector(".gcb-google-login-text"),
      spinner: document.querySelector(".gcb-login-spinner"),
      error: document.getElementById("gcb-login-error"),
    };
  }

  function show() {
    const { screen } = getElements();

    if (!screen) {
      console.error("[GCB Login] Login screen was not found.");

      return;
    }

    screen.classList.remove("d-none");
  }

  function hide() {
    const { screen } = getElements();

    if (!screen) {
      return;
    }

    screen.classList.add("d-none");
  }

  function setLoading(loading) {
    const { button, buttonText, spinner } = getElements();

    if (!button) {
      return;
    }

    button.disabled = loading;

    if (buttonText) {
      buttonText.textContent = loading
        ? "Connecting to Google..."
        : "Continue with Google";
    }

    spinner?.classList.toggle("d-none", !loading);
  }

  function showError(message) {
    const { error } = getElements();

    if (!error) {
      return;
    }

    error.textContent = message || "Unable to start Google sign-in.";

    error.classList.remove("d-none");
  }

  function clearError() {
    const { error } = getElements();

    if (!error) {
      return;
    }

    error.textContent = "";
    error.classList.add("d-none");
  }

  function requestLoginUrl() {
    return new Promise((resolve, reject) => {
      google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(reject)
        .createGcbLoginUrl();
    });
  }

  async function login() {
    clearError();
    setLoading(true);

    try {
      const loginUrl = await requestLoginUrl();

      // console.log("[GCB Login] Google login URL received:", loginUrl);

      if (!loginUrl) {
        throw new Error("Google login URL was not returned.");
      }

      /*
       * GAS is running inside the GitHub Pages iframe.
       *
       * Let the GitHub wrapper perform the
       * top-level navigation to Google.
       */
      if (window.parent !== window && window.GCB_IS_GITHUB_EMBEDDED === true) {
        // console.log("[GCB Login] Sending login request to GitHub wrapper.");

        // console.log("[GCB Login] window.top:", window.top);

        window.top.postMessage(
          {
            type: "GCB_LOGIN_REQUEST",
            url: loginUrl,
          },
          "https://gcbops.github.io",
        );

        // console.log("[GCB Login] Login request sent to GitHub wrapper.");

        return;
      }

      /*
       * Direct GAS access fallback.
       */
      setLoading(false);
      window.location.href = loginUrl;
    } catch (error) {
      console.error("[GCB Login] Failed to start login:", error);

      showError(error?.message || "Unable to start Google sign-in.");

      setLoading(false);
    }
  }

  function bindEvents() {
    const { button } = getElements();

    if (!button) {
      console.warn("[GCB Login] Login button was not found.");

      return;
    }

    button.addEventListener("click", login);
  }

  function bindHelpEvents() {
    const toggle = document.getElementById("gcb-login-help-toggle");
    const content = document.getElementById("gcb-login-help-content");

    if (!toggle || !content) {
      return;
    }

    toggle.addEventListener("click", () => {
      const isExpanded = toggle.getAttribute("aria-expanded") === "true";

      toggle.setAttribute("aria-expanded", String(!isExpanded));
      content.classList.toggle("d-none", isExpanded);

      const icon = toggle.querySelector("i");

      icon?.classList.toggle("fa-chevron-down", isExpanded);
      icon?.classList.toggle("fa-chevron-up", !isExpanded);
    });
  }

  function init() {
    if (initialized) {
      return;
    }

    initialized = true;

    bindEvents();
    bindHelpEvents();
  }

  return {
    init,
    show,
    hide,
  };
})();

export { GcbLoginModule };
