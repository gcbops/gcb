import { HourSummary } from "../hours/hour-summary.js";
import { AppUtils } from "../utils.js";
import { DataTableModule } from "../tables/data-table.js";
import { ReportActions } from "../reports/actions.js";

const externalSheetsManagerPage = (() => {
  let bound = false;

  const TABLE_ID = "#externalSheetsTable";
  const TABLE_TITLE = "External Sheets";
  const CACHE_KEY = "externalSheets";
  const MODAL_ID = "#app-modal";

  function init() {
    if (bound) {
      return;
    }

    bound = true;

    bindActions();
    loadData();
  }

  function destroy() {
    if (!bound) {
      return;
    }

    bound = false;

    $(document).off(".externalSheetsPage");

    DataTableModule.destroy(TABLE_ID);
  }

  function bindActions() {
    $(document)
      .off("click.externalSheetsPage", "#add-external-sheet")
      .on("click.externalSheetsPage", "#add-external-sheet", openCreateModal);

    $(document)
      .off("click.externalSheetsPage", "#sync-external-sheets")
      .on("click.externalSheetsPage", "#sync-external-sheets", function () {
        ReportActions.confirmAction(
          "syncExternalSheets",
          "Sync External Sheets?",
          "This will pull down and reconcile all metadata records from registered external linked files. This process might take a few moments. Proceed?",
          () => {
            syncExternalSheets();
          },
        );
      });


    $(document)
      .off("click.externalSheetsPage", ".external-sheet-view-btn")
      .on("click.externalSheetsPage", ".external-sheet-view-btn", handleView);
  }

  function loadData(reset = false) {
    HourSummary.loadHoursSummary("#hours-summary");

    DataTableModule.showLoader(TABLE_ID);

    AppUtils.cachedGScriptCall(
      CACHE_KEY,
      "getExternalSheets",
      [],
      (data) => {
        renderTable(data);
      },
      false,
      reset,
    );
  }

  function renderTable(data) {
    const rows = Array.isArray(data) ? data : [];
    const $tbody = $(`${TABLE_ID} tbody`);

    if (!$tbody.length) {
      return;
    }

    if (!rows.length) {
      DataTableModule.destroy(TABLE_ID);
      DataTableModule.showEmpty(TABLE_ID, "No external sheets configured.");

      return;
    }

    /*
     * DataTables owns the table after initialization.
     * Destroy the existing instance before replacing its rows.
     */
    DataTableModule.destroy(TABLE_ID);

    $tbody.empty();

    rows.forEach((row) => {
      $tbody.append(createRow(row));
    });

    /*
     * Initialize DataTable only after all rows exist.
     */
    DataTableModule.init(TABLE_TITLE, TABLE_ID);
  }

  function createRow(row) {
    const clientName = AppUtils.escapeHtml(row.clientName ?? "");

    const totalHours = Number(row.totalHours || 0).toFixed(2);

    const projectCount = Number(row.projectCount || 0);

    const status = AppUtils.escapeHtml(row.status || "Active");

    const spreadsheetId = AppUtils.escapeHtml(row.spreadsheetId || "");

    const statusHtml = !row.accessible
      ? `
        <span class="badge bg-danger text-center">
          Inaccessible
        </span>
      `
      : `
        <span class="badge bg-success text-center">
          ${status}
        </span>
      `;

    const actionHtml = !row.spreadsheetId
      ? "-"
      : `
        <button
          type="button"
          class="btn action-btn external-sheet-view-btn"
          data-spreadsheet-id="${spreadsheetId}"
          title="Open External Sheet"
        >
          <i class="pe-7s-look"></i>
        </button>
      `;

    return `
      <tr>

        <td>
          ${clientName}
        </td>

        <td class="text-center">
          ${totalHours}
        </td>

        <td class="text-center">
          ${projectCount}
        </td>

        <td class="text-center">
          ${statusHtml}
        </td>

        <td class="text-center action-btn-group">
          ${actionHtml}
        </td>

      </tr>
    `;
  }

  function openCreateModal() {
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
          Please review the external sheet configurations
          before provisioning.
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
        const namespace = ".externalSheetModal";

        /*
         * Remove any previous handlers before binding.
         * This keeps modal re-opening from accumulating listeners.
         */
        $modal
          .off(namespace)

          .on(`click${namespace}`, ".btn-cancel", () => {
            AppUtils.closeModal(MODAL_ID);
          })

          .on(`click${namespace}`, ".btn-create", () => {
            validateAndShowReview($modal);
          })

          .on(`click${namespace}`, ".btn-back", () => {
            showFormStep($modal);
          })

          .on(`click${namespace}`, ".btn-proceed", () => {
            const $button = $modal.find(".btn-proceed");

            createExternalSheet($modal, $button);
          });
      },

      onClose($modal) {
        $modal.off(".externalSheetModal");
      },
    });
  }

  function validateAndShowReview($modal) {
    const form = $modal.find("#externalSheetForm")[0];

    if (!form) {
      return;
    }

    /*
     * Use the browser's native form validation.
     */
    if (!form.checkValidity()) {
      form.reportValidity();

      return;
    }

    /*
     * Move from the input step to the review step.
     */
    $modal.find("#main-modal-body, #main-modal-footer").addClass("d-none");

    $modal
      .find("#review-modal-body, #review-modal-footer")
      .removeClass("d-none");
  }

  function showFormStep($modal) {
    $modal.find("#review-modal-body, #review-modal-footer").addClass("d-none");

    $modal.find("#main-modal-body, #main-modal-footer").removeClass("d-none");
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

    const loading = AppUtils.setButtonLoading(
      $btn[0],
      "Creating External Sheet...",
    );

    const clientName = String(
      $modal.find("#externalClientName").val() || "",
    ).trim();

    const projects = String(
      $modal.find("#externalProjects").val() || "",
    ).trim();

    google.script.run
      .withSuccessHandler((result) => {
        loading.setSuccess("Sheet Created");

        AppUtils.closeModal(MODAL_ID);

        AppUtils.showDashboardToast(
          `External sheet created for ${result.clientName}.`,
          "success",
        );

        /*
         * Creating an external sheet changes both:
         *
         * 1. The client directory.
         * 2. The external sheet directory.
         */
        AppUtils.cacheClear("allClientsData");
        AppUtils.cacheClear(CACHE_KEY);

        /*
         * Keep the client sheet list synchronized.
         *
         * This operation is independent of the successful
         * external-sheet creation, so its failure should not
         * invalidate the creation result.
         */
        google.script.run
          .withFailureHandler((error) => {
            console.error(
              "[ExternalSheets] syncClientSheetList failed:",
              error,
            );
          })
          .syncClientSheetList();

        /*
         * Reload the external sheet directory using fresh data.
         */
        loadData(true);
      })
      .withFailureHandler((error) => {
        console.error("[ExternalSheets] createExternalSheet failed:", error);

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

  function syncExternalSheets() {
    const $icon = $("#sync-external-sheets i");

    $icon.addClass("fa-spin");

    google.script.run
      .withSuccessHandler((result) => {
        /*
         * Reconciliation changes the external sheet directory,
         * so invalidate the existing cache before reloading.
         */
        AppUtils.cacheClear(CACHE_KEY);

        loadData(true);

        const count = Array.isArray(result) ? result.length : 0;

        AppUtils.showDashboardToast(
          count
            ? `External sheets refreshed successfully`
            : "External sheets are already up to date.",
          "success",
        );

        $icon.removeClass("fa-spin");
      })
      .withFailureHandler((error) => {
        console.error(
          "[ExternalSheets] reconcileExternalSheets failed:",
          error,
        );

        $icon.removeClass("fa-spin");

        AppUtils.showDashboardToast(
          error?.message || "Failed to sync external sheets.",
          "error",
        );
      })
      .reconcileExternalSheets();
  }

  function handleView(e) {
    e.preventDefault();

    const spreadsheetId = e.currentTarget.getAttribute("data-spreadsheet-id");

    if (!spreadsheetId) {
      return;
    }

    window.open(
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return {
    init,
    destroy,
  };
})();

export { externalSheetsManagerPage };
