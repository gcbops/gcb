import { HourSummary } from "../hours/hour-summary.js";
import { AppUtils } from "../utils.js";

const externalSheetsManagerPage = (() => {
  let bound = false;

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

    $(document).off(".externalSheetsPage");

    destroyTable();
  };

  const bindActions = () => {
    $(document)
      .off("click.externalSheetsPage", "#add-external-sheet")
      .on("click.externalSheetsPage", "#add-external-sheet", openCreateModal);

    $(document)
      .off("click.externalSheetsPage", "#sync-external-sheets")
      .on("click.externalSheetsPage", "#sync-external-sheets", syncExternalSheets);

    $(document)
      .off("click.externalSheetsPage", ".external-sheet-view-btn")
      .on("click.externalSheetsPage", ".external-sheet-view-btn", handleView);
  };

  const loadData = (reset = false) => {
    HourSummary.loadHoursSummary("#hours-summary");

    AppUtils.cachedGScriptCall(
      "externalSheets",
      "getExternalSheets",
      [],
      (data) => {
        renderTable(data);
      },
      false,
      reset,
    );
  };

  const renderTable = (data) => {
    const rows = Array.isArray(data) ? data : [];

    destroyTable();

    $("#externalSheetsTable").DataTable({
      data: rows,

      columns: [
        {
          data: "clientName",
          defaultContent: "-",
        },

        {
          data: "totalHours",
          defaultContent: 0,
          render: (value) => {
            return Number(value || 0).toFixed(2);
          },
        },

        {
          data: "projectCount",
          defaultContent: 0,
        },

        {
          data: "status",
          defaultContent: "Unknown",
          className: "text-center",
          render: (value, type, row) => {
            if (!row.accessible) {
              return `
                <span class="badge bg-danger text-center">
                  Inaccessible
                </span>
              `;
            }

            return `
              <span class="badge bg-success text-center">
                ${escapeHtml(value || "Active")}
              </span>
            `;
          },
        },

        {
          data: null,
          orderable: false,
          searchable: false,
          className: "action-btn",

          render: (data, type, row) => {
            if (!row.spreadsheetId) {
              return "-";
            }

            return `
              <button
                type="button"
                class="btn external-sheet-view-btn"
                data-spreadsheet-id="${escapeHtml(row.spreadsheetId)}"
              >
                <i class="pe-7s-look"></i>
              </button>
            `;
          },
        },
      ],

      pageLength: 10,

      responsive: true,

      autoWidth: false,

      language: {
        emptyTable: "No external sheets configured.",
      },
    });
  };

  const openCreateModal = () => {
    const modalId = "#app-modal";

    AppUtils.openModal(modalId, {
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
            AppUtils.closeModal(modalId);
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
  };

  const createExternalSheet = ($modal, $btn) => {
    const form = $modal.find("#externalSheetForm")[0];

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const loading = AppUtils.setButtonLoading($btn[0], "Creating External Sheet...");

    const clientName = String(
      $modal.find("#externalClientName").val() || "",
    ).trim();

    const projects = String(
      $modal.find("#externalProjects").val() || "",
    ).trim();

    google.script.run
      .withSuccessHandler((result) => {
        loading.restore();

        AppUtils.closeModal("#app-modal");

        AppUtils.showDashboardToast(
          `External sheet created for ${result.clientName}.`,
          "success",
        );

        google.script.run
          .withFailureHandler(() => AppUtils.showError("Syncing error!"))
          .syncClientSheetList();

        AppUtils.cacheClear("allClientsData");

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
  };

  function syncExternalSheets() {
    const loading = AppUtils.setButtonLoading("#sync-external-sheets", "Syncing...");

    google.script.run
      .withSuccessHandler((result) => {

        loadData(true);

        AppUtils.showDashboardToast(
          result.length
            ? `${result.length} external sheet(s) registered.`
            : "External sheets are already up to date.",
          "success",
        );

        loading.restore();
      })
      .withFailureHandler((err) => {
        console.error("reconcileExternalSheets failed:", err);

        AppUtils.showDashboardToast("Failed to sync external sheets.", "error");

        loading.restore();
      })
      .reconcileExternalSheets();
  }

  const handleView = (e) => {
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
  };

  const destroyTable = () => {
    const $table = $("#externalSheetsTable");

    if ($.fn.DataTable && $.fn.DataTable.isDataTable("#externalSheetsTable")) {
      $table.DataTable().clear().destroy();
    }
  };

  const escapeHtml = (value) => {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  return {
    init,
    destroy,
  };
})();

export { externalSheetsManagerPage };
