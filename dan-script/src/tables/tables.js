import { DataTableModule } from "./data-table.js";
import { TableRenderer } from "./table-renderer.js";
import { AppUtils } from "../utils.js";
import { TodayHoursEditor } from "./today-hours-editor.js";

const TableModule = (() => {
  /* ============================================================
   * TABLE ACTIONS
   * ========================================================== */

  function bindTableActions($tbody, tableId = "#table") {
    if (!$tbody?.length) {
      return;
    }

    $tbody
      .off("click.tableActions")
      .on("click.tableActions", ".action-btn-group .btn", function (e) {
        e.stopPropagation();

        const $btn = $(this);
        const $tr = $btn.closest("tr");

        const dataTable = DataTableModule.getInstance(tableId);

        if (!dataTable) {
          AppUtils.showError("DataTable instance not found.");
          return;
        }

        const row = dataTable.row($tr).data();

        if (!row) {
          AppUtils.showError("No row data found.");
          return;
        }

        const clientName = String(row[0] || "").trim();

        if (!clientName) {
          AppUtils.showError("No client name found.");
          return;
        }

        if ($btn.hasClass("add-client")) {
          addClient(clientName);
          return;
        }

        if ($btn.hasClass("edit-today-hours")) {
          TodayHoursEditor.open(clientName);
          return;
        }

        if ($btn.hasClass("view-client")) {
          viewClient(clientName);
          return;
        }

        if ($btn.hasClass("edit-client")) {
          editClient(clientName);
        }
      });
  }

  /* ============================================================
   * CLIENT ACTIONS
   * ========================================================== */

  function addClient(clientName, manual = false, isForProject = false) {
    if (!clientName) {
      return;
    }

    if ($("#client").length && !manual) {
      $("#client").val(clientName).trigger("change");
    }

    AppUtils.cachedGScriptCall(
      `sheetExists_${clientName}`,
      "sheetExists",
      [clientName],
      (exists) => {
        if (!exists) {
          AppUtils.showDashboardToast(
            `Sheet ${clientName} not found!`,
            "error",
          );
          return;
        }

        AppUtils.openDrawer("#drawerManualAdd");

        if (!isForProject) {
          loadClientTasks(clientName);
        }
      },
    );
  }

  function viewClient(clientName) {
    if (!clientName) {
      return;
    }

    $("#client-view-hours").val(clientName);

    AppUtils.showDashboardToast("Loading records ...", "info");

    AppUtils.cachedGScriptCall(
      `sheetExists_${clientName}`,
      "sheetExists",
      [clientName],
      (exists) => {
        if (!exists) {
          AppUtils.showDashboardToast(
            `Sheet ${clientName} not found!`,
            "error",
          );
          return;
        }

        loadClientHours(clientName);
        loadClientHoursOverview(clientName);
      },
    );
  }

  function editClient(clientName) {
    if (!clientName) {
      return;
    }

    AppUtils.showDashboardToast("Redirecting you to the sheet!", "info");

    google.script.run
      .withSuccessHandler((url) => {
        if (url && String(url).startsWith("http")) {
          window.open(url, "_blank");
        } else {
          AppUtils.showError("Invalid sheet URL.");
        }
      })
      .withFailureHandler(() => {
        AppUtils.showError("Sheet doesn't exist!");
      })
      .getClientSheetUrl(clientName);
  }

  /* ============================================================
   * CLIENT TASKS
   * ========================================================== */

  function loadClientTasks(clientName) {
    if (!clientName) {
      return;
    }

    const $taskSelect = $("#task");

    if (!$taskSelect.length) {
      return;
    }

    /*
     * Show loading state.
     */
    $taskSelect
      .html('<option value="">Loading...</option>')
      .val("")
      .trigger("change");

    AppUtils.cachedGScriptCall(
      `getTaskOptions_${clientName}`,
      "getTaskOptions",
      [clientName],
      (returned) => {
        const tasks = parseTaskOptions(returned);

        $taskSelect.empty();

        if (!tasks.length) {
          $taskSelect
            .append(new Option("No tasks found", ""))
            .val("")
            .trigger("change");

          return;
        }

        tasks.forEach((task) => {
          const value =
            typeof task === "object" ? task.value || task.id || "" : task;

          const text =
            typeof task === "object" ? task.label || task.name || value : task;

          if (!value && !text) {
            return;
          }

          $taskSelect.append(new Option(text, value));
        });

        /*
         * Select the first actual task option.
         *
         * The first option is now the first real task because
         * the select was emptied before adding the tasks.
         */
        const firstValue = $taskSelect.find("option:first").val();

        $taskSelect.val(firstValue || "").trigger("change");
      },
    );
  }

  function parseTaskOptions(returned) {
    if (Array.isArray(returned)) {
      return returned;
    }

    if (typeof returned !== "string") {
      return [];
    }

    try {
      const parsed = JSON.parse(returned);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /* ============================================================
   * CLIENT HOURS
   * ========================================================== */

  function loadClientHours(clientName) {
    const $table = $("#client-hours-table");
    const $tbody = $table.find("tbody");

    if (!$table.length || !$tbody.length) {
      return;
    }

    /*
     * Use the table header to determine colspan.
     */
    const colspan = getTableColumnCount($table);

    $tbody.html(`
      <tr>
        <td colspan="${colspan}" class="text-center">
          Loading new records ...
        </td>
      </tr>
    `);

    AppUtils.cachedGScriptCall(
      `getClientHourLogData_${clientName}`,
      "getClientHourLogData",
      [clientName],
      (data) => {
        if (!Array.isArray(data) || !data.length) {
          $tbody.html(`
            <tr>
              <td colspan="${colspan}" class="text-center">
                No records found
              </td>
            </tr>
          `);

          return;
        }

        $tbody.empty();

        data
          .sort((a, b) => new Date(b[3]) - new Date(a[3]))
          .slice(0, 5)
          .forEach((row) => {
            $tbody.append(`
              <tr>
                <td>${AppUtils.escapeHtml(row[0] ?? "")}</td>
                <td>${AppUtils.escapeHtml(row[1] ?? "")}</td>
                <td>${AppUtils.escapeHtml(row[2] ?? "")}</td>
                <td>${AppUtils.escapeHtml(row[3] ?? "")}</td>
              </tr>
            `);
          });
      },
    );
  }

  function loadClientHoursOverview(clientName) {
    AppUtils.cachedGScriptCall(
      `getClientHours_${clientName}`,
      "getClientHoursForOverview",
      [clientName],
      (data) => {
        if (!data || data.error === "NOT_FOUND") {
          AppUtils.showError("Sheet not found!");
          return;
        }

        AppUtils.openDrawer("#drawerManualInfo");

        $("#total-hours").text(data.totalHrs || 0);
        $("#weekly-hours").text(data.weekHrs || 0);
        $("#monthly-hours").text(data.monthHrs || 0);
        $("#yearly-hours").text(data.yearHrs || 0);
      },
    );
  }

  /* ============================================================
   * GENERIC CLIENT DATA TABLE
   * ========================================================== */

  function renderClientData(data, title) {
    const $tbody = $("#data-table-body");

    if (!$tbody.length) {
      return;
    }

    const $table = $tbody.closest("table");

    if (!$table.length) {
      return;
    }

    if (!Array.isArray(data)) {
      AppUtils.showError(title);

      renderEmptyState($table, "No data found for this report.");

      return;
    }

    if (!data.length) {
      renderEmptyState($table, "No data found for this report.");

      return;
    }

    TableRenderer.renderTableBody($tbody, data, title);

    const tableId = $table.attr("id");

    if (!tableId) {
      return;
    }

    const selector = `#${tableId}`;

    bindTableActions($tbody, selector);

    DataTableModule.init(title, selector);
  }

  /* ============================================================
   * TABLE HELPERS
   * ========================================================== */

  function getTableColumnCount($table) {
    const count = $table.find("thead tr:first th").length;

    return count || 1;
  }

  function renderEmptyState($table, message) {
    const $tbody = $table.find("tbody");

    if (!$tbody.length) {
      return;
    }

    const colspan = getTableColumnCount($table);

    /*
     * If DataTables is already active, destroy it first.
     * This prevents DataTables from fighting with manually
     * inserted empty-state rows.
     */
    const tableId = $table.attr("id");

    if (tableId) {
      DataTableModule.destroy(`#${tableId}`);
    }

    $tbody.html(`
      <tr>
        <td
          colspan="${colspan}"
          class="text-center text-muted py-4"
        >
          ${AppUtils.escapeHtml(message)}
        </td>
      </tr>
    `);
  }

  /* ============================================================
   * HIGHLIGHT LATEST ROW
   * ========================================================== */

  function highlightLatestRow(elId, badgeColumn = 0) {
    const $tbody = $(`#${elId}`).find("tbody");

    if (!$tbody.length) {
      return;
    }

    const $row = $tbody.find("tr:first");

    if (!$row.length) {
      return;
    }

    setTimeout(() => {
      $row.find(".badge-new-report").remove();

      $row.find("td").eq(badgeColumn).append(`
            <span
              class="badge badge-pill badge-success badge-new-report ms-2"
            >
              NEW
            </span>
          `);

      $row.hide().fadeIn(500).addClass("table-row-highlighted");
    }, 10000);

    setTimeout(() => {
      $row.removeClass("table-row-highlighted");
    }, 20000);
  }

  return {
    loadClientTasks,
    renderClientData,
    highlightLatestRow,
    bindTableActions,
    addClient,
    viewClient,
    editClient,
  };
})();

export { TableModule };
