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
    
    loading.setSuccess("Cleared Cache");
  }

  function syncClientSheets(btn) {
    const loading = AppUtils.setButtonLoading(btn, "Syncing client lists...");
  
    google.script.run
      .withSuccessHandler(() => {
        AppUtils.showDashboardToast(
          "Client list synced successfully!",
          "success",
        );
        
        loading.setSuccess("Synced Clients");
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
    const btn = e.target.closest(
      "#btnClearCache, #btnSyncClient, #btnBackupAllSheets, #btnAddMasterFormula",
    );

    if (!btn) {
      return;
    }

    e.preventDefault();

    switch (btn.id) {
      case "btnClearCache":
        AppUtils.openConfirmationModal({
          ns: "clearCache",
          title: "Clear Application Cache?",
          message:
            "This will clear all temporary data from your browser's local storage. You may need to log in or reload configurations again.",
          onProceed: ($modal, $btn) => {
            clearCache(btn);
            AppUtils.closeModal("#app-modal");
          },
        });
        break;

      case "btnSyncClient":
        AppUtils.openConfirmationModal({
          ns: "syncClient",
          title: "Sync Client Sheets?",
          message:
            "This will refresh and synchronize the client names on the main sheet. This could take a few moments to pull the latest records.",
          onProceed: ($modal, $btn) => {
            syncClientSheets(btn);
            AppUtils.closeModal("#app-modal");
          },
        });
        break;

      case "btnAddMasterFormula":
        openMasterFormulaModal();
        break;

      case "btnBackupAllSheets":
        AppUtils.openConfirmationModal({
          ns: "backupAllSheets",
          title: "Confirm All Google Sheets Backup?",
          message:
            "This will create a complete backup point for all active sheets. This process might take a few moments.",
          onProceed: ($modal, $btn) => {
            BackupAllSheets(btn);
            AppUtils.closeModal("#app-modal");
          },
        });
        break;

      default:
        // Unknown button; ignore or log if needed
        break;
    }
  }

  function BackupAllSheets(btn) {

    const loading = AppUtils.setButtonLoading(
      btn,
      "Creating Backup...",
    );

    google.script.run
      .withSuccessHandler((result) => {
        AppUtils.showDashboardToast("Backup completed", "info");
        
        console.log("Backup completed:", result);
        
        loading.setSuccess("Backup Completed");
      })
      .withFailureHandler((err) => {
        console.error("Backup failed:", err);
        AppUtils.showDashboardToast(
          "Something went wrong",
          "error",
        );
        loading.restore();
      })
      .backupAllSheets();
  }

  function openMasterFormulaModal() {
    const ns = ".masterFormula";

    AppUtils.openModal("#app-modal", {
      size: "md",
      placement: "center",

      body: `
      <!-- STEP 1: MAIN FORM BODY -->
      <div id="main-modal-body">
        <div class="mb-3">
          <label for="masterFormulaCell" class="form-label">
            Cell Reference
          </label>
          <input
            type="text"
            class="form-none control"
            id="masterFormulaCell"
            placeholder="B39"
            autocomplete="off"
          >
          <div class="form-text">
            Example: B39, N18, or AB25.
          </div>
        </div>

        <div class="mb-3">
          <label for="masterFormulaValue" class="form-label">
            Formula
          </label>
          <textarea
            class="form-control"
            id="masterFormulaValue"
            rows="3"
            placeholder='=COUNTIF(B41:B,"<>")'
          ></textarea>
        </div>

        <div class="small text-muted">
          The formula will be applied to the applicable client
          sheets and the <strong>Projects</strong> sheet of
          registered external spreadsheets.
        </div>
      </div>

      <!-- STEP 2: REVIEW / CONFIRMATION BODY -->
      <div id="review-modal-body" class="d-none">
        <h5 class="modal-title mb-2"><strong>Do you want to proceed?</strong></h5>
        <p>Please review the details before updating the spreadsheets.</p>
      </div>
    `,

      footer: `
      <!-- STEP 1: MAIN FOOTER -->
      <div id="main-modal-footer" class="d-flex gap-2">
        <button type="button" class="btn btn-secondary btn-cancel">
          Cancel
        </button>
        <button type="button" class="btn btn-primary btn-save">
          Apply Formula
        </button>
      </div>

      <!-- STEP 2: REVIEW FOOTER -->
      <div id="review-modal-footer" class="d-flex gap-2 d-none">
        <button type="button" class="btn btn-secondary btn-back">
          Back
        </button>
        <button type="button" class="btn btn-success btn-proceed">
          Proceed
        </button>
      </div>
    `,

      onOpen($modal) {
        $modal
          .off(ns)
          // Cancel Click
          .on(`click${ns}`, ".btn-cancel", () => {
            AppUtils.closeModal("#app-modal");
          })
          // Original Save Click -> Shows confirmation screen
          .on(`click${ns}`, ".btn-save", () => {
            const $cellInput = $modal.find("#masterFormulaCell");
            const $formulaValue = $modal.find("#masterFormulaValue");

            // Remove any previous validation styling
            $cellInput.removeClass("is-invalid");
            $formulaValue.removeClass("is-invalid");

            let isValid = true;

            // Check if Cell Reference is blank
            if (!$cellInput.val().trim()) {
              $cellInput.addClass("is-invalid");
              isValid = false;
            }

            // Check if Formula is blank
            if (!$formulaValue.val().trim()) {
              $formulaValue.addClass("is-invalid");
              isValid = false;
            }

            // Only proceed to review if both inputs are filled
            if (isValid) {
              $modal
                .find("#main-modal-body, #main-modal-footer")
                .addClass("d-none");
              $modal
                .find("#review-modal-body, #review-modal-footer")
                .removeClass("d-none");
            }
          })
          // Back Click -> Restores original form view
          .on(`click${ns}`, ".btn-back", () => {
            $modal
              .find("#review-modal-body, #review-modal-footer")
              .addClass("d-none");
            $modal
              .find("#main-modal-body, #main-modal-footer")
              .removeClass("d-none");
          })
          // Proceed Click -> Triggers original submission logic
          .on(`click${ns}`, ".btn-proceed", () => {
            const $btn = $modal.find(".btn-proceed");
            applyMasterFormula($modal, $btn);
          });
      },

      onClose($modal) {
        $modal.off(ns);
      },
    });
  }

  function isValidCellRef(ref) {
    return /^[A-Z]+[1-9][0-9]*$/i.test(ref);
  }

  function isValidFormula(formula) {
    return /^=\s*[A-Z]+\(/i.test(formula) || /^=.+[A-Z0-9]/i.test(formula);
  }

  function applyMasterFormula($modal, $btn) {
    const cellRef = String($modal.find("#masterFormulaCell").val() || "")
      .trim()
      .toUpperCase();

    const formula = String(
      $modal.find("#masterFormulaValue").val() || "",
    ).trim();

    if (!cellRef) {
      AppUtils.showDashboardToast("Cell reference is required.", "error");

      return;
    }

    if (!isValidCellRef(cellRef)) {
      AppUtils.showDashboardToast(
        "Invalid cell reference. Example: B39 or AB25.",
        "error",
      );

      return;
    }

    if (!formula) {
      AppUtils.showDashboardToast("Formula is required.", "error");

      return;
    }

    if (!isValidFormula(formula)) {
      AppUtils.showDashboardToast("Invalid Google Sheets formula.", "error");

      return;
    }

    const loading = AppUtils.setButtonLoading(
      $btn[0],
      "Applying Formula...",
    );

    google.script.run
      .withSuccessHandler((result) => {
        console.log("applyFormulaToSheets:", result);

        loading.setSuccess("Formula Applied");

        AppUtils.closeModal("#app-modal");

        AppUtils.showDashboardToast("Formula applied successfully.", "success");
      })
      .withFailureHandler((err) => {
        console.error("applyFormulaToSheets failed:", err);

        loading.restore();

        AppUtils.showDashboardToast(
          err?.message || "Failed to apply formula.",
          "error",
        );
      })
      .applyFormulaToSheets(cellRef, formula);
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
