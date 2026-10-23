import {
  getAuthArgs,
  handleInvalidSessionError,
} from "../auth/auth-error-handler.js";
import { HourSummary } from "../hours/hour-summary.js";
import { RequestManager } from "../requests/request-manager.js";
import { AppUtils } from "../utils/utils.js";
import { ValidationModule } from "../utils/validations.js";
import { DataTableModule } from "../components/data-table.js";

const ActivityToday = (() => {
  const ACTIVITY_TABLE_ID = "#table";
  const ACTIVITY_CACHE_KEY = "cache_ActivityToday";
  const REFRESH_INTERVAL = 10000;
  const ERROR_REFRESH_INTERVAL = 30000;
  const MAX_CLIENT_NAME_LENGTH = 100;
  const MAX_TYPE_LENGTH = 100;
  const MAX_TASK_LENGTH = 500;

  const MIN_HOURS = 0;
  const MAX_HOURS = 24;

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
  let refreshLockTimer = null;

  let activeRequestId = null;
  let nextRequestId = 0;
  let refreshGeneration = 0;

  const REFRESH_LOCK_TIMEOUT = 45000;

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

    // AppUtils.initSelect2("#drawerManualAdd .drawer-content");
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

    const formData = {
      client: String($("#client").val() || "").trim(),
      hour: String($("#hour").val() || "").trim(),
      type: String($("#type").val() || "").trim(),
      task: String($("#task").val() || "").trim(),
    };

    const validation = clientActivityForm(formData);

    if (!validation.valid) {
      AppUtils.showDashboardToast(validation.message, "error");
      return;
    }

    const validatedData = validation.value;

    try {
      RequestManager.enqueue(
        "record-hours",
        validatedData,
        `Add ${validatedData.hour} hours — ${validatedData.client}`,
      );

      $("#hour").val("");

      AppUtils.showDashboardToast(
        "Hours request added to the queue.",
        "success",
      );
    } catch (error) {
      console.error("[ActivityToday] Unable to queue hours:", error);

      AppUtils.showDashboardToast(
        error?.message || "Unable to queue this hours request.",
        "error",
      );
    }
  }

  function handleTaskSaveSuccess(formData) {
    AppUtils.showDashboardToast(
      "Hours have been successfully recorded!",
      "success",
    );

    HourSummary.loadTodayChargedHours();

    const activityTable = DataTableModule.getInstance("#table");

    if (activityTable) {
      refreshActivityTable(activityTable);
    }

    const task = formData.task;
    const client = formData.client;

    const cacheKey = `gcb_getTaskOptions_${client}`;
    const cachedTasks = AppUtils.cacheGet(cacheKey) || [];

    if (!cachedTasks.includes(task)) {
      (async () => {
        try {
          const [sessionId, signature] = await getAuthArgs();

          AppUtils.gScriptRun({
            gscriptFunc: "syncClientProjects",
            args: [sessionId, signature],

            onError: (error) => {
              console.warn(
                "[TaskSubmit] Failed to sync client projects:",
                error,
              );
            },
          });
        } catch (error) {
          if (handleInvalidSessionError(error)) {
            return;
          }

          console.warn(
            "[TaskSubmit] Unable to authenticate project sync:",
            error,
          );
        }
      })();
    }

    clearClientCaches(client);

    AppUtils.resetCacheKeys(resetableCacheKeyForUpdatingHours);

    resetYearlyChartCaches();
  }

  function clientActivityForm(data) {
    const client = ValidationModule.requiredString(data.client, "Client", {
      maxLength: MAX_CLIENT_NAME_LENGTH,
    });

    if (!client.valid) {
      return client;
    }

    const hour = ValidationModule.number(data.hour, "Hours", {
      min: MIN_HOURS,
      max: MAX_HOURS,
    });

    if (!hour.valid) {
      return hour;
    }

    const type = ValidationModule.requiredString(data.type, "Type", {
      maxLength: MAX_TYPE_LENGTH,
    });

    if (!type.valid) {
      return type;
    }

    const task = ValidationModule.requiredString(data.task, "Task", {
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

    return {
      valid: true,
      value: {
        client: client.value,
        hour: hour.value,
        type: type.value,
        task: task.value,
      },
    };
  }

  function refreshActivityTable(dataTable) {
    loadActivity(dataTable, null, true);
  }

  function resetYearlyChartCaches(startYear = 2024) {
    const currentYear = new Date().getFullYear();

    const keys = [];

    for (let year = startYear; year <= currentYear; year++) {
      keys.push(`chartData_yearly_${year}`);
      keys.push(`chartData_yearly_monthly_hours_${year}`);
      keys.push(`chartData_monthly_hours_by_year_${year}`);
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

  async function handleSheetView(e) {
    const clientName = String($("#client-view-hours").val() || "").trim();

    const btn = e.currentTarget;

    if (!clientName) {
      AppUtils.showError("Please select a client first.");

      return;
    }

    const loading = AppUtils.setButtonLoading(btn, "Redirecting");

    try {
      const [sessionId, signature] = await getAuthArgs();

      AppUtils.gScriptRun({
        gscriptFunc: "getClientSheetUrl",
        args: [sessionId, signature, clientName],

        onSuccess: (url) => {
          if (url) {
            window.open(url, "_blank");
          }

          loading.restore();
        },

        onError: () => {
          AppUtils.showError("Sheet doesn't exist!");

          loading.restore();
        },
      });
    } catch (error) {
      loading.restore();

      if (handleInvalidSessionError(error)) {
        return;
      }

      AppUtils.showError(error?.message || "Sheet doesn't exist.");
    }
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
            data-required-role="admin"
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
                  data-required-role="admin"
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
            id="view-client-details"
            data-required-capability="clients.edit" 
            class="dropdown-item view-client-details"
          >
            <i class="pe-7s-note2 me-2 text-info"></i>
            View Details
          </button>
        </div>
      </div>
    `);
  }

  /* ---------------------------------------------------------
   * AUTO REFRESH — LOCKED & SELF-RECOVERING
   * --------------------------------------------------------- */

  function startRefresh(dataTable) {
    stopRefresh();

    if (!dataTable) {
      return;
    }

    const generation = refreshGeneration;

    function scheduleNextRefresh(success) {
      // Ignore callbacks belonging to a stopped/restarted cycle.
      if (generation !== refreshGeneration) {
        return;
      }

      clearTimeout(refreshTimer);

      refreshTimer = setTimeout(
        refresh,
        success ? REFRESH_INTERVAL : ERROR_REFRESH_INTERVAL,
      );
    }

    function refresh() {
      if (generation !== refreshGeneration) {
        return;
      }

      refreshTimer = null;

      loadActivity(
        dataTable,
        (success) => scheduleNextRefresh(success),
        false,
        generation,
      );
    }

    refresh();
  }

  function stopRefresh() {
    // Invalidate callbacks from the previous refresh cycle.
    refreshGeneration++;

    if (refreshTimer !== null) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }

    /*
     * Do not release an active request's lock here.
     * Its callback or watchdog must release the lock.
     */
  }
  
  function acquireRefreshLock(callback, requestGeneration) {
    if (activeRequestId !== null) {
      return null;
    }

    const requestId = ++nextRequestId;

    activeRequestId = requestId;

    clearTimeout(refreshLockTimer);

    refreshLockTimer = setTimeout(() => {
      if (activeRequestId !== requestId) {
        return;
      }

      console.warn(
        "[ActivityToday] Refresh lock timed out after 45 seconds.",
      );

      releaseRefreshLock(requestId);

      if (requestGeneration === refreshGeneration) {
        callback?.(false);
      }
    }, REFRESH_LOCK_TIMEOUT);

    return requestId;
  }

  function releaseRefreshLock(requestId) {
    // An old request must never release a newer request's lock.
    if (activeRequestId !== requestId) {
      return false;
    }

    clearTimeout(refreshLockTimer);
    refreshLockTimer = null;

    activeRequestId = null;

    return true;
  }

  async function loadActivity(
    dataTable,
    callback,
    force = false,
    requestGeneration = refreshGeneration,
  ) {
    if (!dataTable) {
      callback?.(false);
      return;
    }

    /*
     * `force` intentionally does not bypass the lock.
     * Manual refreshes must follow the same concurrency rules.
     */
    const requestId = acquireRefreshLock(
      callback,
      requestGeneration,
    );

    if (requestId === null) {
      callback?.(false);
      return;
    }

    try {
      const [sessionId, signature] = await getAuthArgs();

      // The request may have timed out while authentication was pending.
      if (activeRequestId !== requestId) {
        return;
      }

      AppUtils.gScriptRun({
        gscriptFunc: "getDailyActivityData",
        args: [sessionId, signature],

        onSuccess: (data) => {
          if (!releaseRefreshLock(requestId)) {
            return;
          }

          // Do not update a page belonging to an old refresh cycle.
          if (requestGeneration !== refreshGeneration) {
            return;
          }

          try {
            updateActivityTable(data, dataTable);

            updateFilterCounts(dataTable);
            HourSummary.loadTodayChargedHours();

            callback?.(true);
          } catch (error) {
            console.error("[ActivityToday] Failed to process refresh:", error);

            AppUtils.showError(
              error?.message || "Unable to update today's activities.",
            );

            callback?.(false);
          }
        },

        onError: (error) => {
          if (!releaseRefreshLock(requestId)) {
            return;
          }

          if (requestGeneration !== refreshGeneration) {
            return;
          }

          console.error("[ActivityToday] Refresh failed:", error);

          AppUtils.showError(error);

          callback?.(false);
        },
      });
    } catch (error) {
      if (!releaseRefreshLock(requestId)) {
        return;
      }

      if (requestGeneration !== refreshGeneration) {
        return;
      }

      if (!handleInvalidSessionError(error)) {
        console.error("[ActivityToday] Unable to authenticate refresh:", error);

        AppUtils.showError(
          error?.message || "Unable to refresh activities today.",
        );
      }

      // Includes invalid-session failures: do not retry every 10 seconds.
      callback?.(false);
    }
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
    resetableCacheKeyForUpdatingHours,

    setupFilters,
    setupTaskForm,
    setupSheetViewButton,
    buildActionButtons,
    startRefresh,
    stopRefresh,
    updateActivityTable,
    handleTaskSaveSuccess,
    clearClientCaches,
    resetYearlyChartCaches,
    refreshActivityTable,
  };
})();

export { ActivityToday };
