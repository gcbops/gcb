import { AppUtils } from "../utils.js";

const settingsConfigurationPage = (() => {
  let initialized = false;
  const loadedTabs = new Set();

  const tabHandlers = {
    "#tab-content-2": loadIntegrationStatus,
    "#tab-content-3": loadAppearanceSettings,
  };

  function clearCache(btn) {
    const loading = AppUtils.setButtonLoading(btn, "Clearing cache...");

    AppUtils.clearAppCache();

    AppUtils.showDashboardToast("App cache cleared successfully!", "success");
    
    loading.restore();
  }

  function syncClientSheets(btn) {
    const loading = AppUtils.setButtonLoading(btn, "Syncing client lists...");
  
    google.script.run
      .withSuccessHandler(() => {
        AppUtils.showDashboardToast(
          "Client list synced successfully!",
          "success",
        );
        loading.restore();
      })
      .withFailureHandler((err) => {
        console.error("syncClientSheetList failed:", err);

        AppUtils.showDashboardToast(
          "Client list sync failed. Please try again.",
          "error",
        );
        loading.restore();
      })
      .syncClientSheetList();
  }

  function loadIntegrationStatus() {
    google.script.run
      .withSuccessHandler((data) => {
        const fields = {
          notifEmailStatus: data.notifEmail,
          notifDiscordStatus: data.notifDiscord,
          spreadsheetIdStatus: data.spreadsheetId,
          reportFolderIdStatus: data.reportFolderId,
        };

        Object.entries(fields).forEach(([id, config]) => {
          const element = document.getElementById(id);

          if (!element) {
            return;
          }

          const configured = Boolean(config?.configured);

          element.classList.toggle("is-inactive", !configured);

          element.textContent = configured
            ? `✓ Configured — ${config.masked}`
            : "Not configured";
        });
      })
      .withFailureHandler((err) => {
        console.error("getConfigStatus failed:", err);

        AppUtils.showDashboardToast(
          "Failed to load integration settings.",
          "error",
        );
      })
      .getIntegrationStatus();
  }

  function loadAppearanceSettings() {
    // Load appearance settings here.
  }

  function handleClick(e) {
    const btn = e.target.closest("#btnClearCache, #btnSyncClient");

    if (!btn) {
      return;
    }

    e.preventDefault();

    if (btn.id === "btnClearCache") {
      clearCache(btn);
      return;
    }

    if (btn.id === "btnSyncClient") {
      syncClientSheets(btn);
    }
  }

  function handleTabShown(e) {
    const tab = e.target;
    const target = tab.getAttribute("href");

    if (!target) {
      return;
    }

    const handler = tabHandlers[target];

    if (!handler || loadedTabs.has(target)) {
      return;
    }

    loadedTabs.add(target);

    handler();
  }

  function handleSubmit(e) {
    if (e.target.id !== "settingsIntegrationForm") {
      return;
    }

    e.preventDefault();

    const form = e.target;
    const $btn = $(form).find('button[type="submit"], input[type="submit"]');

    saveIntegrationSettings(form, $btn);
  }

  function saveIntegrationSettings(form, $btn) {
    const data = {
      notifEmail: form.notifEmail.value.trim(),
      notifDiscord: form.notifDiscord.value.trim(),
      spreadsheetId: form.spreadsheetId.value.trim(),
      reportFolderId: form.reportFolderId.value.trim(),
    };

    AppUtils.submitForm({
      gscriptFunc: "saveIntegrationSettings",
      data,
      $btn,
      loadingText: "Saving integration settings...",

      onSuccess: (result) => {
        AppUtils.showDashboardToast(
          result?.message || "Integration settings saved successfully!",
          "success",
        );

        loadIntegrationStatus();
      },

      onError: (err) => {
        console.error("saveIntegrationSettings failed:", err);

        AppUtils.showDashboardToast(
          err?.message || "Failed to save integration settings.",
          "error",
        );
      },
    });
  }

  function init() {
    if (initialized) {
      return;
    }

    initialized = true;

    document.addEventListener("click", handleClick);
    document.addEventListener("shown.bs.tab", handleTabShown);
    document.addEventListener("submit", handleSubmit);
  }

  function destroy() {
    if (!initialized) {
      return;
    }

    initialized = false;

    document.removeEventListener("click", handleClick);

    document.removeEventListener("shown.bs.tab", handleTabShown);

    document.removeEventListener("submit", handleSubmit);
  }

  return {
    init,
    destroy
  };
})();

export { settingsConfigurationPage };
