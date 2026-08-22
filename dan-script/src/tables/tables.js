import { DataTableModule } from "./data-table.js";
import { TableRenderer } from "./table-renderer.js";
import { AppUtils } from "../utils.js";
import { TodayHoursEditor } from "./today-hours-editor.js";

const TableModule = (() => {

  function bindTableActions($tbody, tableId = "#table") {
    $tbody
      .off("click.tableActions")
      .on("click.tableActions", ".action-btn .btn", function (e) {
        e.stopPropagation();

        const $btn = $(this);
        const $tr = $btn.closest("tr");

        const dataTable = DataTableModule.getInstance(tableId);

        if (!dataTable) {
          return AppUtils.showError("DataTable instance not found");
        }

        const row = dataTable.row($tr).data();

        if (!row) {
          return AppUtils.showError("No row data found");
        }

        const clientName = (row[0] || "").trim();

        if (!clientName) {
          return AppUtils.showError("No client name found");
        }

        if ($btn.hasClass("add-client")) {
          return addClient(clientName);
        }

        if ($btn.hasClass("edit-today-hours")) {
          return TodayHoursEditor.open(clientName);
        }

        if ($btn.hasClass("view-client")) {
          return viewClient(clientName);
        }

        if ($btn.hasClass("edit-client")) {
          return editClient(clientName);
        }
      });
  }

  function addClient(clientName, manual = false, isForProject = false) {
    if ($("#client").length && !manual) {
      $("#client").val(clientName).trigger("change");
    }

    AppUtils.cachedGScriptCall(
      `sheetExists_${clientName}`,
      "sheetExists",
      [clientName],
      (exists) => {
        if (exists) {
          AppUtils.openDrawer("#drawerManualAdd");

          if (!isForProject) {
            loadClientTasks(clientName);
          }
        } else {
          AppUtils.showDashboardToast(
            `Sheet ${clientName} not found!`,
            "error",
          );
        }
      },
    );
  }

  function viewClient(clientName) {
    $("#client-view-hours").val(clientName);

    AppUtils.showDashboardToast("Loading records ...", "info");

    AppUtils.cachedGScriptCall(
      `sheetExists_${clientName}`,
      "sheetExists",
      [clientName],
      (exists) => {
        if (exists) {
          loadClientHours(clientName);

          loadClientHoursOverview(clientName);
        } else {
          AppUtils.showDashboardToast(
            `Sheet ${clientName} not found!`,
            "error",
          );
        }
      },
    );
  }

  function editClient(clientName) {
    AppUtils.showDashboardToast("Redirecting you to the sheet!", "info");

    google.script.run
      .withSuccessHandler((url) => window.open(url, "_blank"))
      .withFailureHandler(() =>
        AppUtils.showError("Sheet doesn't exist!"),
      )
      .getClientSheetUrl(clientName);
  }

  function loadClientTasks(clientName) {
    if (!clientName) {
      return;
    }

    const $taskSelect = $("#task");

    $taskSelect
      .html(`<option value="">Loading...</option>`)
      .val("")
      .trigger("change");

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

        $taskSelect.empty();

        if (tasks.length) {
          tasks.forEach((task) => {
            const value =
              typeof task === "object" ? task.value || task.id : task;

            const text =
              typeof task === "object" ? task.label || task.name : task;

            $taskSelect.append(new Option(text, value));
          });
        } else {
          $taskSelect.append(new Option("No tasks found", ""));
        }

        $taskSelect
          .val($taskSelect.find("option:eq(1)").val())
          .trigger("change");
      },
    );
  }

  function loadClientHours(clientName) {
    const $tbodyClient = $("#client-hours-table tbody");

    $tbodyClient.html(
      `
      <tr>
        <td colspan="4"
            class="text-center">
          Loading new records ...
        </td>
      </tr>
      `,
    );

    AppUtils.cachedGScriptCall(
      `getClientHourLogData_${clientName}`,
      "getClientHourLogData",
      [clientName],
      (data) => {
        if (!data?.length) {
          $tbodyClient.html(
            `
            <tr>
              <td colspan="4"
                  class="text-center">
                No records found
              </td>
            </tr>
            `,
          );

          return;
        }

        $tbodyClient.empty();

        data
          .sort((a, b) => new Date(b[3]) - new Date(a[3]))
          .slice(0, 5)
          .forEach((row) => {
            $tbodyClient.append(
              `
              <tr>
                <td>${AppUtils.escapeHtml(row[0] ?? "")}</td>
                <td>${AppUtils.escapeHtml(row[1] ?? "")}</td>
                <td>${AppUtils.escapeHtml(row[2] ?? "")}</td>
                <td>${AppUtils.escapeHtml(row[3] ?? "")}</td>
              </tr>
              `,
            );
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

  function renderClientData(data, title) {
    const $tbody = $("#data-table-body");

    if (!data || !Array.isArray(data)) {
      AppUtils.showError(title);

      if ($tbody.length) {
        $tbody.html(
          `
          <tr>
            <td colspan="10">
              No data found for this report.
            </td>
          </tr>
          `,
        );
      }

      return;
    }

    if (!$tbody.length) {
      return;
    }

    TableRenderer.renderTableBody($tbody, data, title);

    bindTableActions($tbody, "#table");

    DataTableModule.init(title, "#table");
  }

  function highlightLatestRow(elId, badgeColumn = 0) {
    const $tbody = $(`#${elId}`);

    if (!$tbody.length) {
      return;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const $row = $tbody.find("tr:first");

        if (!$row.length) {
          return;
        }

        $row.find(".badge-new-report").remove();

        $row
          .find("td")
          .eq(badgeColumn)
          .append(
            `
            <span
              class="badge badge-pill badge-success badge-new-report ms-2">
              NEW
            </span>
            `,
          );

        $row.hide().fadeIn(500).addClass("table-success");

        setTimeout(() => {
          $row.removeClass("table-success");
        }, 15000);
      });
    });
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
