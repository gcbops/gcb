import { HourSummary } from "../hours/hour-summary.js";
import { AppUtils } from "../utils.js";

const ActivityToday = (() => {
  const ACTIVITY_TABLE_ID = "#table";
  const ACTIVITY_CACHE_KEY = "cache_ActivityToday";
  const REFRESH_INTERVAL = 10000;

  const SPECIAL_STATUSES = [
    "Moved to PM",
    "Revisions Done",
    "Complete",
    "For QA",
  ];

  const resetableCacheKeyForUpdatingHours = [
    "cache_ActiveClients",
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

    const $wrapper = $(".activity-filter-buttons");

    setupFilterButton(
      $wrapper,
      ".not-done-div",
      ".not-done-text",
      "#dashFilter",
      '[data-activity-action="pending"]',
      (row) => row[5] === "PENDING",
      dataTable,
    );

    setupFilterButton(
      $wrapper,
      ".special-div",
      ".special-count",
      "#waitingFilter",
      '[data-activity-action="waiting"]',
      (row) => SPECIAL_STATUSES.includes(row[1]) && row[5] === "PENDING",
      dataTable,
    );
  }

  function setupFilterButton(
    $wrapper,
    containerSelector,
    countSelector,
    buttonSelector,
    mobileSelector,
    filter,
    dataTable,
  ) {
    if (!$wrapper.find(containerSelector).length) {
      return;
    }

    const count = countRows(dataTable, filter);

    $wrapper.find(countSelector).text(count);

    /*
     * Desktop button.
     */
    $(document)
      .off(`click.activityToday`, buttonSelector)
      .on(`click.activityToday`, buttonSelector, () => {
        toggleActivityFilter(dataTable, filter);
      });

    /*
     * Mobile button.
     */
    $(document)
      .off(`click.activityToday`, mobileSelector)
      .on(`click.activityToday`, mobileSelector, function () {
        toggleActivityFilter(dataTable, filter);

        /*
         * Close mobile dropdown after selection.
         */
        this.blur();

        const dropdown = this.closest(".dropdown");

        if (dropdown) {
          const dropdownButton = dropdown.querySelector(
            '[data-bs-toggle="dropdown"]',
          );

          if (dropdownButton) {
            const instance = bootstrap.Dropdown.getInstance(dropdownButton);

            if (instance) {
              instance.hide();
            }
          }
        }
      });
  }

  function toggleActivityFilter(dataTable, filter) {
    const $table = $(ACTIVITY_TABLE_ID);

    if (!$table.hasClass("gc-table-filtered")) {
      $("#resetFilterCustom").show();

      applyFilter(dataTable, filter);

      $table.addClass("gc-table-filtered");

      return;
    }

    resetFilters(dataTable);

    $table.removeClass("gc-table-filtered");
  }

  function applyFilter(dataTable, filter) {
    $.fn.dataTable.ext.search = [(settings, rowData) => filter(rowData)];

    dataTable.draw();
  }

  function resetFilters(dataTable) {
    $.fn.dataTable.ext.search = [];

    dataTable.search("").columns().search("").draw();

    $(ACTIVITY_TABLE_ID).removeClass("gc-table-filtered");

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

        if (row[5] === "PENDING") {
          notDone++;
        }

        if (SPECIAL_STATUSES.includes(row[1]) && row[5] === "PENDING") {
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

    // Mobile Add Activity
    $(document)
      .off("click.activityToday", '[data-activity-action="add"]')
      .on(
        "click.activityToday",
        '[data-activity-action="add"]',
        function (event) {
          event.preventDefault();

          openClientSelector($taskForm);

          const dropdown = this.closest(".dropdown");

          if (dropdown) {
            const dropdownButton = dropdown.querySelector(
              '[data-bs-toggle="dropdown"]',
            );

            if (dropdownButton) {
              const instance = bootstrap.Dropdown.getInstance(dropdownButton);

              if (instance) {
                instance.hide();
              }
            }
          }
        },
      );

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

        openClientSelector($taskForm);
      });
  }

  function openClientSelector($taskForm) {
    const $drawer = $taskForm.parents(".drawer-content");
    const $firstGroup = $taskForm.find(".form-group").first();
    // const $icon = $selectClient.find("i");

    $drawer
      .toggleClass("drawer-grid-4", $drawer.hasClass("drawer-grid-5"))
      .toggleClass("drawer-grid-5", !$drawer.hasClass("drawer-grid-5"));

    $firstGroup.toggleClass("element-hidden");

    // $icon
    //   .toggleClass("fa-plus", function () {
    //     return $(this).hasClass("fa-minus");
    //   })
    //   .toggleClass("fa-minus", function () {
    //     return $(this).hasClass("fa-plus");
    //   });

    AppUtils.openDrawer("#drawerManualAdd");
  }

  function handleTaskSubmit(event) {
    event.preventDefault();

    const $form = $(this);

    let $submitBtn = $form.find('button[type="submit"]');

    if (!$submitBtn.length) {
      $submitBtn = $("#submit-new-hours");
    }

    const loading = AppUtils.setButtonLoading($submitBtn, "Saving");

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
      loading.restore();

      return;
    }

    /*
     * Cache does not exist.
     * Ask Apps Script directly.
     */
    google.script.run
      .withSuccessHandler((isExternal) => {
        const external = isExternal === true;

        submitHours(external);
      })
      .withFailureHandler((err) => {
        console.error("isExternalClient failed:", err);

        AppUtils.showDashboardToast(
          "Unable to determine client type.",
          "error",
        );

        loading.restore();
      })
      .isExternalClient(formData.client);

    function submitHours(isExternal) {
      const gscriptFunc = isExternal
        ? "recordExternalClientHoursFromForm"
        : "recordManualClientHoursFromForm";

      // console.log(`[Hours] Client: ${formData.client}`);
      // console.log(`[Hours] External: ${isExternal}`);
      // console.log(`[Hours] Function: ${gscriptFunc}`);

      AppUtils.submitForm({
        gscriptFunc,
        data: formData,
        $btn: $submitBtn,
        loadingText: "Saving",

        onSuccess: () => {
          handleTaskSaveSuccess(formData);
        },
      });
    }
  }

  function handleTaskSaveSuccess(formData) {
    AppUtils.showDashboardToast(
      "Hours have been successfully recorded!",
      "success",
    );

    HourSummary.loadTodayChargedHours();

    google.script.run.syncClientProjects();

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

  function handleSheetView(e) {
    const clientName = String($("#client-view-hours").val() || "").trim();
    const btn = e.currentTarget;

    if (!clientName) {
      AppUtils.showError("Please select a client first.");

      return;
    }

    const loading = AppUtils.setButtonLoading(btn, "Redirecting");

    google.script.run
      .withSuccessHandler((url) => {
        if (url) {
          window.open(url, "_blank");
        }
        loading.restore();
      })
      .withFailureHandler(() => {
        AppUtils.showError("Sheet doesn't exist!");
        loading.restore();
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
    <div class="dropleft btn-group">
      <button
        type="button"
        class="p-0 btn border-0"
        data-bs-toggle="dropdown"
        aria-haspopup="true"
        aria-expanded="false"
        title="Activity actions"
      >
        <i class="pe-7s-more"></i>
      </button>

      <div
        tabindex="-1"
        role="menu"
        aria-hidden="true"
        class="dropdown-menu"
      >
        <button
          type="button"
          id="add-hours"
          class="dropdown-item add-hours"
        >
          <i class="pe-7s-plus me-2 text-primary"></i>
          Add Hours
        </button>

        ${
          canEdit
            ? `
              <button
                type="button"
                id="edit-today-hours"
                class="dropdown-item edit-today-hours"
              >
                <i class="pe-7s-note me-2 text-primary"></i>
                Edit Today's Hours
              </button>
            `
            : ""
        }

        <button
          type="button"
          id="view-hour-history"
          class="dropdown-item view-hour-history"
        >
          <i class="pe-7s-look me-2 text-success"></i>
          View Recent
        </button>

        <button
          type="button"
          id="edit-client-sheet"
          class="dropdown-item edit-client-sheet"
        >
          <i class="pe-7s-note2 me-2 text-info"></i>
          View Sheet
        </button>
      </div>
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
        HourSummary.loadTodayChargedHours();

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
