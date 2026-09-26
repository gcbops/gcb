import { RouterModule } from "../routers.js";
import { AppUtils } from "../utils.js";

const settingsConfigurationPage = (() => {
  let initialized = false;
  const loadedTabs = new Set();
  let masterFormulaOperationId = 0;
  let masterFormulaTimer = null;
  const MODAL_ID = "#app-modal";

  const tabHandlers = {
    // "#tab-content-2": loadIntegrationSettings,
  };

  function handleClick(e) {

    const btn = e.target.closest(
      "#btnClearCache, #btnSyncClient, #btnSyncProjectLists, #btnBackupAllSheets, #btnAddMasterFormula, #btnDeployExternalProjectsMainSheetFormula, #btnDeployExternalProjectsInternalSheetFormula, #btnSyncExternalClients",
    );

    if (!btn) {
      return;
    }

    e.preventDefault();

    const el_id = btn.id;

    switch (el_id) {
      //main tab click
      case "btnClearCache":
        AppUtils.openConfirmationModal({
          ns: "clearCache",
          title: "Clear Application Cache?",
          message:
            "This will clear all temporary data from your browser's local storage. You may need to log in or reload configurations again.",
          onProceed: ($modal, $btn) => {
            clearCache($btn);
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
            syncClientSheets($btn);
          },
        });
        break;

      // case "btnApplyMonthlyBillingFormulas":
      //   AppUtils.openConfirmationModal({
      //     ns: "monthlyBilling",

      //     title: "Apply Monthly Billing Formulas?",

      //     message:
      //       "This will add or update the monthly billing summary formulas on the Projects sheet of all external client spreadsheets. This could take a few moments.",

      //     onProceed: ($modal, $btn) => {
      //       applyBillingAnalyticsFormulas($btn);
      //     },
      //   });

      //   break;

      case "btnSyncExternalClients":
        AppUtils.openConfirmationModal({
          ns: "syncClient",
          title: "Sync External Client Sheets?",
          message:
            "This will refresh and synchronize the client names and records from the registered external client sheets. This could take a few moments to pull the latest records.",
          onProceed: ($modal, $btn) => {
            syncExternalClientSheets($btn);
          },
        });
        break;

      case "btnSyncProjectLists":
        AppUtils.openConfirmationModal({
          ns: "syncProject",
          title: "Update Project List?",
          message:
            "This will refresh and synchronize the overall project list with the latest project records. This could take a few moments.",
          onProceed: ($modal, $btn) => {
            syncClientProjectsFromMain($btn);
          },
        });

        break;

      case "btnAddMasterFormula":
        openMasterFormulaModal();
        break;

      case "btnDeployExternalProjectsMainSheetFormula":
      case "btnDeployExternalProjectsInternalSheetFormula":
        openMasterFormulaModal(el_id);
        break;

      case "btnBackupAllSheets":
        AppUtils.openConfirmationModal({
          ns: "backupAllSheets",
          title: "Confirm All Google Sheets Backup?",
          message:
            "This will create a complete backup point for all active sheets. This process might take a few moments.",
          onProceed: ($modal, $btn) => {
            BackupAllSheets($btn);
          },
        });
        break;

      //other click events

      default:
        // Unknown button; ignore or log if needed
        break;
    }
  }

  // function applyBillingAnalyticsFormulas($btn) {
  //   AppUtils.setButtonLoading($btn, true);

  //   google.script.run
  //     .withSuccessHandler((response) => {
  //       AppUtils.setButtonLoading($btn, false);

  //       if (!response?.success) {
  //         AppUtils.showError("Unable to apply monthly billing formulas.");
  //         return;
  //       }

  //       AppUtils.showDashboardToast(
  //         `Monthly billing formulas applied to ${response.updated} client sheet(s).`,
  //         "success",
  //       );
  //     })
  //     .withFailureHandler((error) => {
  //       AppUtils.setButtonLoading($btn, false);

  //       AppUtils.showError(
  //         error?.message || "Failed to apply monthly billing formulas.",
  //       );
  //     })
  //     .applyBillingAnalyticsFormulas();
  // }

  function clearCache(btn) {
    const loading = AppUtils.setButtonLoading(btn, "Clearing cache");

    AppUtils.clearAppCache();

    AppUtils.showDashboardToast("App cache cleared successfully!", "success");

    AppUtils.closeModal(MODAL_ID);
    
    loading.setSuccess("Cleared Cache");
  }

  function syncExternalClientSheets(btn) {
    const loading = AppUtils.setButtonLoading(
      btn,
      "Syncing sheets",
    );

    google.script.run
      .withSuccessHandler((result) => {
        const count = Array.isArray(result) ? result.length : 0;

        AppUtils.showDashboardToast(
          count
            ? `${count} external sheet(s) synchronized successfully.`
            : "External sheets are already synchronized.",
          "success",
        );

        loading.setSuccess("Clients Synced");

        AppUtils.closeModal(MODAL_ID);
      })
      .withFailureHandler((err) => {
        console.error("reconcileExternalSheets failed:", err);

        AppUtils.showDashboardToast(
          "Failed to synchronize external client sheets. Please try again.",
          "error",
        );

        loading.restore();
      })
      .reconcileExternalSheets();
  }

  function syncClientSheets(btn) {
    const loading = AppUtils.setButtonLoading(btn, "Syncing clients");

    google.script.run
      .withSuccessHandler(() => {
        AppUtils.showDashboardToast(
          "Client list synced successfully!",
          "success",
        );

        loading.setSuccess("Clients Synced");

        AppUtils.closeModal(MODAL_ID);
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

  function syncClientProjectsFromMain(btn) {
    const loading = AppUtils.setButtonLoading(btn, "Updating projects");

    google.script.run
      .withSuccessHandler(() => {
        AppUtils.showDashboardToast(
          "Project data updated successfully.",
          "success",
        );

        loading.setSuccess("Projects Updated");

        AppUtils.closeModal(MODAL_ID);
      })
      .withFailureHandler((err) => {
        console.error("syncClientProjects failed:", err);

        AppUtils.showDashboardToast(
          "Failed to update project data. Please try again.",
          "error",
        );

        loading.restore();
      })
      .syncClientProjects();
  }

  function BackupAllSheets(btn) {

    const loading = AppUtils.setButtonLoading(
      btn,
      "Creating Backup",
    );

    google.script.run
      .withSuccessHandler((result) => {
        AppUtils.showDashboardToast("Backup completed", "info");
        
        console.log("Backup completed:", result);
        
        loading.setSuccess("Backup Completed");

        AppUtils.closeModal(MODAL_ID);
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

  function handleIntegrationListClick(e) {
    const item = e.target.closest(".integration-list-item");
    if (!item) {return;}

    // Ignore "Coming soon" item
    if (item.classList.contains("integration-list-item-coming")) {return;}

    const integration = item.getAttribute("data-integration");
    if (!integration) {return;}

    // Store which integration was clicked
    AppUtils.cacheSet("selectedIntegration", integration);

    // Navigate to integrations page
    RouterModule.go("integrationsConfiguration");
  }

  function isValidCellRef(ref) {
    return /^[A-Z]+[1-9][0-9]*$/i.test(ref);
  }

  function isValidFormula(formula) {
    return /^=\s*[A-Z]+\(/i.test(formula) || /^=.+[A-Z0-9]/i.test(formula);
  }

  function startMasterFormulaOperation() {
    masterFormulaOperationId++;

    if (masterFormulaTimer) {
      clearTimeout(masterFormulaTimer);
      masterFormulaTimer = null;
    }

    return masterFormulaOperationId;
  }

  function isMasterFormulaOperationActive(operationId) {
    return operationId === masterFormulaOperationId;
  }

  function cancelMasterFormulaOperation() {
    masterFormulaOperationId++;

    if (masterFormulaTimer) {
      clearTimeout(masterFormulaTimer);
      masterFormulaTimer = null;
    }
  }

  function getMasterFormulaFormData($modal) {
    const cellRef = String($modal.find("#masterFormulaCell").val() || "")
      .trim()
      .toUpperCase();

    const formula = String(
      $modal.find("#masterFormulaValue").val() || "",
    ).trim();

    if (!cellRef) {
      AppUtils.showDashboardToast("Cell reference is required.", "error");
      return null;
    }

    if (!isValidCellRef(cellRef)) {
      AppUtils.showDashboardToast(
        "Invalid cell reference. Example: B39 or AB25.",
        "error",
      );
      return null;
    }

    if (!formula) {
      AppUtils.showDashboardToast("Formula is required.", "error");
      return null;
    }

    if (!isValidFormula(formula)) {
      AppUtils.showDashboardToast("Invalid Google Sheets formula.", "error");
      return null;
    }

    return {
      cellRef,
      formula,
    };
  }

  function openMasterFormulaModal(isNotMain = false) {
    const ns = ".masterFormula";

    AppUtils.openModal(MODAL_ID, {
      size: "md",
      placement: "center",

      header: "<div></div>",

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
            rows="10"
            style="height: 200px;"
            placeholder='=COUNTIF(B41:B,"<>")'
          ></textarea>
        </div>

        <div class="small text-muted">
          The formula will be applied to the applicable sheets.
        </div>
      </div>

      <!-- STEP 2: REVIEW / CONFIRMATION BODY -->
      <div id="review-modal-body" class="d-none">
        <h5 class="modal-title mb-2">
          <strong>Do you want to proceed?</strong>
        </h5>

        <p>
          Please review the details before updating the spreadsheets.
        </p>
      </div>
    `,

      footer: `
      <!-- STEP 1: MAIN FOOTER -->
      <div
        id="main-modal-footer"
        class="d-flex gap-2"
      >
        <!-- APP-MODAL-MAIN-ACTIONS -->

        <button
          type="button"
          class="btn btn-secondary btn-cancel"
        >
          Cancel
        </button>

        <button
          type="button"
          class="btn btn-primary btn-save"
        >
          Apply Formula
        </button>
      </div>

      <!-- STEP 2: REVIEW FOOTER -->
      <div
        id="review-modal-footer"
        class="d-flex gap-2 d-none"
      >
        <!-- APP-MODAL-REVIEW-ACTIONS -->

        <button
          type="button"
          class="btn btn-secondary btn-back"
        >
          Back
        </button>

        <button
          type="button"
          class="btn btn-success btn-proceed"
        >
          Proceed
        </button>
      </div>
    `,

      /*
       * ----------------------------------------------------------
       * OPTIONAL CUSTOM ACTIONS
       * ----------------------------------------------------------
       */
      footerActions: {
        review: [
          {
            label: "Apply to External Main Sheet",
            icon: "pe-7s-shuffle",
            onClick: ($modal, $btn) => {
              applyFormulaToExternalProjectsFromModal(
                $modal,
                $(MODAL_ID).find(".btn-proceed"),
              );
            },
          },

          {
            label: "Apply to External Internal Sheets",
            icon: "pe-7s-shuffle",
            onClick: ($modal, $btn) => {
              applyFormulaToExternalProjectSheetsFromModal(
                $modal,
                $(MODAL_ID).find(".btn-proceed"),
              );
            },
          },
        ],
      },

      onOpen($modal) {
        $modal
          .off(ns)

          /*
           * STEP 1
           * ------------------------------------------------------
           */

          .on(`click${ns}`, ".btn-cancel", () => {
            AppUtils.closeModal(MODAL_ID);
          })

          .on(`click${ns}`, ".btn-save", () => {
            const $cellInput = $modal.find("#masterFormulaCell");

            const $formulaValue = $modal.find("#masterFormulaValue");

            /*
             * Remove previous validation styling.
             */
            $cellInput.removeClass("is-invalid");
            $formulaValue.removeClass("is-invalid");

            let isValid = true;

            /*
             * Validate Cell Reference.
             */
            if (!$cellInput.val().trim()) {
              $cellInput.addClass("is-invalid");
              isValid = false;
            }

            /*
             * Validate Formula.
             */
            if (!$formulaValue.val().trim()) {
              $formulaValue.addClass("is-invalid");
              isValid = false;
            }

            /*
             * Only show review if valid.
             */
            if (isValid) {
              $modal
                .find("#main-modal-body, #main-modal-footer")
                .addClass("d-none");

              $modal
                .find("#review-modal-body, #review-modal-footer")
                .removeClass("d-none");
            }
          })

          /*
           * STEP 2
           * ------------------------------------------------------
           */

          .on(`click${ns}`, ".btn-back", () => {
            $modal
              .find("#review-modal-body, #review-modal-footer")
              .addClass("d-none");

            $modal
              .find("#main-modal-body, #main-modal-footer")
              .removeClass("d-none");
          })

          .on(`click${ns}`, ".btn-proceed", () => {
            const $btn = $modal.find(".btn-proceed");

            if (isNotMain === "btnDeployExternalProjectsInternalSheetFormula") {
              applyFormulaToExternalProjectSheetsFromModal($modal, $btn);
            } else if (
              isNotMain === "btnDeployExternalProjectsMainSheetFormula"
            ) {
              applyFormulaToExternalProjectsFromModal($modal, $btn);
            } else {
              applyMasterFormula($modal, $btn);
            }
          });
      },

      onClose($modal) {
        $modal.off(ns);
      },
    });
  }

  function applyMasterFormula($modal, $btn) {
    const data = getMasterFormulaFormData($modal);

    if (!data) {
      return;
    }

    const { cellRef, formula } = data;

    const operationId = startMasterFormulaOperation();

    const loading = AppUtils.setButtonLoading($btn[0], "Applying Formula");

    google.script.run
      .withSuccessHandler((result) => {
        if (!isMasterFormulaOperationActive(operationId)) {
          return;
        }

        console.log("applyFormulaToMainSheets:", result);

        loading.setSuccess("Formula Applied");

        AppUtils.showDashboardToast(
          "Formula applied to the main spreadsheet.",
          "success",
        );

        AppUtils.closeModal(MODAL_ID);

        masterFormulaTimer = setTimeout(() => {
          masterFormulaTimer = null;

          if (!isMasterFormulaOperationActive(operationId)) {
            return;
          }

          openExternalProjectsConfirmation(cellRef, formula, operationId);
        }, 1000);
      })
      .withFailureHandler((err) => {
        if (!isMasterFormulaOperationActive(operationId)) {
          return;
        }

        console.error("applyFormulaToMainSheets failed:", err);

        loading.restore();

        AppUtils.showDashboardToast(
          err?.message || "Failed to apply formula to the main spreadsheet.",
          "error",
        );
      })
      .applyFormulaToMainSheets(cellRef, formula);
  }

  function openExternalProjectsConfirmation(cellRef, formula, operationId) {
    if (!isMasterFormulaOperationActive(operationId)) {
      return;
    }

    AppUtils.openConfirmationModal({
      ns: "externalProjects",

      title: "Update External Projects?",

      message:
        "This will apply the formula to the Projects sheet of every registered external spreadsheet, including the external template. This may take some time.",

      onProceed: ($modal, $btn) => {
        applyFormulaToExternalProjects(cellRef, formula, $btn[0], operationId);
      },

      onBack: () => {
        cancelMasterFormulaOperation();
        AppUtils.closeModal(MODAL_ID);
      },
    });
  }

  function applyFormulaToExternalProjectsFromModal($modal, $btn) {
    const data = getMasterFormulaFormData($modal);

    if (!data) {
      return;
    }

    const { cellRef, formula } = data;

    const operationId = startMasterFormulaOperation();

    applyFormulaToExternalProjects(cellRef, formula, $btn[0], operationId);
  }

  function applyFormulaToExternalProjects(cellRef, formula, btn, operationId) {
    if (!isMasterFormulaOperationActive(operationId)) {
      return;
    }

    const loading = AppUtils.setButtonLoading(btn, "Updating Projects");

    google.script.run
      .withSuccessHandler((result) => {
        if (!isMasterFormulaOperationActive(operationId)) {
          return;
        }

        console.log("applyFormulaToExternalProjects:", result);

        loading.setSuccess("Formula Applied");

        AppUtils.showDashboardToast(
          `External Projects updated successfully: ${result.updated} spreadsheet(s).`,
          "success",
        );

        masterFormulaTimer = setTimeout(() => {
          masterFormulaTimer = null;

          if (!isMasterFormulaOperationActive(operationId)) {
            return;
          }

          openExternalProjectSheetsConfirmation(cellRef, formula, operationId);
        }, 1000);
      })
      .withFailureHandler((err) => {
        if (!isMasterFormulaOperationActive(operationId)) {
          return;
        }

        console.error("applyFormulaToExternalProjects failed:", err);

        loading.restore();

        AppUtils.showDashboardToast(
          err?.message || "Failed to update External Projects.",
          "error",
        );
      })
      .applyFormulaToExternalProjects(cellRef, formula);
  }

  function openExternalProjectSheetsConfirmation(
    cellRef,
    formula,
    operationId,
  ) {
    if (!isMasterFormulaOperationActive(operationId)) {
      return;
    }

    AppUtils.openConfirmationModal({
      ns: "externalProjectSheets",

      title: "Update External Project Sheets?",

      message:
        "This will apply the formula to the individual project sheets inside every registered external spreadsheet, including the external template. This may take some time.",

      onProceed: ($modal, $btn) => {
        applyFormulaToExternalProjectSheets(
          cellRef,
          formula,
          $btn[0],
          operationId,
        );
      },

      onBack: () => {
        cancelMasterFormulaOperation();
        AppUtils.closeModal(MODAL_ID);
      },
    });
  }

  function applyFormulaToExternalProjectSheetsFromModal($modal, $btn) {
    const data = getMasterFormulaFormData($modal);

    if (!data) {
      return;
    }

    const { cellRef, formula } = data;

    const operationId = startMasterFormulaOperation();

    applyFormulaToExternalProjectSheets(cellRef, formula, $btn[0], operationId);
  }

  function applyFormulaToExternalProjectSheets(
    cellRef,
    formula,
    btn,
    operationId,
  ) {
    if (!isMasterFormulaOperationActive(operationId)) {
      return;
    }

    const loading = AppUtils.setButtonLoading(btn, "Updating Sheets");

    google.script.run
      .withSuccessHandler((result) => {
        if (!isMasterFormulaOperationActive(operationId)) {
          return;
        }

        console.log("applyFormulaToExternalProjectSheets:", result);

        loading.setSuccess("Sheets Updated");

        AppUtils.showDashboardToast(
          `External project sheets updated successfully: ${result.updated} sheet(s).`,
          "success",
        );

        cancelMasterFormulaOperation();
      })
      .withFailureHandler((err) => {
        if (!isMasterFormulaOperationActive(operationId)) {
          return;
        }

        console.error("applyFormulaToExternalProjectSheets failed:", err);

        loading.restore();

        AppUtils.showDashboardToast(
          err?.message || "Failed to update external project sheets.",
          "error",
        );
      })
      .applyFormulaToExternalProjectSheets(cellRef, formula);
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

  function init() {
    if (initialized) {
      return;
    }

    initialized = true;

    document.addEventListener("click", handleClick);
    document.addEventListener("click", handleIntegrationListClick);
    document.addEventListener("shown.bs.tab", handleTabShown);
  }

  function destroy() {
    if (!initialized) {
      return;
    }

    initialized = false;

    document.removeEventListener("click", handleClick);

    document.removeEventListener("shown.bs.tab", handleTabShown);

  }

  return {
    init,
    destroy
  };
})();

export { settingsConfigurationPage };
