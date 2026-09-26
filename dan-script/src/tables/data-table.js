import { AppUtils } from "../utils.js";
import { ActivityToday } from "./activity-today.js";

const DataTableModule = (() => {
  const instances = {};

  // const NUMERIC_SORT_TABLES = new Set([
  //   "top paid accounts",
  //   "outstanding accounts",
  // ]);

  function init(
    title,
    tableId,
    debug = false,
    callback = null,
    simple = false,
  ) {
    const log = (...args) => debug && console.log(...args);
    const error = (...args) => debug && console.error(...args);

    const cleanTitle = String(title || "")
      .toLowerCase()
      .trim();

    log("DataTableModule.init()", {
      title,
      tableId,
      cleanTitle,
      simple,
    });

    const $table = $(tableId);

    if (!$table.length) {
      error("Table not found:", tableId);
      return null;
    }

    /*
     * Stop previous Activity Today refresh.
     */
    if (cleanTitle === "activity today") {
      ActivityToday.stopRefresh();
    }

    /*
     * Destroy existing DataTable.
     */
    destroy(tableId);

    /*
     * Detect total columns from thead.
     */
    const totalColumns = $table.find("thead tr:first th").length;

    /*
     * Build default DataTable options.
     */
    const tableOptions = {
      responsive: true,

      language: {
        emptyTable: "No records yet",
      },

      layout: {
        topStart: ["pageLength"],
        topEnd: ["search"],
        bottomStart: ["info"],
        bottomEnd: ["paging"],
      },

      // paging: true,
      paging: false,

      scrollCollapse: true,

      scrollY: "400px",

      pageLength: 5,

      lengthMenu: [
        [5, 10, 25],
        [5, 10, 25],
      ],

      // Add data-row (optional) and data-col to cells
      createdRow(row, data, dataIndex) {
        $(row).attr("data-row", dataIndex);
      },

      createdCell(td, cellData, rowData, rowIndex, colIndex) {
        $(td).attr("data-col", colIndex);
      },

      initComplete() {
        log("DataTable initComplete:", tableId);

        // If the table itself has .table-hovered, also add it to tbody
        if ($table.hasClass("table-hovered")) {
          $table.find("tbody").addClass("table-hovered");
        }

        // Apply min-height for "client activity"
        if (cleanTitle === "activity today") {
          // Prefer the DataTables wrapper
          const $wrapper = $table.closest(".dataTable-wrapper, .dataTables_wrapper, div").first();
          if ($wrapper.length) {
            $wrapper.css("min-height", "200px");
          } else {
            // Fallback: directly on table/tbody
            $table.css("min-height", "200px");
            $table.find("tbody").css("min-height", "200px");
          }
        }

        if (typeof callback === "function") {
          callback(this.api());
        }
      },
    };

    if (simple) {
      Object.assign(tableOptions, {
        responsive: false,
        lengthChange: false,
        info: false,
        paging: false,
        scrollY: "400px",
        scrollCollapse: true,

        layout: {
          topStart: null,
          topEnd: null,
          bottomStart: null,
          bottomEnd: null,
        },
      });
    }

    /*
     * Priority columns for responsive behavior.
     */
    const priorityMap = {
      "activity today": [0, -1],
      clients: [0, 2],
      "reports overview": [2, -1],
      "report history": [2, -1],
      activity: [0, 1, 2],
      "project directory": [1, 3],
      "paid hours": [0, 3],
      "owed hours": [0, 3],
      "invoiced hours": [0, 3],
      "hours without status": [0, 3],
      "yearly performance": [0, 1, 5],
      "billing records export": [4, 5, -1]
    };

    const priorityColumns = priorityMap[cleanTitle] || [];

    // Start with an empty columnDefs array
    tableOptions.columnDefs = [];

    // 1) Responsive priorities (if any)
    if (priorityColumns.length) {
      tableOptions.columnDefs.push(
        ...withResponsivePriorities(totalColumns, priorityColumns),
      );
    }

    // 2) Numeric sorting
    // if (NUMERIC_SORT_TABLES.has(cleanTitle)) {
    //   tableOptions.columnDefs.push({
    //     targets: [1, 2],
    //     type: "num-fmt",
    //   });
    // }

    // if (
    //   cleanTitle === "yearly performance" ||
    //   cleanTitle === "billing records export" ||
    //   cleanTitle === "reports overview"
    // ) {
    //   log("Initializing Client Directory");

    //   tableOptions.paging = false;
    //   tableOptions.scrollCollapse = true;
    //   tableOptions.scrollY = "400px";
    // }

    if (cleanTitle === "activity today") {
      log("Initializing Activity Today");

      tableOptions.columnDefs.push({
        targets: -1,
        className: "action-btn-group",
        orderable: false,
        searchable: false,

        render: (_data, _type, row) =>
          ActivityToday.buildActionButtons(row).html(),
      });
    }

    /*
     * Create DataTable.
     */
    const instance = $table.DataTable(tableOptions);

    instances[tableId] = instance;

    log("DataTable instance stored:", tableId);

    /*
     * Activity Today setup.
     */
    if (cleanTitle === "project directory") {
      ActivityToday.setupTaskForm();
    }

    if (cleanTitle === "activity today") {
      ActivityToday.setupFilters(instance);
      ActivityToday.setupTaskForm();
      ActivityToday.setupSheetViewButton();
      ActivityToday.startRefresh(instance);
    }

    /*
     * Apply optional table-specific behavior.
     */
    // applyTableSpecificLogic(title, instance, tableId, debug);

    log("DataTable initialized:", tableId);

    return instance;
  }

  function getInstance(tableId) {
    return instances[tableId] || null;
  }

  function destroy(tableId) {
    if (!tableId) {
      return;
    }

    const instance = instances[tableId];
    const $table = $(tableId);

    /*
     * Stop page-specific refresh logic.
     */
    if (tableId === "#activity-today") {
      ActivityToday.stopRefresh();
    }

    /*
     * Remove our reference immediately.
     *
     * This prevents destroyAll() or another lifecycle
     * call from attempting to destroy the same instance
     * again.
     */
    delete instances[tableId];

    /*
     * Table no longer exists in the current DOM.
     */
    if (!$table.length) {
      return;
    }

    /*
     * Table exists but DataTables no longer recognizes it.
     */
    if (!$.fn.DataTable.isDataTable($table[0])) {
      return;
    }

    /*
     * If we have a tracked instance, use it.
     * Otherwise get the instance directly from DataTables.
     */
    const dataTable = instance || $table.DataTable();

    /*
     * Make sure the DataTables wrapper and table
     * are still attached to the document.
     *
     * During SPA navigation, the page content can
     * already have been replaced before destroy()
     * executes.
     */
    const tableElement = $table[0];

    if (!tableElement.isConnected || !document.contains(tableElement)) {
      return;
    }

    try {
      dataTable.destroy();
    } catch (err) {
      /*
       * DataTables can throw NotFoundError when its
       * internal DOM references are stale.
       *
       * The table is already being removed by SPA
       * navigation, so there is nothing useful left
       * for us to restore.
       */
      console.warn("DataTable cleanup skipped:", tableId, err);
    }
  }

  function destroyAll() {
    Object.keys(instances).forEach((tableId) => {
      destroy(tableId);
    });

    ActivityToday.stopRefresh();
  }

  function withResponsivePriorities(
    totalColumns,
    priorityCols,
    priorityValue = 1,
    defaultPriority = 3,
  ) {
    const normalized = priorityCols.map((i) =>
      i === -1 ? totalColumns - 1 : i,
    );
    const prioritySet = new Set(normalized);
    const columnDefs = [];

    for (let i = 0; i < totalColumns; i++) {
      const isPriority = prioritySet.has(i);

      columnDefs.push({
        targets: i,
        responsivePriority: isPriority ? priorityValue : defaultPriority,
        ...(isPriority ? {} : { className: "dt-center" }),
      });
    }

    return columnDefs;
  }

  function getColumnCount(tableId) {
    const $table = $(tableId);

    if (!$table.length) {
      return 1;
    }

    return $table.find("thead th").length || 1;
  }

  function showLoader(tableId) {
    const $table = $(tableId);

    if (!$table.length) {
      return;
    }

    const colCount = getColumnCount(tableId);

    const $tbody = $table.find("tbody");

    if (!$tbody.length) {
      return;
    }

    $tbody.html(`
    <tr class="dt-loader-row">
      <td
        colspan="${colCount}"
        class="text-center"
        style="position: relative;"
      >
        <div class="bar-loader">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </td>
    </tr>
  `);
  }

  function showError(tableId, message = "Unable to load data.") {
    const $table = $(tableId);

    if (!$table.length) {
      return;
    }

    destroy(tableId);

    const colCount = getColumnCount(tableId);

    $table.find("tbody").html(`
    <tr class="dt-message-row">
      <td
        colspan="${colCount}"
        class="text-center text-muted"
      >
        ${AppUtils.escapeHtml(message)}
      </td>
    </tr>
  `);
  }

  function showEmpty(tableId, message = "No records found.") {
    const $table = $(tableId);

    if (!$table.length) {
      return;
    }

    destroy(tableId);

    const colCount = getColumnCount(tableId);

    $table.find("tbody").html(`
    <tr class="dt-message-row">
      <td
        colspan="${colCount}"
        class="text-center text-muted"
      >
        ${AppUtils.escapeHtml(message)}
      </td>
    </tr>
  `);
  }

  function renderRows(tableId, data, rowRenderer) {
    const $table = $(tableId);

    if (!$table.length) {
      return;
    }

    if (!Array.isArray(data)) {
      showError(tableId, "Invalid table data.");

      return;
    }

    destroy(tableId);

    const tbody = $table.find("tbody")[0];

    if (!tbody) {
      return;
    }

    tbody.innerHTML = "";

    if (!data.length) {
      showEmpty(tableId);
      return;
    }

    data.forEach((row, index) => {
      const renderedRow = rowRenderer(row, index);

      if (renderedRow) {
        tbody.appendChild(renderedRow);
      }
    });
  }

  return {
    init,
    getInstance,
    destroy,
    destroyAll,

    showLoader,
    getColumnCount,
    showError,
    showEmpty,
    renderRows,
  };
})();

export { DataTableModule };
