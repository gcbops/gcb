import { GcbAuthModule } from "../auth/auth.js";
import { AppUtils } from "../utils/utils.js";
import { ValidationModule } from "../utils/validations.js";
import { RequestManager } from "../requests/request-manager.js";

const TodayHoursEditor = (() => {
  const MODAL_ID = "#app-modal";
  const RECORDS_ID = "#todayHoursRecords";
  const CLIENT_ID = "#editTodayClient";
  const CACHE_PREFIX = "todayManualHours_";

  const MAX_TYPE_LENGTH = 100;
  const MAX_TASK_LENGTH = 500;
  const MIN_HOURS = 0;
  const MAX_HOURS = 24;

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
      scrollable: true,

      header: "<strong>Edit Today's Hours</strong>",

      body: `
      <div id="today-hours-main-body">
        <input
          type="hidden"
          id="${CLIENT_ID.slice(1)}"
          value="${AppUtils.escapeHtml(clientName)}"
        >

        <div id="${RECORDS_ID.slice(1)}">
          <div class="text-center text-muted py-3">
            Loading today's records...
          </div>
        </div>
      </div>

      <div id="today-hours-review-body" style="display: none;">
        <div class="alert alert-info">
          <i class="fa fa-info-circle me-1"></i>
          Review the changes below before adding them to the request queue.
        </div>

        <div id="today-hours-review-content"></div>
      </div>
    `,

      footer: `
      <!-- APP-MODAL-MAIN-ACTIONS -->
      <div id="today-hours-main-footer" class="d-flex gap-2">
        <button type="button" class="btn btn-secondary btn-cancel">
          Cancel
        </button>

        <button type="button" class="btn btn-gc btn-review">
          <i class="pe-7s-check me-1"></i>
          Review Changes
        </button>
      </div>

      <!-- APP-MODAL-REVIEW-ACTIONS -->
      <div id="today-hours-review-footer" class="d-flex gap-2">
        <button type="button" class="btn btn-outline-secondary btn-modal-back">
          Back
        </button>

        <button type="button" class="btn btn-gc btn-proceed">
          <i class="pe-7s-plus me-1"></i>
          Add to Request Queue
        </button>
      </div>
    `,

      review: {
        enabled: true,

        selectors: {
          main: "#today-hours-main-body, #today-hours-main-footer",
          review: "#today-hours-review-body, #today-hours-review-footer",
          trigger: ".btn-review",
          back: ".btn-modal-back",
          proceed: ".btn-proceed",
        },

        getData: ($modal) => collectChanges($modal),

        onReview: ($modal, data) => {
          renderReview(data, $modal);
        },

        onProceed: ($modal, data) => {
          return queueChanges(data);
        },
      },

      onOpen($modal) {
        $modal
          .off(ns)
          .on(`click${ns}`, ".btn-cancel", () => {
            AppUtils.closeModal(MODAL_ID);
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

  function collectChanges($modal) {
    const clientName = String($modal.find(CLIENT_ID).val() || "").trim();

    if (!clientName) {
      AppUtils.showDashboardToast("Client is required.", "error");
      return null;
    }

    const records = [];
    let validationError = null;

    $modal.find(".today-hours-record").each(function () {
      const $row = $(this);

      // Skip records that already have an active RequestManager operation.
      if ($row.attr("data-pending-request-id")) {
        return;
      }

      const sourceRowValue = $row.attr("data-source-row");

      const record = {
        row: Number($row.attr("data-row")),
        action: $row.attr("data-action") === "delete" ? "delete" : "update",
        sourceSheet: String($row.attr("data-source-sheet") || "").trim(),
        sourceRow:
          sourceRowValue === undefined || sourceRowValue === ""
            ? null
            : Number(sourceRowValue),
        originalType: $row.attr("data-original-type"),
        originalTask: $row.attr("data-original-task"),
        originalHours: $row.attr("data-original-hours"),
        originalDate: $row.attr("data-original-date"),
      };

      if (record.action !== "delete") {
        record.type = String($row.find(".today-hours-type").val() || "").trim();

        record.task = String($row.find(".today-hours-task").val() || "").trim();

        record.hours = $row.find(".today-hours-hours").val();
      }

      const validation = todayHoursRecord(record);

      if (!validation.valid) {
        validationError = validation.message;
        return false;
      }

      records.push(validation.value);
    });

    if (validationError) {
      AppUtils.showDashboardToast(validationError, "error");
      return null;
    }

    if (!records.length) {
      AppUtils.showDashboardToast("No changes to save.", "info");
      return null;
    }

    return {
      client: clientName,
      records,
    };
  }

  function renderReview(data, $modal) {
    const $container = $modal.find("#today-hours-review-content");

    $container.empty();

    $("<div>")
      .addClass("fw-semibold mb-3")
      .text(`Client: ${data.client}`)
      .appendTo($container);

    data.records.forEach((record, index) => {
      const isDelete = record.action === "delete";

      const $card = $("<div>").addClass("border rounded p-3 mb-3");

      const $header = $("<div>").addClass(
        "d-flex justify-content-between align-items-center gap-2 mb-2",
      );

      $("<strong>")
        .text(`Record ${index + 1}`)
        .appendTo($header);

      $("<span>")
        .addClass(`badge ${isDelete ? "bg-danger" : "bg-primary"}`)
        .text(isDelete ? "Delete" : "Update")
        .appendTo($header);

      $card.append($header);

      const addDetail = (label, value) => {
        const $row = $("<div>").addClass(
          "d-flex justify-content-between align-items-start gap-3 py-1",
        );

        $("<span>")
          .addClass("text-muted flex-shrink-0")
          .text(label)
          .appendTo($row);

        $("<span>")
          .addClass("text-end text-break")
          .text(
            value === undefined || value === null || value === ""
              ? "Not provided"
              : String(value),
          )
          .appendTo($row);

        $card.append($row);
      };

      addDetail("Date", record.originalDate);
      addDetail("Type", isDelete ? record.originalType : record.type);
      addDetail("Task / Project", isDelete ? record.originalTask : record.task);
      addDetail("Hours", isDelete ? record.originalHours : record.hours);

      if (record.sourceSheet) {
        addDetail("Source sheet", record.sourceSheet);
      }

      $container.append($card);
    });

    $("<div>")
      .addClass("small text-muted mt-2")
      .text(
        `${data.records.length} record(s) will be added to the request queue.`,
      )
      .appendTo($container);
  }

  function isModalAvailable($modal) {
    return Boolean(
      $modal &&
      $modal.length &&
      $modal.find(CLIENT_ID).length &&
      $modal.find(RECORDS_ID).length,
    );
  }

  async function load(clientName, $modal) {
    try {
      const [sessionId, signature] = await GcbAuthModule.getAuthArgs();

      if (!isModalAvailable($modal)) {
        return;
      }

      AppUtils.cachedGScriptCall(
        `${CACHE_PREFIX}${clientName}`,
        "getTodayClientHours",
        [sessionId, signature, clientName],
        (response) => {
          if (!isModalAvailable($modal)) {
            return;
          }

          if (!response?.success) {
            $modal.find(RECORDS_ID).html(`
              <div class="text-center text-danger py-3">
                ${AppUtils.escapeHtml(
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
    } catch (error) {
      if (isModalAvailable($modal)) {
        AppUtils.showError(error?.message || "Unable to load today's records.");
      }
    }
  }

  async function loadTaskOptions(clientName, $modal, records) {
    try {
      const [sessionId, signature] = await GcbAuthModule.getAuthArgs();

      if (!isModalAvailable($modal)) {
        return;
      }

      AppUtils.cachedGScriptCall(
        `getTaskOptions_${clientName}`,
        "getTaskOptions",
        [sessionId, signature, clientName],
        (returned) => {
          if (!isModalAvailable($modal)) {
            return;
          }

          let tasks = returned;

          if (typeof returned === "string") {
            try {
              tasks = JSON.parse(returned);
            } catch {
              tasks = [];
            }
          }

          console.log(
            "[TodayHoursEditor] Active queued changes:",
            RequestManager.getActiveTodayHoursChanges(clientName),
          );
          render(records, Array.isArray(tasks) ? tasks : [], $modal);
        },
      );
    } catch (error) {
      if (isModalAvailable($modal)) {
        AppUtils.showError(error?.message || "Unable to load task options.");
      }
    }
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

    const clientName = String($modal.find(CLIENT_ID).val() || "").trim();

    const pendingChanges =
      RequestManager.getActiveTodayHoursChanges(clientName);

    records.forEach((record) => {
      const rowNumber = Number(record.row);

      if (!Number.isInteger(rowNumber) || rowNumber < 3) {
        return;
      }

      const sourceSheet = String(record.sourceSheet || "").trim();
      const sourceRow = Number(record.sourceRow);
      const hasSourceRow = Number.isInteger(sourceRow) && sourceRow >= 1;
      const isExternal = Boolean(sourceSheet && hasSourceRow);

      const originalType = String(record.type ?? "");
      const originalTask = String(record.task ?? "");
      const originalHours = String(record.hours ?? "");
      const originalDate = String(record.dateFormatted ?? record.date ?? "");

      const pendingChange = findPendingChange(record, pendingChanges);

      const isPendingDelete = pendingChange?.action === "delete";
      const isPendingEdit = Boolean(pendingChange && !isPendingDelete);

      const displayedType = isPendingEdit
        ? String(pendingChange.type ?? originalType)
        : originalType;

      const displayedTask = isPendingEdit
        ? String(pendingChange.task ?? originalTask)
        : originalTask;

      const displayedHours = isPendingEdit
        ? String(pendingChange.hours ?? originalHours)
        : originalHours;

      const taskOptions = buildTaskOptions(tasks, displayedTask);

      const $row = $(`
        <div
          class="today-hours-record border rounded p-3 mb-3"
          data-row="${rowNumber}"
          data-source-sheet="${AppUtils.escapeHtml(sourceSheet)}"
          data-source-row="${hasSourceRow ? sourceRow : ""}"
          data-action="update"
          data-original-type="${AppUtils.escapeHtml(originalType)}"
          data-original-task="${AppUtils.escapeHtml(originalTask)}"
          data-original-hours="${AppUtils.escapeHtml(originalHours)}"
          data-original-date="${AppUtils.escapeHtml(originalDate)}"
          data-pending-request-id="${AppUtils.escapeHtml(pendingChange?.requestId || "")}"
          data-pending-action="${AppUtils.escapeHtml(pendingChange?.action || "")}"
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
                ${isExternal ? "disabled" : ""}
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
                max="24"
                step="0.01"
                class="form-control today-hours-hours"
                required
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
            Date: ${AppUtils.escapeHtml(record.date ?? "")}
          </div>
        </div>
      `);

      $row.find(".today-hours-type").val(displayedType);
      $row.find(".today-hours-task").val(displayedTask);
      $row.find(".today-hours-hours").val(displayedHours);

      if (pendingChange) {
        const statusLabel = getPendingChangeLabel(pendingChange);

        $row.addClass(
          isPendingDelete ? "record-pending-delete" : "record-pending-edit",
        ).append(`
      <div class="small mt-2 text-warning today-hours-pending-status">
        <i class="fa fa-clock-o" aria-hidden="true"></i>
        ${AppUtils.escapeHtml(statusLabel)}
      </div>
    `);

        $row.find("input, select").prop("disabled", true);

        $row
          .find(".btn-delete-today-hours")
          .prop("disabled", true)
          .text(isPendingDelete ? "Pending deletion" : "Edit queued")
          .removeClass("btn-outline-danger")
          .addClass("btn-secondary");
      }

      $container.append($row);
    });

    if (!$container.find(".today-hours-record").length) {
      $container.html(`
        <div class="text-center text-muted py-3">
          No valid records were returned.
        </div>
      `);
      return;
    }

    // Select2Module.init($modal);

    $container
      .find(".today-hours-record")
      .filter(function () {
        return Boolean(this.dataset.pendingRequestId);
      })
      .find("input, select, button")
      .prop("disabled", true);

    $container.find(".today-hours-type, .today-hours-task").trigger("change");
  }

  function findPendingChange(record, pendingChanges) {
    const row = Number(record.row);
    const sourceSheet = String(record.sourceSheet || "")
      .trim()
      .toLowerCase();

    const sourceRowValue = Number(record.sourceRow);
    const sourceRow =
      Number.isInteger(sourceRowValue) && sourceRowValue >= 1
        ? sourceRowValue
        : null;

    return pendingChanges.find((change) => {
      const changeRow = Number(change.row);
      const changeSheet = String(change.sourceSheet || "")
        .trim()
        .toLowerCase();

      const changeSourceRowValue = Number(change.sourceRow);
      const changeSourceRow =
        change.sourceRow !== null &&
        change.sourceRow !== undefined &&
        change.sourceRow !== "" &&
        Number.isInteger(changeSourceRowValue) &&
        changeSourceRowValue >= 1
          ? changeSourceRowValue
          : null;

      // Main-sheet records must match the same main-sheet row.
      // External records must also match their external source row.
      if (changeRow !== row || changeSheet !== sourceSheet) {
        return false;
      }

      if (sourceSheet) {
        return sourceRow !== null && changeSourceRow === sourceRow;
      }

      return changeSourceRow === null;
    });
  }

  function getPendingChangeLabel(change) {
    const uncertain = change.requestStatus === "interrupted";

    if (change.action === "delete") {
      return uncertain
        ? "Deletion outcome unknown — verify request"
        : "Pending deletion";
    }

    return uncertain ? "Edit outcome unknown — verify request" : "Pending edit";
  }

  function buildTaskOptions(tasks, selectedTask) {
    const options = ['<option value="">Select Task</option>'];

    tasks.forEach((task) => {
      const value =
        typeof task === "object" && task !== null
          ? task.value || task.id || ""
          : task;

      const label =
        typeof task === "object" && task !== null
          ? task.label || task.name || value
          : value;

      if (!value) {
        return;
      }

      const selected =
        String(value) === String(selectedTask) ? " selected" : "";

      options.push(`
        <option
          value="${AppUtils.escapeHtml(value)}"${selected}
        >
          ${AppUtils.escapeHtml(label)}
        </option>
      `);
    });

    return options.join("");
  }

  function markForDelete($button) {
    const $row = $button.closest(".today-hours-record");

    if (!$row.length || $row.attr("data-action") === "delete") {
      return;
    }

    $row.attr("data-action", "delete").addClass("record-marked-delete");

    $row.find("input, select").prop("disabled", true);

    $button
      .text("Deleted")
      .prop("disabled", true)
      .removeClass("btn-outline-danger")
      .addClass("btn-secondary");
  }

  function queueChanges(data) {
    try {
      RequestManager.enqueue(
        "edit-today-hours",
        {
          client: data.client,
          records: data.records,
        },
        `Edit today's hours — ${data.client}`,
      );

      AppUtils.closeModal(MODAL_ID);

      AppUtils.showDashboardToast(
        "Today's hours changes added to the request queue.",
        "success",
      );

      return true;
    } catch (error) {
      console.error("[TodayHoursEditor] Unable to queue changes:", error);

      AppUtils.showDashboardToast(
        error?.message || "Unable to queue today's changes.",
        "error",
      );

      return false;
    }
  }

  function todayHoursRecord(record) {
    const row = Number(record.row);

    if (!Number.isInteger(row) || row < 3) {
      return {
        valid: false,
        message: "Invalid record row.",
      };
    }

    const sourceSheet = String(record.sourceSheet || "").trim();

    const sourceRow =
      record.sourceRow === null ||
      record.sourceRow === undefined ||
      record.sourceRow === ""
        ? null
        : Number(record.sourceRow);

    if (sourceRow !== null && (!Number.isInteger(sourceRow) || sourceRow < 1)) {
      return {
        valid: false,
        message: "Invalid external source row.",
      };
    }

    const snapshot = {
      originalType: record.originalType,
      originalTask: record.originalTask,
      originalHours: record.originalHours,
      originalDate: record.originalDate,
    };

    const action = record.action === "delete" ? "delete" : "update";

    if (action === "delete") {
      return {
        valid: true,
        value: {
          row,
          action,
          sourceSheet,
          sourceRow,
          ...snapshot,
        },
      };
    }

    const type = ValidationModule.requiredString(record.type, "Type", {
      maxLength: MAX_TYPE_LENGTH,
    });

    if (!type.valid) {
      return type;
    }

    const task = ValidationModule.requiredString(record.task, "Task", {
      maxLength: MAX_TASK_LENGTH,
    });

    if (!task.valid) {
      return task;
    }

    if (task.value.toLowerCase() === "loading...") {
      return {
        valid: false,
        message: "Please enter a valid task.",
      };
    }

    const hours = ValidationModule.number(record.hours, "Hours", {
      min: MIN_HOURS,
      max: MAX_HOURS,
    });

    if (!hours.valid) {
      return hours;
    }

    return {
      valid: true,
      value: {
        row,
        action,
        type: type.value,
        task: task.value,
        hours: hours.value,
        sourceSheet,
        sourceRow,
        ...snapshot,
      },
    };
  }

  return {
    open,
  };
})();

export { TodayHoursEditor };
