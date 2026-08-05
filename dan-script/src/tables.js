import {
  AppUtils,
  WidgetModule,
} from "./modules.js";

const TableModule = (() => {
  let dataTable = null;

  function loadClients(selectId = "#client", isForProject = false) {
    const cacheKey = "allClientsData";
    if (!$(selectId).length) {return;}

    AppUtils.cachedGScriptCall(cacheKey, "getClientTableDataWithNickname", [], (data) => {
      if (!Array.isArray(data)) {
        AppUtils.showError("Client data missing or invalid", data);
        return;
      }

      const options = data.map(c => ({
        id: c.name,
        text: c.name
      }));

      const $sel = $(selectId);
      $sel.empty();
      $sel.append(new Option("Select Client", "", true, true));
      $sel.select2({
        data: options,
        width: "100%",
        placeholder: "Select Client",
        allowClear: true
      });

      $sel.off("change.handleAddClient");     // prevent duplicates
      $sel.on("change.handleAddClient", function () {
        const selectedName = $(this).val();
        if(!isForProject) {
          handleAddClient(selectedName, true);
        } else {
          handleAddClient(selectedName, true, true);
        }
      });

    }
    );
  }

  function initDataTable(title, tableId, debug = false) {
    let tableOptions;

    const log = (...args) => debug && console.log(...args);
    const warn = (...args) => debug && console.warn(...args);
    const error = (...args) => debug && console.error(...args);

    const cleanTitle = title.toLowerCase().trim();

    const MAIN_TABLES = [
      "top paid accounts",
      "activity today",
      "outstanding accounts"
    ];

    const NUMERIC_SORT_TABLES = [
      "top paid accounts",
      "outstanding accounts"
    ];

    log("initDataTable called", { title, cleanTitle, tableId });

    /* ---------- TABLE CONFIG ---------- */
    if (MAIN_TABLES.includes(cleanTitle)) {
      log("Matched main tables config");

      tableOptions = {
        layout: {
          topStart: ["pageLength"],
          topEnd: ["search"],
          bottomStart: ["info"],
          bottomEnd: ["paging"],
        },
        paging: true,
        pageLength: 5,
        lengthMenu: [[5, 10, 25], [5, 10, 25]],
        initComplete() {
          log("DataTable initComplete");
          $(".dt-search input").focus();
        }
      };

      if (NUMERIC_SORT_TABLES.includes(cleanTitle)) {
        tableOptions.columnDefs = [
          { targets: [1,2], type: "num-fmt" }
        ];
      }

    } else if (cleanTitle === "upsell") {
      log("Matched Upsell config");

      tableOptions = {
        pageLength: 5,
        order: [],
        ordering: false,
        destroy: true,
        retrieve: true,
        searching: true,
        lengthChange: false,
        info: false,
        paging: true,
        columnDefs: [{ targets: [1, 2], className: "dt-center" }],
        language: { emptyTable: "No records yet" },
        dom: '<"bottom d-flex justify-content-between"f p>'
      };
    } else {
      warn("No tableOptions matched for title:", title);
      return;
    }

    /* ---------- TABLE ELEMENT ---------- */
    const $table = $(tableId);
    log("Table selector:", tableId, "found:", $table.length);

    if (!$table.length) {
      error("Table not found:", tableId);
      return;
    }

    /* ---------- DESTROY EXISTING ---------- */
    if ($.fn.DataTable.isDataTable($table)) {
      log("Existing DataTable found, destroying");

      try {
        $table.DataTable().clear().destroy();
        $table.empty();
      } catch (e) {
        error("Error destroying DataTable:", e);
      }
    }

    if (window.activityInterval) {
      clearInterval(window.activityInterval);
      window.activityInterval = null;
    }

    /* ---------- INIT ---------- */
    if (cleanTitle === "activity today") {
      log("Initializing Activity Today table");

      dataTable = $table.DataTable({
        ...tableOptions,
        createdRow(row) {
          log("Activity Today row created");
          $(row)
            .find("td:last")
            .addClass("action-btn")
            .html(buildActionButtons().html());
        }
      });

      /* 🔥 KEEP THESE */
      setupActivityTodayFilters();
      setupTaskForm();
      setupSheetViewButton();

      window.activityInterval = setInterval(loadActivity, 10000);

    } else {
      log("Initializing standard DataTable");
      log("Final tableOptions:", tableOptions);

      dataTable = $table.DataTable(tableOptions);
    }

    /* ---------- EXTRA LOGIC ---------- */
    if (MAIN_TABLES.includes(cleanTitle)) {
      log("Running extra table logic");
      handleExtraTableLogic(title);
    }

    log("DataTable init finished");
  }

  function buildTableBody($tbody, data, title, debug = false) {
    const log = (...args) => debug && console.log(...args);

    log("[buildTableBody] start", {
      title,
      rows: Array.isArray(data) ? data.length : "invalid data"
    });

    if (!Array.isArray(data)) {
      log("[buildTableBody] invalid data, aborting");
      return;
    }

    $tbody.empty();

    let skipped = 0;
    let rendered = 0;

    data.forEach((row, rowIndex) => {
      const isEmptyRow = row.every(
        cell =>
          cell === "" ||
          cell === null ||
          cell === undefined ||
          (typeof cell === "string" && cell.trim() === "")
      );

      if (isEmptyRow) {
        skipped++;
        log(`[Row ${rowIndex}] skipped empty row`, row);
        return;
      }

      log(`[Row ${rowIndex}] rendering`, row);

      const $tr = $("<tr></tr>");

      row.forEach((cell, colIndex) => {
        log(`  [Row ${rowIndex}][Col ${colIndex}] value:`, cell);

        const $td = $("<td></td>");

        if (colIndex === 3 && cell && title !== "Activity Today") {
          log(`  → applying span class:`, cell);
          $td.append(`<span class="${cell}">${cell}</span>`);
        } else {
          $td.text(cell || "");
        }

        $tr.append($td);
      });

      if (title === "Activity Today") {
        log(`[Row ${rowIndex}] adding action buttons`);
        $tr.append(buildActionButtons());
      }

      $tbody.append($tr);
      rendered++;
    });

    log("[buildTableBody] done", {
      renderedRows: rendered,
      skippedRows: skipped
    });
  }

  function buildActionButtons() {
    return $("<td class='action-btn'></td>")
      .append(`<button class="btn btn-sm add-client"><i class="pe-7s-cloud-upload"></i></button>`)
      .append(`<button class="btn btn-sm view-client"><i class="pe-7s-look"></i></button>`)
      .append(`<button class="btn btn-sm edit-client"><i class="pe-7s-note"></i></button>`);
  }

  function bindTableActions($tbody, data) {
    $tbody.off("click").on("click", ".action-btn .btn", function (e) {
      e.stopPropagation();
      const $btn = $(this);
      const $tr = $btn.closest("tr");
      const row = dataTable.row($tr).data();
      if (!row) {return AppUtils.showError("No row data found");}

      const clientName = (row[0] || "").trim();
      if (!clientName) {return AppUtils.showError("No client name found");}

      if ($btn.hasClass("add-client")) {return handleAddClient(clientName);}
      if ($btn.hasClass("view-client")) {return handleViewClient(clientName);}
      if ($btn.hasClass("edit-client")) {return handleEditClient(clientName);}
    });
  }

  function handleAddClient(clientName, manual = false, isForProject = false) {
    if ($("#client").length && !manual) {$("#client").val(clientName).trigger("change");}
    AppUtils.cachedGScriptCall(`sheetExists_${clientName}`, "sheetExists", [clientName], (exists) => {
      if (exists) {
        AppUtils.openDrawer("#drawerManualAdd");
        if(!isForProject) {loadTasks(clientName);}
      } else {
        AppUtils.showDashboardToast("Sheet " + clientName + " not found!", "error");
      }
    }
    );
  }

  function handleViewClient(clientName) {
    $("#client-v--h").val(clientName);
    AppUtils.showDashboardToast("Loading records ...", "info");
    AppUtils.cachedGScriptCall(
      `sheetExists_${clientName}`,
      "sheetExists",
      [clientName],
      (exists) => {
        if (exists) {
          loadViewClientonDrawer(clientName);
          loadClientHrsOverview(clientName);
        } else {
          AppUtils.showDashboardToast("Sheet " + clientName + " not found!", "error");
        }
      }
    );
  }

  function handleEditClient(clientName) {
    AppUtils.showDashboardToast("Redirecting you to the sheet!", "info");
    google.script.run
      .withSuccessHandler(url => window.open(url, "_blank"))
      .withFailureHandler(() => AppUtils.showDashboardToast("Sheet doesn't exist!", "error"))
      .getClientSheetUrl(clientName);
  }

  function loadTasks(clientName) {
    if (!clientName) {return;}
    const $taskSelect = $("#task");
    $taskSelect.html(`<option>Loading...</option>`).trigger("change");

    AppUtils.cachedGScriptCall(
      `getTaskOptions_${clientName}`,
      "getTaskOptions",
      [clientName],
      (returned) => {
        const tasks = Array.isArray(returned)
          ? returned
          : (() => { try { return JSON.parse(returned); } catch { return []; } })();

        $taskSelect.empty();
        if (tasks.length) {
          tasks.forEach((t) => {
            const value = typeof t === "object" ? t.value || t.id : t;
            const text = typeof t === "object" ? t.label || t.name : t;
            $taskSelect.append(new Option(text, value));
          });
        } else {
          $taskSelect.append(new Option("No tasks found", ""));
        }

        AppUtils.initSelect2("#drawerManualAdd .drawer-content");
      }
    );
  }

  function loadViewClientonDrawer(clientName) {
    const $tbodyClient = $("#client-dt tbody");
    $tbodyClient.html(`<tr><td colspan="4" class="text-center">Loading new records ...</td></tr>`);

    AppUtils.cachedGScriptCall(
      `getClientHourLogData_${clientName}`,
      "getClientHourLogData",
      [clientName],
      (data) => {
        if (!data?.length) {
          $tbodyClient.html(`<tr><td colspan="4" class="text-center">No records found</td></tr>`);
          return;
        }
        $tbodyClient.empty();
        data.sort((a, b) => new Date(b[3]) - new Date(a[3]))
          .slice(0, 5)
          .forEach((row) => {
            $tbodyClient.append(`
            <tr>
              <td>${row[0] || ""}</td>
              <td>${row[1] || ""}</td>
              <td>${row[2] || ""}</td>
              <td>${row[3] || ""}</td>
            </tr>
          `);
          });
      }
    );
  }

  function loadClientHrsOverview(clientName) {
    AppUtils.cachedGScriptCall(
      `getClientHours_${clientName}`,
      "getClientHoursForOverview",
      [clientName],
      (data) => {
        if (data.error === "NOT_FOUND") {
          AppUtils.showDashboardToast("Sheet not found!", "error");
          return;
        }
        AppUtils.openDrawer("#drawerManualInfo");
        $("#tt-hrs").text(data.totalHrs || 0);
        $("#tt-whrs").text(data.weekHrs || 0);
        $("#tt-mhrs").text(data.monthHrs || 0);
        $("#tt-yhrs").text(data.yearHrs || 0);
      }
    );
  }

  function handleExtraTableLogic(title) {
    if (title === "Top Paid Accounts") {
      dataTable.order([1, "desc"]).draw();
      addClassToDTColumn(1, "highlight");
      addClassToDTColumn(3, "dt-center");
      markTopRows(3, "#table");
    } else if (title === "Outstanding Accounts") {
      dataTable.order([2, "desc"]).draw();
      addClassToDTColumn(2, "highlight");
      addClassToDTColumn(3, "dt-center");
      markTopRows(3, "#table");
    } else if (title === "Active Clients") {
      reorderByStatus("Active");
    }
  }

  function setupActivityTodayFilters() {
    const notDoneCount = countNotDoneRows(dataTable);
    const specialCount = countSpecialRows(dataTable);
    // const $wrapper = $(dataTable.table().container()).closest(".dt-container");
    const $wrapper = $(".main-card");

    function dashFilter(settings, data) { return data[5] === "-"; }
    function waitingFilter(settings, data) {
      const allowed = ["Moved to PM", "For QA", "Complete", "Revisions Done"];
      return allowed.includes(data[1]) && data[5] === "-";
    }
    function applyFilter(func) {
      $.fn.dataTable.ext.search = [func]; dataTable.draw();
    }
    function resetFilters() {
      $.fn.dataTable.ext.search = []; dataTable.search("").columns().search("").draw();
    }

    if ($wrapper.find(".not-done-div").length) {
      $wrapper.find(".not-done-text").text(notDoneCount);
      $(document).on("click", "#dashFilter", () => { 
          const table = $("table#table");

          if (!table.hasClass("gc-table-filtered")) {
              $("#resetFilterCustom").show(); 
              applyFilter(dashFilter);
              table.addClass("gc-table-filtered");
          } else {
              resetFilters();
              table.removeClass("gc-table-filtered");
          }
      });
    }

    if ($wrapper.find(".special-div").length) {
      $wrapper.find(".special-count").text(specialCount);
      $(document).on("click", "#waitingFilter", () => { 
          const table = $("table#table");

          if (!table.hasClass("gc-table-filtered")) {
              $("#resetFilterCustom").show(); 
              applyFilter(waitingFilter);
              table.addClass("gc-table-filtered");
          } else {
              resetFilters();
              table.removeClass("gc-table-filtered");
          }
      });
    }
  }

  function setupTaskForm() {
    const $taskSelect = $("#task");
    const $clientInput = $("#client");
    const $selectClient = $("#selectClient-a-m");
    const $taskform = $("#taskForm");

    if (!$taskSelect.length || !$taskform.length || !$clientInput.length) {return;}

    $selectClient.on("click", function (e) {
      e.preventDefault();
      const $drawer = $taskform.parents(".drawer-content");
      const $firstGroup = $taskform.find(".form-group").first();
      const $icon = $selectClient.find("i");

      if ($drawer.hasClass("drawer-grid-4")) {
        $drawer.removeClass("drawer-grid-4").addClass("drawer-grid-5");
      } else {
        $drawer.removeClass("drawer-grid-5").addClass("drawer-grid-4");
      }

      if ($firstGroup.length) {
        $firstGroup.toggleClass("element-hidden");
      }
      
      if ($icon.hasClass("fa-plus")) {
        $icon.removeClass("fa-plus").addClass("fa-minus");
      } else {
        $icon.removeClass("fa-minus").addClass("fa-plus");
      }
      AppUtils.openDrawer("#drawerManualAdd");
    });

    $taskform.off("submit").on("submit", function(e) {
      e.preventDefault();

      const $submitBtn = $(this).find('button[type="submit"]');

      const formData = {
        client: ($clientInput.val() || "").trim(),
        hour: ($("#hour").val() || "").trim(),
        type: ($("#type").val() || "").trim(),
        task: ($taskSelect.val() || "").trim()
      };

      const hasEmpty = Object.values(formData).some(v => v === "");

      if (hasEmpty) {
        AppUtils.showDashboardToast("Please fill out all required fields!", "error");
        return;
      }

      AppUtils.showDashboardToast("Saving Record ...", "info");

      AppUtils.submitForm({
        gscriptFunc: "recordManualClientHoursFromForm",
        data: formData,
        $btn: $submitBtn,
        onSuccess: () => {
          AppUtils.showDashboardToast("Hours have been successfully recorded!", "success");

          // reload relevant data
          google.script.run.pullClientProjects();
          WidgetModule.loadGrindValues(true);

          const clientVal = formData.client;
          AppUtils.cacheClear(`getClientHourLogData_${clientVal}`);
          AppUtils.cacheClear(`getClientHourLogData_${clientVal}_time`);
          AppUtils.cacheClear(`getClientHours_${clientVal}`);
          AppUtils.cacheClear(`getClientHours_${clientVal}_time`);
          AppUtils.resetCacheKeys(AppUtils.resetableCacheKeyForUpdatingHours);

          $("#hour").val("");
        }
      });

      AppUtils.initSelect2("#drawerManualAdd .drawer-content");
    });

    AppUtils.initSelect2("#drawerManualAdd .drawer-content");
  }

  function setupSheetViewButton() {
    $("#viewMySheet-v-h").on("click", function () {
      let clientName = $("#client-v--h");
      if (clientName.length) {clientName = clientName.val();}
      AppUtils.showDashboardToast("Redirecting you to the sheet!", "info");
      google.script.run
        .withSuccessHandler(url => window.open(url, "_blank"))
        .withFailureHandler(() => AppUtils.showDashboardToast("Sheet doesn't exist!", "error"))
        .getClientSheetUrl(clientName);
    });
  }

  function loadActivity() {
    google.script.run
      .withSuccessHandler((data) => {
        updateActivityTable(data);

        if ($(".not-done-text").length) {$(".not-done-text").text(countNotDoneRows(dataTable));}
        if ($(".special-count").length) {$(".special-count").text(countSpecialRows(dataTable));}

      })
      .getDailyActivityData();
  }

  function updateActivityTable(data) {
    const newDataJSON = JSON.stringify(data);

    const cached = AppUtils.cacheGet("cache_ActivityToday");
    const cachedJSON = cached ? JSON.stringify(cached) : null;

    if (cachedJSON && newDataJSON === cachedJSON) {return;}

    AppUtils.cacheSet("cache_ActivityToday", data);
    const tableData = data.map(row => [...row, ""]);

    dataTable.clear();
    dataTable.rows.add(tableData);
    dataTable.draw();
    AppUtils.playNotif();
  }

  function renderData(data, sheetName, title, status) {
    const $tbody = $("#dataTableBody");

    if (!data || !Array.isArray(data)) {
      AppUtils.showError(title);
      if ($tbody.length) {$tbody.html(`<tr><td colspan="10">No data found for this report.</td></tr>`);}
      return;
    }

    if ($tbody.length) {buildTableBody($tbody, data, title);}
    if ($tbody.length) {bindTableActions($tbody, data);}
    initDataTable(title, "#table");
  }

  function renderUpsellRecords(tableData) {
    const $container = $("#upsellTable").parent();
    if (!$container.length) {return;}

    $container.html(`
    <table id="upsellTable" class="display table nowrap">
      <thead>
        <tr>
          <th>Client Name</th>
          <th>Upsell Hours</th>
          <th>Orasan Date</th>
        </tr>
      </thead>
      <tbody id="recordsBody"></tbody>
    </table>
  `);

    const $tbody = $("#recordsBody");

    let html;
    if (!Array.isArray(tableData) || tableData.length === 0) {
      html = `<tr><td colspan="3" style="text-align:center;color:#64748b">No records yet</td></tr>`;
    } else {
      html = tableData.map(r => `
      <tr>
        <td>${escapeHtml(r[0] ?? "")}</td>
        <td style="text-align:center;">${escapeHtml(r[1] ?? "")}</td>
        <td style="text-align:center;">${escapeHtml(r[2] ?? "")}</td>
      </tr>
    `).join('');
    }

    $tbody.html(html);

    if (Array.isArray(tableData) && tableData.length > 0) {
      initDataTable("Upsell", "#upsellTable");
    }
  }

  // ---- UTILS ----

  function countNotDoneRows(table) {
    try {
      return table.column(5).data().filter((v) => v === "-").length;
    } catch (e) {
      AppUtils.showError("countNotDoneRows failed:", e);
      return 0;
    }
  }

  function reorderByStatus(status) {
    dataTable.order([3, "asc"]).draw();
    dataTable.column(3).search(status ? "^" + status + "$" : "", true, false).draw();
  }

  function addClassToDTColumn(colIndex, className) {
    dataTable.column(colIndex).nodes().to$().addClass(className);
  }

  function markTopRows(rowCount, tableId, rowClass = "highlight-row") {
    const $tbody = $(`${tableId} tbody`);
    if (!$tbody.length) {return;}
    if ($tbody.find(`.${rowClass}`).length) {return;}

    $tbody.find("tr").each((i, row) => {
      if (i >= rowCount) {return;}

      row.classList.add(rowClass);

      const firstTd = row.querySelector("td");
      if (!firstTd) {return;}
      if (firstTd.querySelector(".row-rank")) {return;}

      const span = document.createElement("span");
      span.className = "row-rank";
      span.textContent = i + 1;

      firstTd.prepend(span);
    });
  }

  function highlightLatestRow(elId, badgeColumn = 0) {

      const $row = $(`#${elId} tr:first`);

      if (!$row.length) {return;}

      setTimeout(() => {
          $row.find(".badge-new-report").remove();
          $row.find("td").eq(badgeColumn).append(`
              <span class="badge badge-pill badge-success badge-new-report ml-2">
                  NEW
              </span>
          `);
          $row.hide().fadeIn(500);
          $row.addClass("table-success");
      }, 5000);

      setTimeout(() => {
          $row.removeClass("table-success");
      }, 15000);

  }

  function escapeHtml(text) {
    if (text === null || text === undefined) {return "";}
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function countSpecialRows(table) {
    const validStatuses = ["Moved to PM", "Revision Done", "Complete", "For QA"];
    let count = 0;
    try {
      table.rows().every(function () {
        const row = this.data();
        if (validStatuses.includes(row[1]) && row[5] === "-") {count++;}
      });
    } catch (e) {
      AppUtils.showError("countSpecialRows failed:", e);
    }
    return count;
  }

  return {
    loadClients,
    loadTasks,
    initDataTable,
    renderData,
    renderUpsellRecords,
    setupTaskForm,
    highlightLatestRow,
  };
})();

export { TableModule };