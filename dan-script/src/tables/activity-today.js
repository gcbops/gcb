import { AppUtils } from "../utils.js";
import { HourSummary } from "../hours/hour-summary.js";

const ActivityToday = (() => {
  const ACTIVITY_TABLE_ID = "#table";
  const ACTIVITY_CACHE_KEY = "cache_ActivityToday";
  const REFRESH_INTERVAL = 10000;

  const SPECIAL_STATUSES = [
    "Moved to PM",
    "Revision Done",
    "Complete",
    "For QA",
  ];

  const resetableCacheKeyForUpdatingHours = [
    "cache_ActiveClients",
    "cache_OutstandingAccounts",
    "topPaidClients",
    "topProjects",
    "hoursSummary",
    "hourTotals",
    "chartData_daily",
    "chartData_monthly",
    "chartData_yearly",
    "chartData_yearly_all",
  ];

  let refreshTimer = null;
  let isRefreshing = false;

  /* ---------------------------------------------------------
   * FILTERS
   * --------------------------------------------------------- */

  function setupFilters(dataTable) {
    if (!dataTable) {
      return;
    }

    updateFilterCounts(dataTable);

    const $wrapper = $(".main-card");

    setupFilterButton(
      $wrapper,
      ".not-done-div",
      ".not-done-text",
      "#dashFilter",
      (row) => row[5] === "-",
      dataTable,
    );

    setupFilterButton(
      $wrapper,
      ".special-div",
      ".special-count",
      "#waitingFilter",
      (row) => SPECIAL_STATUSES.includes(row[1]) && row[5] === "-",
      dataTable,
    );
  }

  function setupFilterButton(
    $wrapper,
    containerSelector,
    countSelector,
    buttonSelector,
    filter,
    dataTable,
  ) {
    if (!$wrapper.find(containerSelector).length) {
      return;
    }

    const count = countRows(dataTable, filter);

    $wrapper.find(countSelector).text(count);

    $(document)
      .off(`click.activityToday`, buttonSelector)
      .on(`click.activityToday`, buttonSelector, () => {
        const $table = $(ACTIVITY_TABLE_ID);

        if (!$table.hasClass("gc-table-filtered")) {
          $("#resetFilterCustom").show();

          applyFilter(dataTable, filter);

          $table.addClass("gc-table-filtered");

          return;
        }

        resetFilters(dataTable);

        $table.removeClass("gc-table-filtered");
      });
  }

  function applyFilter(dataTable, filter) {
    $.fn.dataTable.ext.search = [filter];

    dataTable.draw();
  }

  function resetFilters(dataTable) {
    $.fn.dataTable.ext.search = [];
    dataTable.search("").columns().search("").draw();
    $("#resetFilterCustom").hide();
  }

  function updateFilterCounts(dataTable) {
    const counts = getActivityCounts(dataTable);

    $(".not-done-text").text(counts.notDone);
    $(".special-count").text(counts.special);
  }

  function getActivityCounts(dataTable) {
    let notDone = 0;
    let special = 0;

    if (!dataTable) {
      return { notDone, special };
    }

    try {
      dataTable.rows().every(function () {
        const row = this.data();

        if (!row) {
          return;
        }

        if (row[5] === "-") {
          notDone++;
        }

        if (SPECIAL_STATUSES.includes(row[1]) && row[5] === "-") {
          special++;
        }
      });
    } catch (error) {
      console.error("Failed to count Activity Today rows:", error);
    }

    return {
      notDone,
      special,
    };
  }

  function countRows(dataTable, filter) {
    let count = 0;

    if (!dataTable || typeof filter !== "function") {
      return count;
    }

    try {
      dataTable.rows().every(function () {
        if (filter(this.data())) {
          count++;
        }
      });
    } catch (error) {
      console.error("Failed to count Activity Today rows:", error);
    }

    return count;
  }

  /* ---------------------------------------------------------
   * TASK FORM
   * --------------------------------------------------------- */

  function setupTaskForm() {
    const $taskSelect = $("#task");
    const $clientInput = $("#client");
    const $selectClient = $("#selectClient-a-m");
    const $taskForm = $("#taskForm");

    if (!$taskSelect.length || !$taskForm.length || !$clientInput.length) {
      return;
    }

    setupClientSelector($selectClient, $taskForm);

    $taskForm
      .off("submit.activityToday")
      .on("submit.activityToday", handleTaskSubmit);

    $("#submit-new-hours")
      .off("click.activityToday")
      .on("click.activityToday", handleTaskSubmit);

    AppUtils.initSelect2("#drawerManualAdd .drawer-content");
  }

  function setupClientSelector($selectClient, $taskForm) {
    if (!$selectClient.length) {
      return;
    }

    $selectClient
      .off("click.activityToday")
      .on("click.activityToday", function (event) {
        event.preventDefault();

        const $drawer = $taskForm.parents(".drawer-content");
        const $firstGroup = $taskForm.find(".form-group").first();
        const $icon = $selectClient.find("i");

        $drawer
          .toggleClass("drawer-grid-4", $drawer.hasClass("drawer-grid-5"))
          .toggleClass("drawer-grid-5", !$drawer.hasClass("drawer-grid-5"));

        $firstGroup.toggleClass("element-hidden");

        $icon
          .toggleClass("fa-plus", function () {
            return $(this).hasClass("fa-minus");
          })
          .toggleClass("fa-minus", function () {
            return $(this).hasClass("fa-plus");
          });

        AppUtils.openDrawer("#drawerManualAdd");
      });
  }

  function handleTaskSubmit(event) {
    event.preventDefault();

    const $form = $(this);
    let $submitBtn = $form.find('button[type="submit"]');

    if (!$submitBtn.length) {
      $submitBtn = $("#submit-new-hours");
    }

    const formData = {
      client: String($("#client").val() || "").trim(),
      hour: String($("#hour").val() || "").trim(),
      type: String($("#type").val() || "").trim(),
      task: String($("#task").val() || "").trim(),
    };

    if (Object.values(formData).some((value) => !value)) {
      AppUtils.showDashboardToast(
        "Please fill out all required fields!",
        "error",
      );

      return;
    }

    AppUtils.submitForm({
      gscriptFunc: "recordManualClientHoursFromForm",
      data: formData,
      $btn: $submitBtn,
      loadingText: "Saving ...",

      onSuccess: () => {
        handleTaskSaveSuccess(formData);
      },
    });
  }

  function handleTaskSaveSuccess(formData) {
    AppUtils.showDashboardToast(
      "Hours have been successfully recorded!",
      "success",
    );

    google.script.run.pullClientProjects();

    HourSummary.loadHourTotals(true);

    clearClientCaches(formData.client);

    AppUtils.resetCacheKeys(resetableCacheKeyForUpdatingHours);

    resetYearlyChartCaches();

    $("#hour").val("");
  }

  function resetYearlyChartCaches(startYear = 2024) {
    const currentYear = new Date().getFullYear();

    const keys = [];

    for (let year = startYear; year <= currentYear; year++) {
      keys.push(`chartData_yearly_${year}`);
    }

    AppUtils.resetCacheKeys(keys);
  }

  function clearClientCaches(clientName) {
    const keys = [
      `getClientHourLogData_${clientName}`,
      `getClientHourLogData_${clientName}_time`,
      `getClientHours_${clientName}`,
      `getClientHours_${clientName}_time`,
    ];

    keys.forEach((key) => {
      AppUtils.cacheClear(key);
    });
  }

  /* ---------------------------------------------------------
   * SHEET VIEW
   * --------------------------------------------------------- */

  function setupSheetViewButton() {
    $("#viewMySheet-v-h")
      .off("click.activityToday")
      .on("click.activityToday", handleSheetView);
  }

  function handleSheetView() {
    const clientName = String($("#client-view-hours").val() || "").trim();

    if (!clientName) {
      AppUtils.showError("Please select a client first.");

      return;
    }

    AppUtils.showDashboardToast("Redirecting you to the sheet!", "info");

    google.script.run
      .withSuccessHandler((url) => {
        if (url) {
          window.open(url, "_blank");
        }
      })
      .withFailureHandler(() => {
        AppUtils.showError("Sheet doesn't exist!");
      })
      .getClientSheetUrl(clientName);
  }

  /* ---------------------------------------------------------
   * ACTION BUTTONS
   * --------------------------------------------------------- */

  function buildActionButtons(row = []) {
    const hours = parseHoursValue(row[4]);
    const canEdit = hours > 0;

    return $(`
    <div class="btn-group btn-group-sm">
      <button
        type="button"
        class="btn add-client"
        title="Add Client">
        <i class="pe-7s-plus"></i>
      </button>

      ${
        canEdit
          ? `
            <button
              type="button"
              class="btn edit-today-hours"
              title="Edit Today's Hours">
              <i class="pe-7s-note"></i>
            </button>
          `
          : ""
      }

      <button
        type="button"
        class="btn view-client"
        title="View Client">
        <i class="pe-7s-look"></i>
      </button>

      <button
        type="button"
        class="btn edit-client"
        title="Edit Client">
        <i class="pe-7s-note2"></i>
      </button>
    </div>
  `);
  }

  /* ---------------------------------------------------------
   * AUTO REFRESH
   * --------------------------------------------------------- */

  function startRefresh(dataTable) {
    stopRefresh();

    if (!dataTable) {
      return;
    }

    const refresh = () => {
      loadActivity(dataTable, () => {
        refreshTimer = setTimeout(refresh, REFRESH_INTERVAL);
      });
    };

    refresh();
  }

  function stopRefresh() {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }

    isRefreshing = false;
  }

  function loadActivity(dataTable, callback) {
    if (!dataTable || isRefreshing) {
      callback?.();

      return;
    }

    isRefreshing = true;

    google.script.run
      .withSuccessHandler((data) => {
        isRefreshing = false;

        updateActivityTable(data, dataTable);
        updateFilterCounts(dataTable);

        callback?.();
      })
      .withFailureHandler((error) => {
        isRefreshing = false;

        console.error("Activity Today refresh failed:", error);

        AppUtils.showError(error);

        callback?.();
      })
      .getDailyActivityData();
  }

  /* ---------------------------------------------------------
   * TABLE UPDATE
   * --------------------------------------------------------- */

  function updateActivityTable(data, dataTable) {
    if (!dataTable || !Array.isArray(data)) {
      return;
    }

    const cachedData = AppUtils.cacheGet(ACTIVITY_CACHE_KEY);

    if (isSameData(data, cachedData)) {
      return;
    }

    AppUtils.cacheSet(ACTIVITY_CACHE_KEY, data);

    const tableData = data.map((row) => [...row, ""]);

    dataTable.clear();
    dataTable.rows.add(tableData);
    dataTable.draw();

    AppUtils.playNotif();
  }

  function isSameData(newData, cachedData) {
    if (!Array.isArray(cachedData)) {
      return false;
    }

    if (newData.length !== cachedData.length) {
      return false;
    }

    return newData.every((newRow, rowIndex) => {
      const cachedRow = cachedData[rowIndex];

      if (!Array.isArray(cachedRow)) {
        return false;
      }

      if (newRow.length !== cachedRow.length) {
        return false;
      }

      return newRow.every(
        (value, columnIndex) => value === cachedRow[columnIndex],
      );
    });
  }

  function parseHoursValue(value) {
    if (value === null || value === undefined || value === "") {
      return 0;
    }

    // Numeric value
    if (typeof value === "number") {
      return value;
    }

    const text = String(value).trim();

    // Handle H:MM:SS
    if (text.includes(":")) {
      const parts = text.split(":").map(Number);

      if (parts.length === 3 && parts.every(Number.isFinite)) {
        const [hours, minutes, seconds] = parts;

        return hours + minutes / 60 + seconds / 3600;
      }

      if (parts.length === 2 && parts.every(Number.isFinite)) {
        const [hours, minutes] = parts;

        return hours + minutes / 60;
      }
    }

    return Number(text) || 0;
  }

  return {
    setupFilters,
    setupTaskForm,
    setupSheetViewButton,
    buildActionButtons,
    startRefresh,
    stopRefresh,
    updateActivityTable,
  };
})();

export { ActivityToday };
