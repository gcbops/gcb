import { ActivityToday } from "./activity-today.js";

const DataTableModule = (() => {
  const instances = {};

  const MAIN_TABLES = [
    "top paid accounts",
    "activity today",
    "outstanding accounts",
    "report history",
    "projects",
    "upsell",
    "clients",
    "active clients"
  ];

  const NUMERIC_SORT_TABLES = ["top paid accounts", "outstanding accounts"];

  function init(title, tableId, debug = false) {
    const log = (...args) => debug && console.log(...args);
    const warn = (...args) => debug && console.warn(...args);
    const error = (...args) => debug && console.error(...args);

    const cleanTitle = title.toLowerCase().trim();

    log("DataTableModule.init()", {
      title,
      tableId,
      cleanTitle,
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
     * Destroy any existing DataTable for this element.
     */
    destroy(tableId);

    let tableOptions;

    /* ---------- MAIN TABLES ---------- */

    if (MAIN_TABLES.includes(cleanTitle)) {
      tableOptions = {
        responsive: true,
        
        layout: {
          topStart: ["pageLength"],
          topEnd: ["search"],
          bottomStart: ["info"],
          bottomEnd: ["paging"],
        },

        paging: true,

        pageLength: 5,

        lengthMenu: [
          [5, 10, 25],
          [5, 10, 25],
        ],

        initComplete() {
          log("DataTable initComplete");

          $(".dt-search input").focus();
        },
      };

      if (NUMERIC_SORT_TABLES.includes(cleanTitle)) {
        tableOptions.columnDefs = [
          {
            targets: [1, 2],
            type: "num-fmt",
          },
        ];
      }
    } else if (cleanTitle === "upsell") {
      /* ---------- UPSELL ---------- */
      tableOptions = {
        responsive: true,

        pageLength: 5,

        order: [],

        ordering: false,

        searching: true,

        lengthChange: false,

        info: false,

        paging: true,

        columnDefs: [
          {
            targets: [1, 2],
            className: "dt-center",
          },
        ],

        language: {
          emptyTable: "No records yet",
        },

        dom: '<"bottom d-flex justify-content-between"f p>',
      };
    } else {
      warn("No table configuration found for:", title);
      return null;
    }

    /* ---------- ACTIVITY TODAY ---------- */

    if (cleanTitle === "activity today") {
      log("Initializing Activity Today");

      tableOptions.columnDefs = [
        {
          targets: -1,
          className: "action-btn",
          orderable: false,
          searchable: false,
          render: (_data, _type, row) =>
            ActivityToday.buildActionButtons(row).html(),
        },
      ];
    }

    /* ---------- CREATE DATATABLE ---------- */

    const instance = $table.DataTable(tableOptions);

    instances[tableId] = instance;

    log("DataTable instance stored:", tableId);

    /* ---------- ACTIVITY TODAY SETUP ---------- */

    if (cleanTitle === "activity today") {
      ActivityToday.setupFilters(instance);

      ActivityToday.setupTaskForm();

      ActivityToday.setupSheetViewButton();

      ActivityToday.startRefresh(instance);
    }

    /* ---------- EXTRA TABLE LOGIC ---------- */

    if (MAIN_TABLES.includes(cleanTitle)) {
      applyTableSpecificLogic(title, instance, tableId, debug);
    }

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

    if (tableId === "#activity-today") {
      ActivityToday.stopRefresh();
    }

    const instance = instances[tableId];
    const $table = $(tableId);

    // If there's no instance and no table element, nothing to do
    if (
      !instance &&
      (!$table.length || !$.fn.DataTable.isDataTable($table[0]))
    ) {
      delete instances[tableId];
      return;
    }

    // If table element is gone, just clean up our reference
    if (!$table.length) {
      delete instances[tableId];
      return;
    }

    // Try to destroy the DataTable safely
    if (instance) {
      try {
        // true => remove DataTables-added DOM, don't try to restore original
        instance.destroy(true);
      } catch (error) {
        console.warn("Failed to destroy DataTable:", tableId, error);
      } finally {
        delete instances[tableId];
      }
      return;
    }

    // Fallback: untracked DataTable on this element
    if (!$.fn.DataTable.isDataTable($table[0])) {
      return;
    }

    try {
      $table.DataTable().destroy(true);
    } catch (error) {
      console.warn("Failed to destroy existing DataTable:", tableId, error);
    }
  }

  function destroyAll() {
    Object.keys(instances).forEach((tableId) => {
      destroy(tableId);
    });

    ActivityToday.stopRefresh();
  }

  function addColumnClass(tableId, colIndex, className) {
    const instance = getInstance(tableId);

    if (!instance) {
      return;
    }

    instance.column(colIndex).nodes().to$().addClass(className);
  }

  function applyTableSpecificLogic(title, instance, tableId, debug = false) {
    const log = (...args) => debug && console.log(...args);
    const cleanTitle = title.toLowerCase().trim();

    if (cleanTitle === "top paid accounts") {
      instance.order([1, "desc"]).draw();

      addColumnClass(tableId, 1, "highlight");

      addColumnClass(tableId, 3, "dt-center");

      highlightTopRows(tableId, 3);
    } else if (cleanTitle === "outstanding accounts") {
      instance.order([2, "desc"]).draw();

      addColumnClass(tableId, 2, "highlight");

      addColumnClass(tableId, 3, "dt-center");

      highlightTopRows(tableId, 3);
    }

    log("Extra table logic completed:", title);
  }

  function highlightTopRows(tableId, rowCount, rowClass = "highlight-row") {
    const $tbody = $(`${tableId} tbody`);

    if (!$tbody.length) {
      return;
    }

    /*
     * Remove old highlighting first.
     * This is better than returning when the class exists,
     * because DataTables can redraw the rows.
     */
    $tbody.find(`.${rowClass}`).removeClass(rowClass);

    $tbody.find(".row-rank").remove();

    $tbody.find("tr").each((index, row) => {
      if (index >= rowCount) {
        return;
      }

      row.classList.add(rowClass);

      const firstTd = row.querySelector("td");

      if (!firstTd) {
        return;
      }

      const span = document.createElement("span");

      span.className = "row-rank";

      span.textContent = String(index + 1);

      firstTd.prepend(span);
    });
  }

  return {
    init,
    getInstance,
    destroyAll,
  };
})();

export { DataTableModule };
