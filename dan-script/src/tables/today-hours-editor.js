import { AppUtils } from "../utils.js";

const TodayHoursEditor = (() => {
  const MODAL_ID = "#app-modal";
  const RECORDS_ID = "#todayHoursRecords";
  const CLIENT_ID = "#editTodayClient";
  const CACHE_PREFIX = "todayManualHours_";

  function open(clientName) {
    clientName = String(clientName || "").trim();

    if (!clientName) {
      AppUtils.showDashboardToast("Client is required.", "error");
      return;
    }

    const ns = ".todayHoursEditor";

    AppUtils.openModal(MODAL_ID, {
      size: "xl",
      placement: "center",

      header: `
        <strong>Edit Today's Hours</strong>
      `,

      body: `
        <input
          type="hidden"
          id="${CLIENT_ID.replace("#", "")}"
          value="${escapeHtml(clientName)}"
        >

        <div id="${RECORDS_ID.replace("#", "")}">
          <div class="text-center text-muted py-3">
            Loading today's records...
          </div>
        </div>
      `,

      footer: `
        <button
          type="button"
          class="btn btn-secondary btn-cancel">
          Cancel
        </button>

        <button
          type="button"
          class="btn btn-primary btn-save">
          Save Changes
        </button>
      `,

      onOpen($modal) {
        $modal
          .off(ns)
          .on(`click${ns}`, ".btn-cancel", () => {
            AppUtils.closeModal(MODAL_ID);
          })
          .on(`click${ns}`, ".btn-save", () => {
            save($modal);
          })
          .on(`click${ns}`, ".btn-delete-today-hours", function () {
            markForDelete($(this));
          });

        load(clientName, $modal);
      },

      onClose($modal) {
        $modal.off(ns);
      },
    });
  }

  function load(clientName, $modal) {
    AppUtils.cachedGScriptCall(
      `${CACHE_PREFIX}${clientName}`,
      "getTodayClientHours",
      [clientName],
      (response) => {
        if (!response?.success) {
          $modal.find(RECORDS_ID).html(`
            <div class="text-center text-danger py-3">
              ${escapeHtml(
                response?.message || "Unable to load today's records.",
              )}
            </div>
          `);

          return;
        }

        loadTaskOptions(clientName, $modal, response.records || []);
      },
      false,
      false,
    );
  }

  function loadTaskOptions(clientName, $modal, records) {
    AppUtils.cachedGScriptCall(
      `getTaskOptions_${clientName}`,
      "getTaskOptions",
      [clientName],
      (returned) => {
        const tasks = Array.isArray(returned)
          ? returned
          : (() => {
              try {
                return JSON.parse(returned);
              } catch {
                return [];
              }
            })();

        render(records, tasks, $modal);
      },
    );
  }

  function render(records, tasks, $modal) {
    const $container = $modal.find(RECORDS_ID);

    $container.empty();

    if (!Array.isArray(records) || !records.length) {
      $container.html(`
      <div class="text-center text-muted py-3">
        No records added today.
      </div>
    `);

      return;
    }

    records.forEach((record) => {
      const rowNumber = Number(record.row);

      if (!Number.isInteger(rowNumber) || rowNumber < 1) {
        return;
      }

      const taskOptions = buildTaskOptions(tasks, record.task);

      const $row = $(`
      <div
        class="today-hours-record border rounded p-3 mb-3"
        data-row="${rowNumber}"
        data-action="update"
      >
        <div class="row">

          <div class="col-md-4 mb-2">
            <label>Type</label>

            <select
              class="form-control js-select2 today-hours-type"
              required
            >
              <option value="DEV">Dev</option>
              <option value="DESIGN">Design</option>
              <option value="SEO">SEO</option>
            </select>
          </div>

          <div class="col-md-4 mb-2">
            <label>Task / Project</label>

            <select
              class="form-control today-hours-task js-select2-dynamic"
              required
            >
              ${taskOptions}
            </select>
          </div>

          <div class="col-md-2 mb-2">
            <label>Hours</label>

            <input
              type="number"
              min="0"
              step="0.01"
              class="form-control today-hours-hours"
            >
          </div>

          <div class="col-md-2 mb-2 d-flex align-items-end">
            <button
              type="button"
              class="btn btn-outline-danger btn-block btn-delete-today-hours"
            >
              Delete
            </button>
          </div>

        </div>

        <div class="small text-muted">
          Date: ${escapeHtml(record.date || "")}
        </div>
      </div>
    `);

      $row.find(".today-hours-type").val(record.type || "");

      $row.find(".today-hours-task").val(record.task || "");

      $row.find(".today-hours-hours").val(record.hours ?? "");

      $container.append($row);
    });

    // Initialize ALL Select2 fields after ALL rows exist
    AppUtils.initSelect2($modal);

    $container.find(".today-hours-type").each(function () {
      $(this).trigger("change");
    });

    $container.find(".today-hours-task").each(function () {
      $(this).trigger("change");
    });
  }

  function buildTaskOptions(tasks, selectedTask) {
    const options = [`<option value="" disabled>Select Task</option>`];

    tasks.forEach((task) => {
      const value =
        typeof task === "object" ? task.value || task.id || "" : task;

      const text =
        typeof task === "object" ? task.label || task.name || value : task;

      if (!value) {
        return;
      }

      const selected =
        String(value) === String(selectedTask) ? " selected" : "";

      options.push(`
      <option
        value="${escapeHtml(value)}"
        ${selected}>
        ${escapeHtml(text)}
      </option>
    `);
    });

    return options.join("");
  }

  function markForDelete($button) {
    const $row = $button.closest(".today-hours-record");

    if (!$row.length) {
      return;
    }

    $row.attr("data-action", "delete").addClass("record-marked-delete");

    $row.find("input, select").prop("disabled", true);

    $button
      .text("Deleted")
      .removeClass("btn-outline-danger")
      .addClass("btn-secondary");
  }

  function save($modal) {
    const clientName = String($modal.find(CLIENT_ID).val() || "").trim();

    if (!clientName) {
      AppUtils.showDashboardToast("Client is required.", "error");
      return;
    }

    const records = [];
    let hasValidationError = false;

    $modal.find(".today-hours-record").each(function () {
      const $row = $(this);

      const rowNumber = Number($row.attr("data-row"));

      if (!Number.isInteger(rowNumber) || rowNumber < 1) {
        AppUtils.showDashboardToast("Invalid record row.", "error");

        hasValidationError = true;
        return false;
      }

      const action =
        $row.attr("data-action") === "delete" ? "delete" : "update";

      /*
       * Deleted records don't need their form values.
       */
      if (action === "delete") {
        records.push({
          row: rowNumber,
          action: "delete",
        });

        return;
      }

      const type = String($row.find(".today-hours-type").val() || "").trim();

      const task = String($row.find(".today-hours-task").val() || "").trim();

      const hoursValue = $row.find(".today-hours-hours").val();

      const hours = Number(hoursValue);

      if (!type) {
        AppUtils.showDashboardToast("Type is required.", "error");

        hasValidationError = true;
        return false;
      }

      if (!task || task.toLowerCase() === "loading...") {
        AppUtils.showDashboardToast("Please enter a valid task.", "error");

        hasValidationError = true;
        return false;
      }

      if (hoursValue === "" || !Number.isFinite(hours) || hours < 0) {
        AppUtils.showDashboardToast("Please enter valid hours.", "error");

        hasValidationError = true;
        return false;
      }

      records.push({
        row: rowNumber,
        action: "update",
        type,
        task,
        hours,
      });
    });

    if (hasValidationError) {
      return;
    }

    if (!records.length) {
      AppUtils.showDashboardToast("No changes to save.", "info");
      return;
    }

    const $saveButton = $modal.find(".btn-save");

    AppUtils.submitForm({
      gscriptFunc: "saveEditedTodayClientHours",

      data: {
        client: clientName,
        records,
      },

      $btn: $saveButton,
      loadingText: "Saving changes...",

      onSuccess: (response) => {
        /*
         * Clear caches affected by today's hours.
         */
        AppUtils.cacheClear(`${CACHE_PREFIX}${clientName}`);

        AppUtils.cacheClear(`getClientHourLogData_${clientName}`);

        AppUtils.cacheClear(`getClientHours_${clientName}`);

        AppUtils.resetCacheKeys(AppUtils.resetableCacheKeyForUpdatingHours);

        AppUtils.showDashboardToast(
          "Today's hours updated successfully!",
          "success",
        );

        AppUtils.closeModal(MODAL_ID);
      },
    });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  return {
    open,
  };
})();

export { TodayHoursEditor };
