import { AppUtils } from "../utils/utils.js";
import { ClientDirectory } from "../clients/client-directory.js";
import { TableClientSelector } from "../tables/client-selector.js";
import { ValidationModule } from "../utils/validations.js";
import {
  getAuthArgs,
  handleInvalidSessionError,
} from "../auth/auth-error-handler.js";
import { RequestManager } from "../requests/request-manager.js";

const clientDirectoryPage = (() => {
  let bound = false;

  const MODAL_ID = "#app-modal";

  const init = () => {
    if (bound) {
      return;
    }

    bound = true;

    bindActions();
    loadData();
  };

  const destroy = () => {
    if (!bound) {
      return;
    }

    bound = false;

    $(document).off("click.clientDirectory");
    $(document).off("submit.clientDirectory");

    ClientDirectory.destroy?.();
    TableClientSelector.destroy?.();
  };

  const bindActions = () => {
    $(document)
      /*
       * Add normal client
       */
      .off("click.clientDirectory", '[data-client-action="add-normal"]')
      .on(
        "click.clientDirectory",
        '[data-client-action="add-normal"]',
        openAddClientModal,
      )

      /*
       * Sync client directory
       */
      .off("click.clientDirectory", '[data-client-action="sync"]')
      .on("click.clientDirectory", '[data-client-action="sync"]', function () {
        AppUtils.confirmAction(
          "syncClientsList",
          "Synchronize Client Directory?",
          "This will pull down the latest names, and sheet records from the main hub spreadsheet. Proceed?",
          () => {
            const button = this;

            ClientDirectory.refreshClientDirectory(button, "clientDirectoryData", () => {
              AppUtils.showDashboardToast(
                "Clients refreshed successfully.",
                "success",
              );
            });
          },
        );
      })

      /*
       * Add external client
       */
      .off("click.clientDirectory", '[data-client-action="add-external"]')
      .on(
        "click.clientDirectory",
        '[data-client-action="add-external"]',
        openAddExternalClientModal,
      );
  };

  const loadData = () => {
    ClientDirectory.init("clientDirectoryData");
  };

  /*
   * ============================================================
   * Add Client
   * ============================================================
   */

  function openAddClientModal() {
    AppUtils.openModal(MODAL_ID, {
      size: "md",
      placement: "center",

      header: `<div></div>`,

      body: `
        <div id="main-modal-body">
          <form id="addClientForm">

            <div class="form-group mb-3">
              <label
                for="sheet_name"
                class="form-label"
              >
                Client Name
              </label>

              <input
                type="text"
                name="sheet_name"
                id="sheet_name"
                class="form-control"
                placeholder="Enter client name"
                autocomplete="off"
                required
              >

            </div>

          </form>
        </div>

        <div id="review-modal-body" class="d-none">
          <h5 class="modal-title mb-2">
            <strong>Do you want to proceed?</strong>
          </h5>

          <p>
            Please review the client information
            before creating the client sheet.
          </p>
        </div>
      `,

      footer: `
        <div
          id="main-modal-footer"
          class="d-flex gap-2"
        >
          <button
            type="button"
            class="btn btn-secondary btn-cancel"
          >
            Cancel
          </button>

          <button
            type="button"
            class="btn btn-primary btn-add"
          >
            <i class="fa fa-plus me-1"></i>
            Add Client
          </button>
        </div>

        <div
          id="review-modal-footer"
          class="d-flex gap-2 d-none"
        >
          <button
            type="button"
            class="btn btn-secondary btn-modal-back"
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

      onOpen($modal) {
        const namespace = ".addClientModal";

        $modal
          .off(namespace)

          /*
           * Cancel
           */
          .on(`click${namespace}`, ".btn-cancel", () => {
            AppUtils.closeModal(MODAL_ID);
          })

          /*
           * Form -> Review
           */
          .on(`click${namespace}`, ".btn-add", () => {
            validateAndShowReview($modal, "#addClientForm");
          })

          /*
           * Review -> Form
           */
          .on(`click${namespace}`, ".btn-modal-back", () => {
            showFormStep($modal);
          })

          /*
           * Create client
           */
          .on(`click${namespace}`, ".btn-proceed", () => {
            const $button = $modal.find(".btn-proceed");
            AppUtils.lockModal(MODAL_ID);

            submitAddClient($modal, $button);
          });
      },

      onClose($modal) {
        $modal.off(".addClientModal");
      },
    });
  }

  async function submitAddClient($modal, $button) {
    const form = $modal.find("#addClientForm")[0];

    if (!form) {
      return;
    }

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const clientNameResult = ValidationModule.sheetName(
      $modal.find("#sheet_name").val(),
      "Client name",
    );

    if (!clientNameResult.valid) {
      AppUtils.showDashboardToast(clientNameResult.message, "error");
      return;
    }

    const clientName = clientNameResult.value;

    // Prevent repeated submissions while the request is being enqueued.
    if ($button.data("requestEnqueued")) {
      return;
    }

    $button.data("requestEnqueued", true);

    const requestId = RequestManager.enqueue(
      "create-client-sheet",
      { name: clientName },
      `Create Client Sheet — ${clientName}`,
    );

    if (!requestId) {
      $button.removeData("requestEnqueued");
      return;
    }

    AppUtils.closeModal(MODAL_ID);

    AppUtils.showDashboardToast(`Client creation queued for "${clientName}".`);

    let unsubscribeCompletion = () => {};

    unsubscribeCompletion = RequestManager.subscribe((state) => {
      const finishedRequest = state.history.find(
        (request) => request.id === requestId,
      );

      if (!finishedRequest) {
        return;
      }

      unsubscribeCompletion();

      if (finishedRequest.status === "completed") {
        AppUtils.showDashboardToast(
          `Client sheet "${clientName}" created successfully.`,
          "success",
        );

        // Keep the existing client synchronization workflow.
        syncClientSheetList();
      } else if (finishedRequest.status === "failed") {
        AppUtils.showError(
          finishedRequest.message ||
            `Unable to create client sheet "${clientName}".`,
        );
      }

      // Cancelled/interrupted requests are handled by RequestManager.
    });
  }

  /*
   * ============================================================
   * Add External Client
   * ============================================================
   */

  function openAddExternalClientModal() {
    AppUtils.openModal(MODAL_ID, {
      size: "md",
      placement: "center",

      header: `<div></div>`,

      body: `
        <div id="main-modal-body">
          <form id="externalSheetForm">

            <div class="form-group mb-3">
              <label
                for="externalClientName"
                class="form-label"
              >
                Client Name
              </label>

              <input
                type="text"
                id="externalClientName"
                name="clientName"
                class="form-control"
                placeholder="Enter client name"
                autocomplete="off"
                required
              >
            </div>

            <div class="form-group mb-3">
              <label
                for="externalProjects"
                class="form-label"
              >
                Projects
              </label>

              <input
                type="text"
                id="externalProjects"
                name="projects"
                class="form-control"
                placeholder="proj1, proj2, proj3"
                autocomplete="off"
                required
              >

              <small class="form-text text-muted">
                Enter project names separated by commas.
              </small>
            </div>

          </form>
        </div>

        <div id="review-modal-body" class="d-none">
          <h5 class="modal-title mb-2">
            <strong>Do you want to proceed?</strong>
          </h5>

          <p>
            Please review the external sheet
            configuration before provisioning.
          </p>
        </div>
      `,

      footer: `
        <div
          id="main-modal-footer"
          class="d-flex gap-2"
        >
          <button
            type="button"
            class="btn btn-secondary btn-cancel"
          >
            Cancel
          </button>

          <button
            type="button"
            class="btn btn-primary btn-create"
          >
            <i class="fa fa-plus me-1"></i>
            Create External Sheet
          </button>
        </div>

        <div
          id="review-modal-footer"
          class="d-flex gap-2 d-none"
        >
          <button
            type="button"
            class="btn btn-secondary btn-modal-back"
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

      onOpen($modal) {
        const namespace = ".externalClientModal";

        $modal
          .off(namespace)

          /*
           * Cancel
           */
          .on(`click${namespace}`, ".btn-cancel", () => {
            AppUtils.closeModal(MODAL_ID);
          })

          /*
           * Form -> Review
           */
          .on(`click${namespace}`, ".btn-create", () => {
            validateAndShowReview($modal, "#externalSheetForm");
          })

          /*
           * Review -> Form
           */
          .on(`click${namespace}`, ".btn-modal-back", () => {
            showFormStep($modal);
          })

          /*
           * Create external sheet
           */
          .on(`click${namespace}`, ".btn-proceed", () => {
            const $button = $modal.find(".btn-proceed");

            AppUtils.lockModal(MODAL_ID);

            createExternalSheet($modal, $button);
          });
      },

      onClose($modal) {
        $modal.off(".externalClientModal");
      },
    });
  }

  function createExternalSheet($modal, $btn) {
    const form = $modal.find("#externalSheetForm")[0];

    if (!form) {
      return;
    }

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const clientNameResult = ValidationModule.sheetName(
      $modal.find("#externalClientName").val(),
      "Client name",
    );

    if (!clientNameResult.valid) {
      AppUtils.showDashboardToast(clientNameResult.message, "error");
      return;
    }

    const projectsResult = ValidationModule.requiredString(
      $modal.find("#externalProjects").val(),
      "Projects",
      {
        maxLength: 5000,
      },
    );

    if (!projectsResult.valid) {
      AppUtils.showDashboardToast(projectsResult.message, "error");
      return;
    }

    const clientName = clientNameResult.value;
    const projects = projectsResult.value;

    if (!clientName || !projects) {
      return;
    }

    // Prevent duplicate enqueue attempts from this modal.
    if ($btn.data("requestEnqueued")) {
      return;
    }

    $btn.data("requestEnqueued", true);

    const requestId = RequestManager.enqueue(
      "create-external-sheet",
      {
        clientName,
        projects,
      },
      `Create External Sheet — ${clientName}`,
    );

    if (!requestId) {
      $btn.removeData("requestEnqueued");
      return;
    }

    AppUtils.closeModal(MODAL_ID);

    AppUtils.showDashboardToast(
      `External sheet creation queued for "${clientName}".`,
    );

    let unsubscribeCompletion = () => {};

    unsubscribeCompletion = RequestManager.subscribe((state) => {
      const finishedRequest = state.history.find(
        (request) => request.id === requestId,
      );

      if (!finishedRequest) {
        return;
      }

      unsubscribeCompletion();

      if (finishedRequest.status === "completed") {
        AppUtils.showDashboardToast(
          `External sheet created for "${clientName}".`,
          "success",
        );

        // Invalidate the existing Client Directory cache.
        AppUtils.cacheClear("clientDirectoryData");

        // Preserve the existing client synchronization workflow.
        syncClientSheetList();
      } else if (finishedRequest.status === "failed") {
        AppUtils.showError(
          finishedRequest.message ||
            `Unable to create external sheet for "${clientName}".`,
        );
      }
    });
  }

  async function syncClientSheetList() {
    try {
      const [sessionId, signature] = await getAuthArgs();

      AppUtils.gScriptRun({
        gscriptFunc: "syncClientSheetList",

        args: [sessionId, signature],

        onSuccess: () => {
          ClientDirectory.refreshClientDirectory(
            false,
            "clientDirectoryData",
            () => {
              AppUtils.showDashboardToast(
                "Clients refreshed successfully.",
                "success",
              );
            },
          );
        },

        onError: (error) => {
          console.error("[clientDirectory] syncClientSheetList failed:", error);
        },
      });
    } catch (error) {
      if (handleInvalidSessionError(error)) {
        return;
      }

      AppUtils.showError(error?.message || "Unable to sync client sheet list.");
    }
  }

  /*
   * ============================================================
   * Shared Modal Steps
   * ============================================================
   */

  function validateAndShowReview($modal, formSelector) {
    const form = $modal.find(formSelector)[0];

    if (!form) {
      return;
    }

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    $modal.find("#main-modal-body, #main-modal-footer").addClass("d-none");

    $modal
      .find("#review-modal-body, #review-modal-footer")
      .removeClass("d-none");
  }

  function showFormStep($modal) {
    $modal.find("#review-modal-body, #review-modal-footer").addClass("d-none");

    $modal.find("#main-modal-body, #main-modal-footer").removeClass("d-none");
  }

  return {
    init,
    destroy,
  };
})();

export { clientDirectoryPage };
