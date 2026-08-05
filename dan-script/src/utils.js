import { RouterModule } from "./routers.js";

const AppUtils = (() => {
  const ONE_DAY = 24 * 60 * 60 * 1000;

  const resetableCacheKeyForUpdatingHours = [
    "cache_ActiveClients",
    "cache_OutstandingAccounts",
    "cache_TopPaid",
    "cache_TopProjects",
    "topCardMetrics",
    "grindValues",
    "chartData_daily",
    "chartData_monthly",
    "chartData_yearly",
    "chartData_yearly_2025",
    "chartData_yearly_all"
  ];

  // ---- CACHE ----
  function cacheSet(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
    localStorage.setItem(key + "_time", Date.now());
  }

  function cacheGet(key) {
    const cached = localStorage.getItem(key);
    const time = Number(localStorage.getItem(key + "_time") || 0);

    if (!cached || Date.now() - time > ONE_DAY) {return null;}

    try { return JSON.parse(cached); }
    catch { return null; }
  }

  function cacheExpired(key) {
    const time = Number(localStorage.getItem(key + "_time") || 0);
    return Date.now() - time > ONE_DAY;
  }

  function cacheClear(key) {
    localStorage.removeItem(key);
    localStorage.removeItem(key + "_time");
  }

  function resetCacheKeys(keys = []) {
    if (!Array.isArray(keys)) {return;}
    keys.forEach(key => {
      if (localStorage.getItem(key)) {
        localStorage.setItem(key + "_time", Date.now());
      }
    });
  }

  function clearEverything() {
    localStorage.clear();
  }

  // ---- SAFERUN ----
  function safeRun(fn, delay = 5000) {
    return new Promise(res =>
      setTimeout(() => {
        try { fn(); } catch (e) { showError(e); }
        res();
      }, delay)
    );
  }

  // ---- GOOGLE SCRIPT CALL W/ CACHE ----
  function cachedGScriptCall(cacheKey, gFuncName, args = [], callback, log = false, reset = false) {

    const requestToken = RouterModule.getPageToken();

    const safeCallback = (data) => {

      // 🚫 old page response, ignore
      if (requestToken !== RouterModule.getPageToken()) {
        if (log) {console.log(`[Cache] Ignored stale response: ${gFuncName}`);}
        return;
      }

      callback(data);
    };
    
    const cached = cacheGet(cacheKey);
    
    if (cached) {
      if (log) {console.log(`[Cache] Found data for key "${cacheKey}":`, cached);}
      safeCallback(cached);
    }

    let expired = !cached || cacheExpired(cacheKey);

    if (reset) {expired = reset;}
    if (log) {console.log(`[Cache] Cache expired for key "${cacheKey}"?`, expired);}

    if (expired) {
      if (log) {console.log(`[Cache] Calling Google Script function "${gFuncName}" with args:`, args);}
      safeRun(() => {
        google.script.run
          .withSuccessHandler((data) => {
            if (log) {console.log(`[Cache] Setting cache for key "${cacheKey}" with data:`, data);}
            cacheSet(cacheKey, data);
            safeCallback(data);
          })
          .withFailureHandler((err) => {
            if (log) {console.log(`[Cache] Google Script call failed for "${gFuncName}":`, err);}
            if (requestToken !== RouterModule.getPageToken()) {
              return;
            }
            showError(err);
            showDashboardToast("Something went wrong!", "error");
          })[gFuncName](...args);
      }, 0);
    }
  }

  // ---- EXTRA UTILS ----
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
        const s = err.toString().trim();
        if (s) {msg = s;}
      }
    }

    if (!msg) {msg = "Something went wrong!";}

    console.error("Error:", msg, err);
    showDashboardToast(msg, "error");
  }

  function playNotif() {
    const sound = new Audio("https://raw.githubusercontent.com/gcbops/gcb/main/slick-notification.ogg");
    sound.play().catch(() => { });
  }

  function showDashboardToast(msg, type = "success") {
    if (typeof toastr === "undefined") {return showError("Toastr not found");}
    toastr.options = {
      closeButton: true,
      progressBar: true,
      positionClass: "toast-bottom-center",
      timeOut: "4000"
    };
    toastr[type] ? toastr[type](msg) : toastr.info(msg);
  }

  function initSelect2(parent) {
    const dropdownParent = parent || $(document.body);

    function apply($el, options = {}) {
      if ($el.hasClass("select2-hidden-accessible")) {
        $el.select2("destroy");
      }
      $el.select2({ width: "100%", dropdownParent, ...options });
    }

    $(".js-select2").each(function () {
      apply($(this));
    });

    $(".js-select2-dynamic").each(function () {
      apply($(this), { tags: true });
    });
  }

  function openDrawer(drawerSelector, options = {}) {
    const {
      contentClass = "",
      onOpen = null,
      onClose = null
    } = options;

    const $drawer = $(drawerSelector);
    if (!$drawer.length) {return;}

    const $content = $drawer.find(".drawer-content");

    $drawer.addClass("drawer-open");
    if (contentClass) {$content.addClass(contentClass);}

    if (typeof onOpen === "function") {onOpen($drawer, $content);}

    $drawer.off("click.AppUtilsDrawerClose").on("click.AppUtilsDrawerClose", ".drawer-close", (e) => {
      e.preventDefault();
      closeDrawer($drawer, $content, onClose);
    });
  }

  function closeDrawer($drawer, $content, onClose) {
    if (!$drawer.hasClass("drawer-open")) {return;}
    $drawer.removeClass("drawer-open");
    if (typeof onClose === "function") {onClose($drawer, $content);}
  }

  function submitForm({ gscriptFunc, data = {}, onSuccess, $btn }) {
    if (!gscriptFunc) {throw new Error("No Google Apps Script function provided");}

    if ($btn && $btn.length) {$btn.prop("disabled", true);}

    google.script.run
      .withSuccessHandler(() => {
        if ($btn && $btn.length) {$btn.prop("disabled", false);}
        if (typeof onSuccess === "function") {onSuccess();}
      })
      .withFailureHandler(err => {
        if ($btn && $btn.length) {$btn.prop("disabled", false);}
        showError(err);
        showDashboardToast("Something went wrong!", "error");
      })[gscriptFunc](data);
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
      onClose = null
    } = options;

    const $modal = $(modalSelector);

    if (!$modal.length) {return;}

    const modalEl = $modal[0];
    const $dialog = $modal.find(".modal-dialog");
    const $content = $modal.find(".modal-content");

    // Reset modal placement classes
    $modal.removeClass(
      "modal-top modal-bottom modal-center modal-top-start modal-top-end modal-bottom-start modal-bottom-end"
    );

    // Reset dialog classes
    $dialog.attr("class", "modal-dialog");

    // Size
    if (size) {
      $dialog.addClass(`modal-${size}`);
    }

    // Scrollable
    if (scrollable) {
      $dialog.addClass("modal-dialog-scrollable");
    }

    // Centered
    if (centered || placement === "center") {
      $dialog.addClass("modal-dialog-centered");
    }

    // Custom dialog class
    if (dialogClass) {
      $dialog.addClass(dialogClass);
    }

    // Placement
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

    // Reset content classes
    $content.attr("class", "modal-content");

    if (contentClass) {
      $content.addClass(contentClass);
    }

    $content.html(`
      ${header ? `
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
      ` : ""}

      <div class="modal-body text-center">
        ${body}
      </div>

      ${footer ? `
        <div class="modal-footer justify-content-center">
          ${footer}
        </div>
      ` : ""}
    `);

    // Remove previous listeners
    if (modalEl._shownHandler) {
      modalEl.removeEventListener(
        "shown.bs.modal",
        modalEl._shownHandler
      );
    }

    if (modalEl._hiddenHandler) {
      modalEl.removeEventListener(
        "hidden.bs.modal",
        modalEl._hiddenHandler
      );
    }

    modalEl._shownHandler = () => {

      if (typeof onOpen === "function") {
        onOpen($modal, $dialog, $content);
      }

    };

    modalEl._hiddenHandler = () => {

      if (typeof onClose === "function") {
        onClose($modal, $dialog, $content);
      }

      $content.empty();

      bootstrap.Modal
        .getInstance(modalEl)
        ?.dispose();

    };

    modalEl.addEventListener(
      "shown.bs.modal",
      modalEl._shownHandler,
      { once: true }
    );

    modalEl.addEventListener(
      "hidden.bs.modal",
      modalEl._hiddenHandler,
      { once: true }
    );

    const modal = bootstrap.Modal.getOrCreateInstance(modalEl, {
      backdrop,
      keyboard
    });

    modal.show();

  }

  function closeModal(modalSelector) {

    const modalEl = document.querySelector(modalSelector);

    if (!modalEl) {return;}

    bootstrap.Modal
      .getOrCreateInstance(modalEl)
      .hide();

  }

  return {
    // cache
    resetableCacheKeyForUpdatingHours,
    cacheSet,
    cacheGet,
    cacheClear,
    clearEverything,
    resetCacheKeys,

    // gscript
    cachedGScriptCall,

    // utils
    showError,
    playNotif,
    showDashboardToast,
    initSelect2,
    submitForm,

    // drawer and modal helpers
    openDrawer,
    closeDrawer,
    openModal,
    closeModal
  };
})();

export { AppUtils };