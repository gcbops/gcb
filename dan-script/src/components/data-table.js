import { AuthorizationUIModule } from "../auth/authorization-ui.js";
import { manageUsersPage } from "../users/manage-users.js";
import { AppUtils } from "../utils/utils.js";
import { ActivityToday } from "../tables/activity-today.js";

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
    options = {},
    callback = null,
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

      paging: true,
      pageLength: 10,

      lengthMenu: [
        [10, 25, 50, 100],
        [10, 25, 50, 100],
      ],

      // Add data-row (optional) and data-col to cells
      createdRow(row, data, dataIndex) {
        $(row).attr("data-row", dataIndex);
      },

      createdCell(td, cellData, rowData, rowIndex, colIndex) {
        $(td).attr("data-col", colIndex);
      },

      drawCallback() {
        AuthorizationUIModule.applyActionPermissions();
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
          const $wrapper = $table
            .closest(".dataTable-wrapper, .dataTables_wrapper, div")
            .first();
          if ($wrapper.length) {
            $wrapper.css("min-height", "200px");
          } else {
            // Fallback: directly on table/tbody
            $table.css("min-height", "200px");
            $table.find("tbody").css("min-height", "200px");
          }
        }

        applyColumnHeaderAlignments($table, options.columnAlignments);

        if (typeof callback === "function") {
          callback(this.api());
        }
      },
    };

    applyDataTableOptions(tableOptions, options);

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
      "billing records export": [4, 5, -1],
      "backup history": [0, -1],
      "manage users": [0, 5],
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

    applyColumnAlignments(tableOptions, options.columnAlignments);

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

    const normalizedId = normalizeTableId(tableId);

    hideTableOverlay(normalizedId);

    const instance = instances[normalizedId];
    const $table = $(normalizedId);

    /*
     * Stop page-specific refresh logic.
     */
    if (normalizedId === "#activity-today") {
      ActivityToday.stopRefresh();
    }

    if (normalizedId === "#manage-users-table") {
      manageUsersPage.stopRefresh();
    }

    /*
     * Remove our reference immediately.
     *
     * This prevents destroyAll() or another lifecycle
     * call from attempting to destroy the same instance
     * again.
     */
    delete instances[normalizedId];

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
      console.warn("DataTable cleanup skipped:", normalizedId, err);
    }
  }

  function destroyAll() {
    Object.keys(instances).forEach((tableId) => {
      destroy(tableId);
    });

    ActivityToday.stopRefresh();
    manageUsersPage.stopRefresh();
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

  function applyDataTableOptions(tableOptions, options = {}) {
    /*
     * Layout customization
     */
    if (options.layout) {
      tableOptions.layout = {
        ...tableOptions.layout,
        ...options.layout,
      };
    }

    /*
     * Feature visibility
     */
    if (options.hideSearch) {
      tableOptions.layout.topEnd = null;
    }

    if (options.hideLengthMenu) {
      tableOptions.layout.topStart = null;
      tableOptions.lengthChange = false;
    }

    if (options.hideInfo) {
      tableOptions.layout.bottomStart = null;
    }

    if (options.hidePagination) {
      tableOptions.layout.bottomEnd = null;
      tableOptions.paging = false;
    }

    if (options.hideAllControls) {
      tableOptions.layout = {
        topStart: null,
        topEnd: null,
        bottomStart: null,
        bottomEnd: null,
      };

      tableOptions.paging = false;
      tableOptions.lengthChange = false;
      tableOptions.info = false;
    }

    /*
     * Behavior overrides
     */
    if (typeof options.responsive === "boolean") {
      tableOptions.responsive = options.responsive;
    }

    if (typeof options.paging === "boolean") {
      tableOptions.paging = options.paging;

      if (!options.paging) {
        tableOptions.layout.bottomEnd = removeLayoutFeature(
          tableOptions.layout.bottomEnd,
          "paging",
        );
      }
    }

    if (typeof options.info === "boolean") {
      tableOptions.info = options.info;

      if (!options.info) {
        tableOptions.layout.bottomStart = null;
      }
    }

    if (typeof options.lengthChange === "boolean") {
      tableOptions.lengthChange = options.lengthChange;

      if (!options.lengthChange) {
        tableOptions.layout.topStart = null;
      }
    }

    if (options.pageLength) {
      tableOptions.pageLength = options.pageLength;
    }

    if (options.lengthMenu) {
      tableOptions.lengthMenu = options.lengthMenu;
    }

    if (options.scrollY) {
      tableOptions.scrollY = options.scrollY;

      tableOptions.scrollCollapse = options.scrollCollapse !== false;
    }

    if (typeof options.scrollCollapse === "boolean") {
      tableOptions.scrollCollapse = options.scrollCollapse;
    }

    if (options.order) {
      tableOptions.order = options.order;
    }
  }

  function applyColumnAlignments(tableOptions, alignments = {}) {
    const mergedAlignments = {
      first: "left",
      ...alignments,
    };

    const alignmentClasses = {
      left: "dt-align-left",
      center: "dt-align-center",
      right: "dt-align-right",
    };

    Object.entries(mergedAlignments).forEach(([target, alignment]) => {
      const className = alignmentClasses[alignment];

      if (!className) {
        return;
      }

      tableOptions.columnDefs.push({
        targets: normalizeColumnTarget(target),
        className,
      });
    });
  }

  function normalizeColumnTarget(target) {
    if (target === "first") {
      return 0;
    }

    if (target === "last") {
      return -1;
    }

    if (target === "_all") {
      return "_all";
    }

    if (Array.isArray(target)) {
      return target.map((item) => normalizeColumnTarget(item));
    }

    const numeric = Number(target);

    return Number.isNaN(numeric) ? target : numeric;
  }

  function applyColumnHeaderAlignments($table, alignments = {}) {
    const mergedAlignments = {
      first: "left",
      ...alignments,
    };

    const $headers = $table.find("thead th");

    Object.entries(mergedAlignments).forEach(([target, alignment]) => {
      const normalizedTarget = normalizeColumnTarget(target);

      const $header = resolveColumnTargets($headers, normalizedTarget);

      if (!$header.length) {
        return;
      }

      $header.removeClass("text-start text-center text-end");

      if (alignment === "left") {
        $header.addClass("text-start");
      }

      if (alignment === "center") {
        $header.addClass("text-center");
      }

      if (alignment === "right") {
        $header.addClass("text-end");
      }
    });
  }

  function removeLayoutFeature(layoutValue, featureName) {
    if (!layoutValue) {
      return null;
    }

    if (Array.isArray(layoutValue)) {
      const filtered = layoutValue.filter((feature) => {
        const name =
          typeof feature === "string" ? feature : Object.keys(feature)[0];

        return name !== featureName;
      });

      return filtered.length ? filtered : null;
    }

    if (
      typeof layoutValue === "object" &&
      Object.keys(layoutValue)[0] === featureName
    ) {
      return null;
    }

    return layoutValue;
  }

  function resolveColumnTargets($headers, target) {
    if (target === "_all") {
      return $headers;
    }

    if (target === -1) {
      return $headers.last();
    }

    if (typeof target === "number") {
      return $headers.eq(target);
    }

    if (Array.isArray(target)) {
      const $matched = $();

      target.forEach((item) => {
        const $item = resolveColumnTargets($headers, item);

        if ($item.length) {
          $matched.push($item[0]);
        }
      });

      return $matched;
    }

    return $();
  }

  function getColumnCount(tableId) {
    const $table = $(tableId);

    if (!$table.length) {
      return 1;
    }

    return $table.find("thead th").length || 1;
  }

  function normalizeTableId(tableId) {
    if (!tableId) {
      return tableId;
    }

    const value = String(tableId).trim();

    return value.startsWith("#") ? value : `#${value}`;
  }

  function hasTableRows(tableId) {
    const $table = $(normalizeTableId(tableId));

    if (!$table.length) {
      return false;
    }

    return $table.find("tbody tr:not(.dt-loader-row)").length > 0;
  }

  function showLoader(tableId) {
    const normalizedId = normalizeTableId(tableId);

    const $table = $(normalizedId);

    if (!$table.length) {
      return;
    }

    const $tbody = $table.find("tbody");

    if (!$tbody.length) {
      return;
    }

    /*
     * Table already has records:
     * show a centered overlay instead of
     * replacing the existing rows.
     */
    if (hasTableRows(normalizedId)) {
      showTableOverlay(normalizedId);
      return;
    }

    /*
     * No rows yet:
     * use the existing bar-loader row.
     */
    const colCount = getColumnCount(normalizedId);

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

  function showTableOverlay(tableId) {
    const normalizedId = normalizeTableId(tableId);

    const $table = $(normalizedId);

    if (!$table.length) {
      return;
    }

    hideTableOverlay(normalizedId);

    /*
     * Scroll the DataTable back to the top
     * before locking its scroll area.
     */
    scrollDataTableToTop(normalizedId);

    const $wrapper = $table.closest(
      ".dataTables_wrapper, .dataTable-wrapper, .dt-scroll-body, div",
    );

    const $overlay = $(`
    <div class="dt-table-overlay">
      <div class="dt-table-overlay-content">
        <div class="bar-loader">
          <span></span>
          <span></span>
          <span></span>
        </div>

        <div class="dt-table-overlay-text">
          Syncing...
        </div>
      </div>
    </div>
  `);

    if ($wrapper.length) {
      $wrapper.addClass("position-relative");
      $wrapper.addClass("dt-table-scroll-locked");
      $wrapper.append($overlay);
    } else {
      $table.addClass("position-relative");
      $table.addClass("dt-table-scroll-locked");
      $table.after($overlay);
    }
  }

  function hideTableOverlay(tableId) {
    const normalizedId = normalizeTableId(tableId);

    const $table = $(normalizedId);

    if (!$table.length) {
      return;
    }

    const $wrapper = $table.closest(
      ".dataTables_wrapper, .dataTable-wrapper, div",
    );

    $wrapper
      .removeClass("dt-table-scroll-locked")
      .find(".dt-table-overlay")
      .remove();

    $table.removeClass("dt-table-scroll-locked");
  }

  function scrollDataTableToTop(tableId) {
    const normalizedId = normalizeTableId(tableId);

    const apiInstance = DataTableModule.instances?.[normalizedId];

    if (apiInstance) {
      try {
        apiInstance.row(0).scrollTo(false);
        return;
      } catch (error) {
        console.warn("[DataTable] scrollTo failed:", error);
      }
    }

    $(normalizedId)
      .closest(".dataTables_wrapper, .dataTable-wrapper")
      .find(".dataTables_scrollBody, .dt-scroll-body")
      .scrollTop(0);
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

    hideTableOverlay(tableId);

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
    hideTableOverlay,

    showLoader,
    getColumnCount,
    showError,
    showEmpty,
    renderRows,
  };
})();

export { DataTableModule };
