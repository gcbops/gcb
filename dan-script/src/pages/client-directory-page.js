import { AppUtils } from "../utils.js";
import { ClientDirectory } from "../clients/client-directory.js";
import { TableClientSelector } from "../tables/client-selector.js";

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
            ClientDirectory.refreshClientDirectory("clientDirectoryData", () => {
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
          .on(`click${namespace}`, ".btn-back", () => {
            showFormStep($modal);
          })

          /*
           * Create client
           */
          .on(`click${namespace}`, ".btn-proceed", () => {
            const $button = $modal.find(".btn-proceed");

            submitAddClient($modal, $button);
          });
      },

      onClose($modal) {
        $modal.off(".addClientModal");
      },
    });
  }

  function submitAddClient($modal, $button) {
    const form = $modal.find("#addClientForm")[0];

    if (!form) {
      return;
    }

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const clientName = String($modal.find("#sheet_name").val() || "").trim();

    if (!clientName) {
      return;
    }

    AppUtils.submitForm({
      gscriptFunc: "createClientSheet",

      data: {
        name: clientName,
      },

      $btn: $button,

      loadingText: "Creating new client",

      onSuccess: () => {
        AppUtils.closeModal(MODAL_ID);

        AppUtils.showDashboardToast(
          "Client sheet created successfully!",
          "success",
        );

        /*
         * Refresh the client list on the server.
         *
         * Failure here should not invalidate
         * the successfully-created sheet.
         */
        google.script.run
          .withFailureHandler((error) => {
            console.error("[clientDirectory] syncClientSheetList failed:", error);

            AppUtils.showError("Syncing error!");
          })
          .syncClientSheetList();

        /*
         * The directory data is now stale.
         */
        AppUtils.cacheClear("clientDirectoryData");

        /*
         * Reload the directory using fresh data.
         */
        ClientDirectory.refreshClientDirectory("clientDirectoryData");
      },
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
          .on(`click${namespace}`, ".btn-back", () => {
            showFormStep($modal);
          })

          /*
           * Create external sheet
           */
          .on(`click${namespace}`, ".btn-proceed", () => {
            const $button = $modal.find(".btn-proceed");

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

    const clientName = String(
      $modal.find("#externalClientName").val() || "",
    ).trim();

    const projects = String(
      $modal.find("#externalProjects").val() || "",
    ).trim();

    if (!clientName || !projects) {
      return;
    }

    const loading = AppUtils.setButtonLoading(
      $btn[0],
      "Creating External Sheet",
    );

    google.script.run
      .withSuccessHandler((result) => {
        loading.setSuccess("Sheet Created");

        AppUtils.closeModal(MODAL_ID);

        AppUtils.showDashboardToast(
          `External sheet created for ${result.clientName}.`,
          "success",
        );

        /*
         * External clients are included in the
         * Client Directory, so invalidate it.
         */
        AppUtils.cacheClear("clientDirectoryData");

        /*
         * Keep the client sheet list synchronized.
         */
        google.script.run
          .withFailureHandler((error) => {
            console.error("[clientDirectory] syncClientSheetList failed:", error);
          })
          .syncClientSheetList();

        /*
         * Reload the directory.
         */
        ClientDirectory.refreshClientDirectory("clientDirectoryData");
      })
      .withFailureHandler((error) => {
        console.error("[clientDirectory] createExternalSheet failed:", error);

        loading.restore();

        AppUtils.showDashboardToast(
          error?.message || "Failed to create external sheet.",
          "error",
        );
      })
      .createExternalSheet({
        clientName,
        projects,
      });
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
