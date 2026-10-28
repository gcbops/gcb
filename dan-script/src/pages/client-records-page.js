import { AppUtils } from "../utils/utils.js";
import { RequestManager } from "../requests/request-manager.js";
import { getAuthArgs as getGcbAuthArgs } from "../auth/auth-error-handler.js";
import { TableClientSelector } from "../tables/client-selector.js";

const ClientRecordsPage = (() => {
  const ROOT_ID = "client-records-page";
  const REQUEST_TYPE = "update-client-record-status";

  const STATUS_OPTIONS = ["INVOICED", "PAID", "UNPAID"];

  let root = null;
  let records = [];
  let clientName = "";
  let sheetUrl = "";
  let destroyed = false;
  let fetchVersion = 0;
  let unsubscribe = null;
  let pendingCells = new Set();

  const $ = window.jQuery;

  function escapeHtml(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char],
    );
  }

  function getElement(id) {
    return root?.querySelector(`#${id}`);
  }

  function showFeedback(message, type = "info") {
    const element = getElement("client-records-feedback");

    if (!element) {return;}

    element.textContent = message;
    element.className = `client-records-feedback is-${type}`;
    element.hidden = !message;
  }

  function setLoading(loading) {
    const element = getElement("client-records-loading");

    if (element) {
      element.hidden = !loading;
    }
  }

  function callServer(gscriptFunc, extraArgs = []) {
    return new Promise((resolve, reject) => {
      const authArgs = getGcbAuthArgs();

      AppUtils.gScriptRun({
        gscriptFunc,
        args: [...authArgs, ...extraArgs],
        staleCheck: false,
        onSuccess: resolve,
        onError: reject,
      });
    });
  }

  // function initializeSelect2() {
  //   if (!$ || !$.fn.select2) {
  //     throw new Error("Select2 is not available.");
  //   }

  //   const clientSelect = $("#client-records-client");
  //   const taskSelect = $("#client-records-task");
  //   const statusSelect = $("#client-records-status-filter");

  //   Select2Module.init(clientSelect);
  //   Select2Module.init(taskSelect);
  //   Select2Module.init(statusSelect);

  //   // Each row's Select2 control is initialized after rendering.
  // }

  function initializeClientOptions() {
    // Reuse the existing GCB client-loading mechanism.
    return TableClientSelector.initClientSelector(
      "#client-records-client",
      "forRecords",
    );
  }

  async function loadClient(name) {
    const version = ++fetchVersion;

    clientName = String(name || "").trim();
    records = [];
    sheetUrl = "";

    renderSummary();
    renderTable();
    updateSheetLink();

    if (!clientName) {
      setLoading(false);
      return;
    }

    setLoading(true);
    showFeedback("");

    try {
      const result = await callServer("getClientRecordsData", [clientName]);

      if (destroyed || version !== fetchVersion) {return;}

      records = Array.isArray(result?.records) ? result.records : [];

      sheetUrl = result?.sheetUrl || "";

      populateTaskOptions();
      renderSummary();
      renderTable();
      updateSheetLink();
    } catch (error) {
      if (destroyed || version !== fetchVersion) {return;}

      showFeedback(error?.message || "Unable to load client records.", "error");
    } finally {
      if (!destroyed && version === fetchVersion) {
        setLoading(false);
      }
    }
  }

  function updateSheetLink() {
    const link = getElement("client-records-open-sheet");

    if (!link) {return;}

    link.hidden = !sheetUrl;

    if (sheetUrl) {
      link.href = sheetUrl;
    } else {
      link.removeAttribute("href");
    }
  }

  function populateTaskOptions() {
    const select = getElement("client-records-task");

    if (!select) {return;}

    const previousValue = select.value;

    const tasks = [
      ...new Set(records.map((record) => record.task).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b));

    select.innerHTML = [
      '<option value="">All projects and tasks</option>',
      ...tasks.map(
        (task) =>
          `<option value="${escapeHtml(task)}">${escapeHtml(task)}</option>`,
      ),
    ].join("");

    if (tasks.includes(previousValue)) {
      select.value = previousValue;
    }

    if ($.fn.select2) {
      $(select).trigger("change.select2");
    }
  }

  function getFilteredRecords() {
    const selectedTask = getElement("client-records-task")?.value || "";

    const selectedStatuses = $("#client-records-status-filter").val() || [];

    const search = String(getElement("client-records-search")?.value || "")
      .trim()
      .toLowerCase();

    return records.filter((record) => {
      if (selectedTask && record.task !== selectedTask) {
        return false;
      }

      if (
        selectedStatuses.length &&
        !selectedStatuses.includes(record.status)
      ) {
        return false;
      }

      if (search) {
        const text = [record.type, record.task, record.date, record.status]
          .join(" ")
          .toLowerCase();

        if (!text.includes(search)) {return false;}
      }

      return true;
    });
  }

  function renderSummary() {
    const counts = {
      total: records.length,
      INVOICED: 0,
      PAID: 0,
      UNPAID: 0,
    };

    records.forEach((record) => {
      if (Object.hasOwn(counts, record.status)) {
        counts[record.status]++;
      }
    });

    getElement("client-records-total").textContent = counts.total;

    getElement("client-records-invoiced").textContent = counts.INVOICED;

    getElement("client-records-paid").textContent = counts.PAID;

    getElement("client-records-unpaid").textContent = counts.UNPAID;
  }

  function renderTable() {
    const tbody = getElement("client-records-tbody");
    const empty = getElement("client-records-empty");

    if (!tbody) {return;}

    const filtered = getFilteredRecords();

    tbody.innerHTML = filtered
      .map((record) => {
        const key = getRecordKey(record);
        const pending = pendingCells.has(key);

        const options = [
          '<option value="">Select status</option>',
          ...STATUS_OPTIONS.map(
            (status) =>
              `<option value="${status}" ${
                record.status === status ? "selected" : ""
              }>${status}</option>`,
          ),
        ].join("");

        return `
        <tr
          data-record-key="${escapeHtml(key)}"
          class="${pending ? "is-saving" : ""}"
        >
          <td>${escapeHtml(record.type)}</td>
          <td class="client-records-task">
            ${escapeHtml(record.task)}
          </td>
          <td>${escapeHtml(record.date)}</td>
          <td class="client-records-status-cell">
            <select
              class="client-records-status-select"
              data-status-record="${escapeHtml(key)}"
              aria-label="Update status for ${escapeHtml(record.task)}"
              ${pending ? "disabled" : ""}
            >
              ${options}
            </select>
            ${
              pending
                ? '<small class="text-muted">Queued or processing...</small>'
                : ""
            }
          </td>
        </tr>
      `;
      })
      .join("");

    empty.hidden = filtered.length > 0;

    getElement("client-records-result-count").textContent =
      `${filtered.length} of ${records.length} records`;

    // initializeRowSelect2();
  }

  // function initializeRowSelect2() {
  //   $("#client-records-tbody .client-records-status-select").each(function () {
  //     const select = $(this);

  //     if (select.hasClass("select2-hidden-accessible")) {
  //       return;
  //     }

  //     Select2Module.init(select);
  //   });
  // }

  function getRecordKey(record) {
    return [
      record.spreadsheetId,
      record.sheetId,
      record.rowIndex,
      record.statusColumnIndex,
    ].join(":");
  }

  function findRecord(key) {
    return records.find((record) => getRecordKey(record) === key);
  }

  function bindEvents() {
    const clientSelect = getElement("client-records-client");

    clientSelect.addEventListener("change", (event) => {
      loadClient(event.target.value);
    });

    getElement("client-records-task").addEventListener("change", renderTable);

    $("#client-records-status-filter").on("change.clientRecords", renderTable);

    getElement("client-records-search").addEventListener("input", renderTable);

    // Delegated listener survives table re-rendering.
    getElement("client-records-tbody").addEventListener(
      "change",
      handleStatusChange,
    );
  }

  function handleStatusChange(event) {
    const select = event.target.closest(".client-records-status-select");

    if (!select) {return;}

    const record = findRecord(select.dataset.statusRecord);

    if (!record) {
      showFeedback("Record not found. Reload the client.", "error");
      return;
    }

    const newStatus = select.value;
    const previousStatus = record.status;

    if (!newStatus || newStatus === previousStatus) {return;}

    if (!STATUS_OPTIONS.includes(newStatus)) {
      select.value = previousStatus;
      return;
    }

    const key = getRecordKey(record);

    if (pendingCells.has(key)) {
      select.value = previousStatus;
      return;
    }

    const payload = {
      clientName: record.clientName,
      spreadsheetId: record.spreadsheetId,
      sheetId: record.sheetId,
      rowIndex: record.rowIndex,
      statusColumnIndex: record.statusColumnIndex,
      cellA1: record.cellA1,
      originalStatus: record.originalStatus,
      expectedType: record.expectedType,
      expectedTask: record.expectedTask,
      expectedHours: record.expectedHours,
      expectedDate: record.expectedDate,
      newStatus,
    };

    try {
      pendingCells.add(key);

      RequestManager.enqueue(
        REQUEST_TYPE,
        {
          clientName,
          spreadsheetId: record.spreadsheetId,
          sheetId: record.sheetId,
          operations: [payload],
        },
        `Update statuses — ${clientName}`,
      );

      showFeedback("Status change added to Request Manager.", "info");

      // Reflect the desired state locally while the request is pending.
      record.status = newStatus;
      renderSummary();
      renderTable();
    } catch (error) {
      pendingCells.delete(key);
      select.value = previousStatus;

      showFeedback(
        error?.message || "Unable to queue the status change.",
        "error",
      );
    }
  }

  function handleRequestState(state) {
    const activeRequests = (state?.queue || []).filter(
      (request) =>
        request.type === REQUEST_TYPE &&
        request.payload?.clientName === clientName,
    );

    const activeKeys = new Set();

    activeRequests.forEach((request) => {
      (request.payload?.operations || []).forEach((operation) => {
        activeKeys.add(
          [
            operation.spreadsheetId,
            operation.sheetId,
            operation.rowIndex,
            operation.statusColumnIndex,
          ].join(":"),
        );
      });
    });

    pendingCells = activeKeys;

    // Reload after a request finishes, so server-confirmed statuses win.
    const completed = (state?.history || []).some(
      (request) =>
        request.type === REQUEST_TYPE &&
        request.payload?.clientName === clientName &&
        request.status === "completed" &&
        !request._clientRecordsHandled,
    );

    if (completed && clientName) {
      loadClient(clientName);
    } else {
      renderTable();
    }
  }

  function init() {
    root = document.getElementById(ROOT_ID);

    if (!root) {
      throw new Error(`#${ROOT_ID} was not found in the loaded page.`);
    }

    destroyed = false;
    // initializeSelect2();
    bindEvents();
    initializeClientOptions();

    unsubscribe = RequestManager.subscribe(handleRequestState);
  }

  function destroy() {
    destroyed = true;
    fetchVersion++;

    unsubscribe?.();
    unsubscribe = null;

    $("#client-records-status-filter").off(".clientRecords");
    // $("#client-records-tbody .client-records-status-select").each(function () {
    //   const select = $(this);

    //   if (select.hasClass("select2-hidden-accessible")) {
    //     select.select2("destroy");
    //   }
    // });

    records = [];
    pendingCells.clear();
    root = null;
  }

  return { init, destroy };
})();

export { ClientRecordsPage };
