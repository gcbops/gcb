import { RouterModule } from "./routers.js";

const AppUtils = (() => {
  // ---- CACHE ----

  const APP_CACHE_PREFIX = "gcb_";
  const CACHE_TTL = 24 * 60 * 60 * 1000; // 1 day
  let notificationAudio = null;

  const APP_CONFIG = {
    HTML_VERSIONING: false,
  };

  let htmlVersion = null;

  function getHtmlVersion() {
    if (!APP_CONFIG.HTML_VERSIONING) {
      return "";
    }

    if (!htmlVersion) {
      const randomPart = Math.random().toString(36).substring(2, 8);

      htmlVersion = `${Date.now()}_${randomPart}`;
    }

    return htmlVersion;
  }

  function getHtmlCacheKey(cacheKey) {
    const version = getHtmlVersion();

    return version ? `${cacheKey}_${version}` : cacheKey;
  }

  /**
   * Get the actual localStorage key used by the app.
   *
   * Example:
   *   getStorageKey("chartData_daily")
   *   -> "gcb_chartData_daily"
   */
  function getStorageKey(key) {
    return `${APP_CACHE_PREFIX}${key}`;
  }

  /**
   * Get the timestamp key for a cache item.
   *
   * Example:
   *   gcb_chartData_daily
   *   gcb_chartData_daily_time
   */
  function getCacheTimeKey(key) {
    return `${getStorageKey(key)}_time`;
  }

  /**
   * Save data to app cache.
   */
  function cacheSet(key, data) {
    if (!key) {
      return;
    }

    const storageKey = getStorageKey(key);
    const timeKey = getCacheTimeKey(key);

    try {
      localStorage.setItem(storageKey, JSON.stringify(data));
      localStorage.setItem(timeKey, String(Date.now()));
    } catch (e) {
      console.error("Cache set failed:", key, e);
    }
  }

  /**
   * Get data from app cache.
   *
   * Returns:
   *   data -> valid cached data
   *   null -> missing, expired, or invalid cache
   */
  function cacheGet(key) {
    if (!key) {
      return null;
    }

    const storageKey = getStorageKey(key);
    const timeKey = getCacheTimeKey(key);

    const cached = localStorage.getItem(storageKey);
    const time = Number(localStorage.getItem(timeKey) || 0);

    if (!cached || !time) {
      return null;
    }

    if (Date.now() - time > CACHE_TTL) {
      return null;
    }

    try {
      return JSON.parse(cached);
    } catch (e) {
      console.warn(`Invalid cache data for "${key}"`, e);
      return null;
    }
  }

  /**
   * Check whether a cache item is expired.
   */
  function cacheExpired(key) {
    if (!key) {
      return true;
    }

    const time = Number(localStorage.getItem(getCacheTimeKey(key)) || 0);

    if (!time) {
      return true;
    }

    return Date.now() - time > CACHE_TTL;
  }

  /**
   * Remove one cache item.
   */
  function cacheClear(key) {
    if (!key) {
      return;
    }

    try {
      localStorage.removeItem(getStorageKey(key));
      localStorage.removeItem(getCacheTimeKey(key));
    } catch (e) {
      console.error("Cache clear failed:", key, e);
    }
  }

  /**
   * Refresh the timestamp of selected cache keys.
   *
   * This forces the cache to be treated as fresh without
   * changing the cached data.
   */
  function resetCacheKeys(keys = []) {
    if (!Array.isArray(keys)) {
      return;
    }

    keys.forEach((key) => {
      if (!key) {
        return;
      }

      const storageKey = getStorageKey(key);
      const timeKey = getCacheTimeKey(key);

      if (localStorage.getItem(storageKey)) {
        localStorage.setItem(timeKey, String(Date.now()));
      }
    });
  }

  /**
   * Clear all cache belonging to this app.
   *
   * Only keys beginning with "gcb_" are removed.
   */
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

    console.log(`App cache cleared: ${keysToRemove.length} item(s)`);
  }

  // ---- SAFERUN ----
  function safeRun(fn, delay = 0) {
    return new Promise((resolve) => {
      setTimeout(() => {
        try {
          fn();
        } catch (err) {
          showError(err);
        }

        resolve();
      }, delay);
    });
  }

  // ---- GOOGLE SCRIPT CALL W/ CACHE ----
  function cachedGScriptCall(
    cacheKey,
    gFuncName,
    args = [],
    callback,
    log = false,
    reset = false,
  ) {

    const requestToken = RouterModule.getPageToken();

    const safeCallback = (data) => {
      // Ignore response from an old page
      if (requestToken !== RouterModule.getPageToken()) {
        if (log) {
          console.log(`[Cache] Ignored stale response: ${gFuncName}`);
        }
        return;
      }

      if (typeof callback === "function") {
        callback(data);
      }
    };

    /*
     * Get cached data.
     *
     * cacheGet() should already handle:
     * - gcb_ prefix
     * - expiration
     * - JSON parsing
     */
    const cached = cacheGet(cacheKey);

    if (cached !== null) {
      if (log) {
        // console.log(`[Cache] Found data for key "${cacheKey}":`, cached);
      }

      safeCallback(cached);
    }

    /*
     * Only call Apps Script when:
     * - there is no cache
     * - cache has expired
     * - reset was requested
     */
    let shouldFetch = cached === null || cacheExpired(cacheKey);

    if (reset) {
      shouldFetch = true;
    }

    if (log) {
      // console.log(`[Cache] Should fetch "${cacheKey}"?`, shouldFetch);
    }

    if (!shouldFetch) {
      return;
    }

    if (log) {
      // console.log(
      //   `[Cache] Calling Google Script function "${gFuncName}" with args:`,
      //   args,
      // );
    }

    safeRun(() => {
      google.script.run
        .withSuccessHandler((data) => {

          cacheSet(cacheKey, data);
      
          safeCallback(data);
        })
        .withFailureHandler((err) => {
          if (log) {
            console.log(
              `[Cache] Google Script call failed for "${gFuncName}":`,
              err,
            );
          }

          // Ignore errors from old pages
          if (requestToken !== RouterModule.getPageToken()) {
            return;
          }

          showError(err);
        })[gFuncName](...args);
    }, 0);
  }

  // ---- EXTRA UTILS ----

  function escapeHtml(value) {
    if (value === null || value === undefined) {
      return "";
    }

    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function showError(err) {
    const fields = ["message", "error", "details"];
    let msg = "";

    if (typeof err === "string") {
      msg = err.trim();
    } else if (err) {
      for (const field of fields) {
        let value = err[field];

        if (field === "message" && value && typeof value.message === "string") {
          value = value.message;
        }

        if (typeof value === "string" && value.trim()) {
          msg = value.trim();
          break;
        }
      }

      if (!msg && typeof err.toString === "function") {
        const stringValue = err.toString().trim();

        if (stringValue && stringValue !== "[object Object]") {
          msg = stringValue;
        }
      }
    }

    if (!msg) {
      msg = "Something went wrong!";
    }

    console.error("Error:", msg, err);

    /*
     * Don't call showDashboardToast() here if Toastr itself
     * is unavailable, otherwise we can create a recursive
     * showError() -> showDashboardToast() -> showError() loop.
     */
    if (typeof toastr !== "undefined") {
      showDashboardToast(msg, "error");
    }
  }

  function playNotif() {
    try {
      if (!notificationAudio) {
        notificationAudio = new Audio(
          "https://raw.githubusercontent.com/gcbops/gcb/main/slick-notification.ogg",
        );

        notificationAudio.preload = "auto";
      }

      notificationAudio.currentTime = 0;

      const playPromise = notificationAudio.play();

      if (playPromise?.catch) {
        playPromise.catch(() => {
          // Browser may block audio until user interaction.
        });
      }
    } catch (err) {
      console.warn("Notification sound could not be played:", err);
    }
  }

  function getInitials(name) {
    if (typeof name !== "string") {
      return "";
    }

    return name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase())
      .join("")
      .slice(0, 3);
  }

  function showDashboardToast(msg, type = "success") {
    if (typeof toastr === "undefined") {
      console.warn("Toastr not found:", msg);
      return;
    }

    const toastType = typeof toastr[type] === "function" ? type : "info";

    toastr.options = {
      closeButton: true,
      progressBar: true,
      positionClass: "toast-bottom-right",
      timeOut: 4000,
    };

    toastr[toastType](msg);
  }

  function initSelect2(parent, options = {}) {
    const $parent = parent ? $(parent) : $(document.body);

    if (!$parent.length) {
      return;
    }

    const $selects = $parent.is("select") ? $parent : $parent.find("select");

    $selects.each(function () {
      const $el = $(this);

      if (!$el.hasClass("js-select2") && !$el.hasClass("js-select2-dynamic")) {
        return;
      }

      if ($el.hasClass("select2-hidden-accessible")) {
        $el.select2("destroy");
      }

      const selectOptions = {
        width: "100%",
        ...options,
      };

      if ($el.hasClass("js-select2-dynamic")) {
        selectOptions.tags = true;
      }

      /*
       * Use the actual modal element as dropdown parent.
       */
      if ($parent.is(".modal")) {
        selectOptions.dropdownParent = $parent;
      }

      $el.select2(selectOptions);
    });
  }

  function openDrawer(drawerSelector, options = {}) {
    const { contentClass = "", onOpen = null, onClose = null } = options;

    const $drawer = $(drawerSelector);

    if (!$drawer.length) {
      return;
    }

    const $content = $drawer.find(".drawer-content");

    /*
     * Remove previous close handler first.
     * This prevents duplicate handlers if openDrawer()
     * is called multiple times.
     */
    $drawer.off("click.AppUtilsDrawerClose");

    $drawer.addClass("drawer-open");

    if (contentClass) {
      $content.addClass(contentClass);
    }

    if (typeof onOpen === "function") {
      onOpen($drawer, $content);
    }

    $drawer.on("click.AppUtilsDrawerClose", ".drawer-close", function (e) {
      e.preventDefault();

      closeDrawer($drawer, $content, onClose);
    });
  }

  function closeDrawer($drawer, $content = null, onClose = null) {
    const $drawerElement = $drawer instanceof jQuery ? $drawer : $($drawer);

    if (!$drawerElement.length) {
      return;
    }

    const $contentElement = $content
      ? $content instanceof jQuery
        ? $content
        : $($content)
      : $drawerElement.find(".drawer-content");

    /*
     * Remove the namespaced handler so reopening the drawer
     * doesn't stack handlers.
     */
    $drawerElement.off("click.AppUtilsDrawerClose");

    if (!$drawerElement.hasClass("drawer-open")) {
      return;
    }

    $drawerElement.removeClass("drawer-open");

    if (typeof onClose === "function") {
      onClose($drawerElement, $contentElement);
    }
  }

  function submitForm({
    gscriptFunc,
    data = {},
    onSuccess,
    onError,
    $btn,
    loadingText = "Saving...",
  }) {
    if (!gscriptFunc) {
      showError("No Google Apps Script function provided");
      return;
    }

    const $button = $btn?.length ? $btn : null;

    let loading = null;

    if ($button) {
      loading = setButtonLoading($button[0], loadingText);
    }

    const restoreButton = () => {
      if (loading) {
        loading.restore();
      }
    };

    try {
      google.script.run
        .withSuccessHandler((result) => {
          if (loading) {
            loading.setSuccess("Saved");
          }

          if (typeof onSuccess === "function") {
            onSuccess(result);
          }
        })
        .withFailureHandler((err) => {
          restoreButton();

          showError(err);

          if (typeof onError === "function") {
            onError(err);
          } else {
            showError("Something went wrong!");
          }
        })[gscriptFunc](data);
    } catch (err) {
      restoreButton();
      showError(err);
    }
  }

  function setButtonLoading(btn, loadingText = "Loading...") {
    const $button = $(btn);

    if (!$button.data("original-text")) {
      $button.data("original-text", $button.html());
    }

    const getLoadingHtml = (text) => `
    ${text}
      <svg class="cog-icon ms-2" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84a.484.484 0 00-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.488.488 0 00-.59.22L2.09 8.83a.488.488 0 00.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.488.488 0 00-.12.61l1.92 3.32c.12.21.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.27.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.488.488 0 00-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
      </svg>
    `;

    const getSuccessHtml = (text) => `
      ${text}
      <svg class="check-icon ms-2" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
      </svg>
    `;

    const setText = (text) => {
      $button.prop("disabled", true).html(getLoadingHtml(text));
    };

    const setSuccess = (text = "Done", delayMs = 2000) => {
      $button.prop("disabled", false).html(getSuccessHtml(text));

      setTimeout(() => {
        restore();
      }, delayMs);
    };

    const restore = () => {
      $button.prop("disabled", false).html($button.data("original-text"));
      $button.removeData("original-text");
    };

    setText(loadingText);

    return {
      setText,
      setSuccess,
      restore,
    };
  }

  function openModal(modalSelector, options = {}) {
    const {
      size = "",
      placement = "center",
      dialogClass = "",
      contentClass = "",
      header = "",
      body = "",
      footer = "",
      backdrop = "static",
      keyboard = true,
      closable = true,
      scrollable = false,
      centered = false,
      onOpen = null,
      onClose = null,
    } = options;

    const $modal = $(modalSelector);

    const $opener = $(document.activeElement);

    if (!$modal.length) {
      return;
    }

    const modalEl = $modal[0];
    const $dialog = $modal.find(".modal-dialog");
    const $content = $modal.find(".modal-content");

    /*
     * Reset modal classes.
     */
    $modal.removeClass(
      [
        "modal-top",
        "modal-bottom",
        "modal-center",
        "modal-top-start",
        "modal-top-end",
        "modal-bottom-start",
        "modal-bottom-end",
      ].join(" "),
    );

    /*
     * Reset dialog classes.
     */
    $dialog.attr("class", "modal-dialog");

    if (size) {
      $dialog.addClass(`modal-${size}`);
    }

    if (scrollable) {
      $dialog.addClass("modal-dialog-scrollable");
    }

    if (centered || placement === "center") {
      $dialog.addClass("modal-dialog-centered");
    }

    if (dialogClass) {
      $dialog.addClass(dialogClass);
    }

    switch (placement) {
      case "top":
        $modal.addClass("modal-top");
        break;

      case "bottom":
        $modal.addClass("modal-bottom");
        break;

      case "top-start":
        $modal.addClass("modal-top-start");
        break;

      case "top-end":
        $modal.addClass("modal-top-end");
        break;

      case "bottom-start":
        $modal.addClass("modal-bottom-start");
        break;

      case "bottom-end":
        $modal.addClass("modal-bottom-end");
        break;

      case "center":
      default:
        $modal.addClass("modal-center");
        break;
    }

    /*
     * Reset modal content classes.
     */
    $content.attr("class", "modal-content");

    if (contentClass) {
      $content.addClass(contentClass);
    }

    $content.html(`
    ${
      header
        ? `
      <div class="modal-header">
        ${header}

        ${
          closable
            ? `
          <button
            type="button"
            class="btn-close"
            data-bs-dismiss="modal"
            aria-label="Close">
          </button>
        `
            : ""
        }
      </div>
    `
        : ""
    }

    <div class="modal-body text-center">
      ${body}
    </div>

    ${
      footer
        ? `
      <div class="modal-footer justify-content-center">
        ${footer}
      </div>
    `
        : ""
    }
  `);

    /*
     * Clean up previous AppUtils handlers.
     */
    $modal.off(".AppUtilsModal");

    $modal.one("shown.bs.modal.AppUtilsModal", function () {
      if (typeof onOpen === "function") {
        onOpen($modal, $dialog, $content);
      }
    });

    $modal.one("hidden.bs.modal.AppUtilsModal", function () {
      if (typeof onClose === "function") {
        onClose($modal, $dialog, $content);
      }

      // Focus the opener if it still exists
      if (
        $opener &&
        $opener.length &&
        $opener[0] &&
        document.body.contains($opener[0])
      ) {
        $opener.trigger("focus");
      } else {
        document.body.focus();
      }

      $content.empty();

      const instance = bootstrap.Modal.getInstance(modalEl);
      if (instance) {
        instance.dispose();
      }
    });

    const modal = bootstrap.Modal.getOrCreateInstance(modalEl, {
      backdrop,
      keyboard,
    });

    modal.show();
  }

  function closeModal(modalSelector) {
    const modalEl = document.querySelector(modalSelector);

    if (!modalEl) {
      return;
    }

    const focusedInside = modalEl.querySelector(":focus");
    if (focusedInside) {
      focusedInside.blur();
    }

    document.body.focus();

    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) {
      modal.hide();
    }
  }

  return {
    // cache
    cacheSet,
    cacheGet,
    cacheClear,
    clearAppCache,
    resetCacheKeys,

    // gscript
    cachedGScriptCall,

    // html
    getHtmlVersion,
    getHtmlCacheKey,

    // utils
    escapeHtml,
    showError,
    playNotif,
    getInitials,
    showDashboardToast,
    initSelect2,
    submitForm,
    setButtonLoading,

    // drawer and modal helpers
    openDrawer,
    closeDrawer,
    openModal,
    closeModal,
  };
}
)();

export { AppUtils };
