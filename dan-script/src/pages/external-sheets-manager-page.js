import { HourSummary } from "../hours/hour-summary.js";
import { AppUtils } from "../utils.js";
import { DataTableModule } from "../tables/data-table.js";

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
      .on(
        "click.externalSheetsPage",
        "#sync-external-sheets",
        syncExternalSheets,
      );

    $(document)
      .off("click.externalSheetsPage", ".external-sheet-view-btn")
      .on("click.externalSheetsPage", ".external-sheet-view-btn", handleView);
  }

  function loadData(reset = false) {
    HourSummary.loadHoursSummary("#hours-summary");

    DataTableModule.showLoader(TABLE_ID, "Loading external sheets...");

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
      DataTableModule.showEmpty(TABLE_ID, "No external sheets configured.");

      return;
    }

    /*
     * DataTables owns the table after initialization.
     * Destroy the previous instance before replacing rows.
     */
    DataTableModule.destroy(TABLE_ID);

    $tbody.empty();

    rows.forEach((row) => {
      $tbody.append(createRow(row));
    });

    /*
     * Initialize only after the rows exist.
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

      header: `
        <strong>
          <i class="fa fa-file-excel-o me-2"></i>
          Add External Sheet
        </strong>
      `,

      body: `
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
      `,

      footer: `
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
      `,

      onOpen($modal) {
        const ns = ".externalSheetModal";

        $modal
          .off(ns)
          .on(`click${ns}`, ".btn-cancel", () => {
            AppUtils.closeModal(MODAL_ID);
          })
          .on(`click${ns}`, ".btn-create", () => {
            const $btn = $modal.find(".btn-create");

            createExternalSheet($modal, $btn);
          });
      },

      onClose($modal) {
        $modal.off(".externalSheetModal");
      },
    });
  }

  function createExternalSheet($modal, $btn) {
    const form = $modal.find("#externalSheetForm")[0];

    if (!form?.checkValidity()) {
      form?.reportValidity();
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
         * Client list changed.
         */
        AppUtils.cacheClear("allClientsData");

        /*
         * External sheet list changed.
         */
        AppUtils.cacheClear(CACHE_KEY);

        /*
         * Keep the client list synchronized.
         */
        google.script.run
          .withFailureHandler((err) => {
            console.error("syncClientSheetList failed:", err);
          })
          .syncClientSheetList();

        loadData(true);
      })
      .withFailureHandler((err) => {
        console.error("createExternalSheet failed:", err);

        loading.restore();

        AppUtils.showDashboardToast(
          err?.message || "Failed to create external sheet.",
          "error",
        );
      })
      .createExternalSheet({
        clientName,
        projects,
      });
  }

  function syncExternalSheets() {
    const $btn = $("#sync-external-sheets");

    const loading = AppUtils.setButtonLoading($btn[0], "Syncing...");

    google.script.run
      .withSuccessHandler((result) => {
        loading.restore();

        AppUtils.cacheClear(CACHE_KEY);

        loadData(true);

        const count = Array.isArray(result) ? result.length : 0;

        AppUtils.showDashboardToast(
          count
            ? `${count} external sheet(s) registered.`
            : "External sheets are already up to date.",
          "success",
        );
      })
      .withFailureHandler((err) => {
        console.error("reconcileExternalSheets failed:", err);

        loading.restore();

        AppUtils.showDashboardToast(
          err?.message || "Failed to sync external sheets.",
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
