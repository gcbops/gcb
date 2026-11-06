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
              <label for="sheet_name" class="form-label">
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
            <strong>Review Client Creation</strong>
          </h5>

          <p class="text-muted">
            Please verify the client information before creating the client sheet.
          </p>

          <div class="border rounded p-3">
            <div class="small text-muted">Client Name</div>
            <div
              id="reviewClientName"
              class="font-weight-bold"
            ></div>
          </div>
        </div>
      `,

      footer: `
        <div id="main-modal-footer" class="d-flex gap-2">
          <button
            type="button"
            class="btn btn-secondary btn-cancel"
          >
            Cancel
          </button>

          <button
            type="button"
            class="btn btn-primary btn-review"
          >
            <i class="fa fa-plus me-1"></i>
            Add Client
          </button>
        </div>

        <div id="review-modal-footer" class="d-flex gap-2 d-none">
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

      review: {
        enabled: true,

        getData($modal) {
          const form = $modal.find("#addClientForm")[0];

          if (!form) {
            return null;
          }

          if (!form.checkValidity()) {
            form.reportValidity();
            return null;
          }

          const result = ValidationModule.sheetName(
            $modal.find("#sheet_name").val(),
            "Client name",
          );

          if (!result.valid) {
            AppUtils.showDashboardToast(result.message, "error");
            return null;
          }

          return {
            clientName: result.value,
          };
        },

        onReview($modal, data) {
          $modal.find("#reviewClientName").text(data.clientName);
        },

        onProceed($modal, data, $btn) {
          return submitAddClient($modal, $btn, data);
        },
      },

      onOpen($modal) {
        const namespace = ".addClientModal";

        $modal.off(namespace);

        $modal.on(`click${namespace}`, ".btn-cancel", () => {
          AppUtils.closeModal(MODAL_ID);
        });
      },

      onClose($modal) {
        $modal.off(".addClientModal");
      },
    });
  }

  function submitAddClient($modal, $button, data) {
    const clientName = data?.clientName;

    if (!clientName) {
      return false;
    }

    if ($button.data("requestEnqueued")) {
      return false;
    }

    $button.data("requestEnqueued", true);

    const requestId = RequestManager.enqueue(
      "create-client-sheet",
      { name: clientName },
      `Create Client Sheet — ${clientName}`,
    );

    if (!requestId) {
      $button.removeData("requestEnqueued");
      return false;
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

        syncClientSheetList();
      } else if (finishedRequest.status === "failed") {
        AppUtils.showError(
          finishedRequest.message ||
            `Unable to create client sheet "${clientName}".`,
        );
      }
    });

    return true;
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
              <label for="externalClientName" class="form-label">
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
              <label for="externalProjects" class="form-label">
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
            <strong>Review External Sheet</strong>
          </h5>

          <p class="text-muted">
            Please verify the external sheet configuration before provisioning.
          </p>

          <div class="border rounded p-3">

            <div class="mb-3">
              <div class="small text-muted">Client Name</div>
              <div
                id="reviewExternalClientName"
                class="font-weight-bold"
              ></div>
            </div>

            <div>
              <div class="small text-muted mb-1">Projects</div>
              <div
                id="reviewExternalProjects"
                class="font-weight-bold"
                style="white-space:pre-wrap; overflow-wrap:anywhere;"
              ></div>
            </div>

          </div>
        </div>
      `,

      footer: `
        <div id="main-modal-footer" class="d-flex gap-2">
          <button
            type="button"
            class="btn btn-secondary btn-cancel"
          >
            Cancel
          </button>

          <button
            type="button"
            class="btn btn-primary btn-review"
          >
            <i class="fa fa-plus me-1"></i>
            Create External Sheet
          </button>
        </div>

        <div id="review-modal-footer" class="d-flex gap-2 d-none">
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

      review: {
        enabled: true,

        getData($modal) {
          const form = $modal.find("#externalSheetForm")[0];

          if (!form) {
            return null;
          }

          if (!form.checkValidity()) {
            form.reportValidity();
            return null;
          }

          const clientNameResult = ValidationModule.sheetName(
            $modal.find("#externalClientName").val(),
            "Client name",
          );

          if (!clientNameResult.valid) {
            AppUtils.showDashboardToast(clientNameResult.message, "error");
            return null;
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
            return null;
          }

          return {
            clientName: clientNameResult.value,
            projects: projectsResult.value,
          };
        },

        onReview($modal, data) {
          $modal.find("#reviewExternalClientName").text(data.clientName);

          $modal.find("#reviewExternalProjects").text(data.projects);
        },

        onProceed($modal, data, $btn) {
          return createExternalSheet($modal, $btn, data);
        },
      },

      onOpen($modal) {
        const namespace = ".externalClientModal";

        $modal.off(namespace);

        $modal.on(`click${namespace}`, ".btn-cancel", () => {
          AppUtils.closeModal(MODAL_ID);
        });
      },

      onClose($modal) {
        $modal.off(".externalClientModal");
      },
    });
  }

  function createExternalSheet($modal, $btn, data) {
    const clientName = data?.clientName;
    const projects = data?.projects;

    if (!clientName || !projects) {
      return false;
    }

    if ($btn.data("requestEnqueued")) {
      return false;
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
      return false;
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

        AppUtils.cacheClear("clientDirectoryData");

        syncClientSheetList();
      } else if (finishedRequest.status === "failed") {
        AppUtils.showError(
          finishedRequest.message ||
            `Unable to create external sheet for "${clientName}".`,
        );
      }
    });

    return true;
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

  return {
    init,
    destroy,
  };
})();

export { clientDirectoryPage };
