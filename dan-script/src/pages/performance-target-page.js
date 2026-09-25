import { HourTargetProgress } from "../hours/hour-target-progress.js";
import { AppUtils } from "../utils.js";

const performanceTargetPage = (() => {
  let initialized = false;
  let eventsBound = false;
  let targetData = null;

  const TARGET_MODAL_ID = "#app-modal";

  function init() {
    if (initialized) {
      return;
    }

    initialized = true;

    bindEvents();
    loadTargetProgress();
    loadTargetChart();
  }

  function destroy() {
    if (!initialized) {
      return;
    }

    initialized = false;
    eventsBound = false;
    targetData = null;

    document.removeEventListener("input", handleInput);
    document.removeEventListener("click", handleClick);
  }

  // --------------------------------------------------
  // DATA
  // --------------------------------------------------

  function loadTargetProgress(reset = false) {
    AppUtils.cachedGScriptCall(
      "targetProgress",
      "getCurrentTargetProgress",
      [],
      (data) => {
        if (!data || typeof data !== "object") {
          AppUtils.showError("Unable to load target data.");
          return;
        }

        targetData = data;

        renderTargetSummary(data);
        renderTargetGuidance(data);
        initializePlanner(data);
      },
      false,
      reset,
    );
  }

  function loadTargetChart() {
    HourTargetProgress.loadTargetChart(
      "targetChart",
      "getCurrentYearTargetChartData",
    );
  }

  // --------------------------------------------------
  // EVENTS
  // --------------------------------------------------

  function bindEvents() {
    if (eventsBound) {
      return;
    }

    eventsBound = true;

    document.addEventListener("input", handleInput);

    document.addEventListener("click", handleClick);
  }

  function handleInput(event) {
    if (
      event.target?.id !== "target-planner-daily-pace" &&
      event.target?.id !== "target-planner-working-days"
    ) {
      return;
    }

    if (!targetData) {
      return;
    }

    updatePlanner(targetData);
  }

  function handleClick(event) {
    const dailyButton = event.target.closest("#edit-daily-target");

    if (dailyButton) {
      openTargetEditor("daily");
      return;
    }

    const monthlyButton = event.target.closest("#edit-monthly-target");

    if (monthlyButton) {
      openTargetEditor("monthly");
    }
  }

  function openTargetEditor(type) {
    if (!targetData) {
      return;
    }

    const isDaily = type === "daily";
    const label = isDaily ? "Daily Target" : "Monthly Target";
    const inputId = isDaily
      ? "performance-daily-target"
      : "performance-monthly-target";
    const unit = isDaily ? "hrs/day" : "hrs";

    const currentValue = isDaily
      ? Number(targetData.dailyTarget)
      : Number(targetData.monthlyTarget);

    const currentValueText = Number.isFinite(currentValue) ? currentValue : "";

    const header =
      "<div>" +
      '<h5 class="modal-title font-weight-bold mb-0">' +
      "Edit " +
      label +
      "</h5>" +
      '<div class="font-size-xs text-muted mt-1">' +
      "Update the " +
      label.toLowerCase() +
      " used by performance calculations." +
      "</div>" +
      "</div>";

    const body =
      '<form id="performance-target-form">' +
      '<div class="form-group mb-0 text-left">' +
      "<label " +
      'for="' +
      inputId +
      '" ' +
      'class="form-label font-weight-bold">' +
      label +
      "</label>" +
      '<div class="input-group">' +
      "<input " +
      'type="number" ' +
      'id="' +
      inputId +
      '" ' +
      'class="form-control my-0" ' +
      'min="0" ' +
      'step="0.5" ' +
      'value="' +
      currentValueText +
      '" ' +
      "required>" +
      '<span class="input-group-text">' +
      unit +
      "</span>" +
      "</div>" +
      "</div>" +
      "</form>";

    const footer =
      "<button " +
      'type="button" ' +
      'class="btn btn-light btn-cancel-target">' +
      "Cancel" +
      "</button>" +
      "<button " +
      'type="button" ' +
      'class="btn btn-primary btn-save-target">' +
      "Save Changes" +
      "</button>";

    AppUtils.openModal(TARGET_MODAL_ID, {
      size: "md",
      placement: "center",

      header: header,
      body: body,
      footer: footer,

      onOpen($modal) {
        const namespace = ".performanceTargetModal";

        $modal
          .off(namespace)
          .on("click" + namespace, ".btn-cancel-target", () => {
            AppUtils.closeModal(TARGET_MODAL_ID);
          })
          .on("click" + namespace, ".btn-save-target", () => {
            confirmTargetUpdate($modal, type);
          });
      },

      onClose($modal) {
        $modal.off(".performanceTargetModal");
      },
    });
  }

  function confirmTargetUpdate($modal, type) {
    const isDaily = type === "daily";

    const inputId = isDaily
      ? "#performance-daily-target"
      : "#performance-monthly-target";

    const label = isDaily ? "Daily Target" : "Monthly Target";

    const unit = isDaily ? "hrs/day" : "hrs";

    const newValue = Number($modal.find(inputId).val());

    const currentValue = isDaily
      ? Number(targetData?.dailyTarget)
      : Number(targetData?.monthlyTarget);

    if (!Number.isFinite(newValue) || newValue <= 0) {
      AppUtils.showError(`${label} must be greater than 0.`);
      return;
    }

    if (newValue === currentValue) {
      AppUtils.showError(`No ${label.toLowerCase()} changes were made.`);
      return;
    }

    AppUtils.openConfirmationModal({
      ns: ".performanceTargetConfirm",

      title: `Update ${label}`,

      message: `
      <p class="mb-3">
        Are you sure you want to update this target?
      </p>

      <div class="text-left font-size-sm">
        <div class="d-flex justify-content-between">
          <span class="text-muted">
            ${label}
          </span>

          <strong>
            ${formatHours(newValue)} ${unit}
          </strong>
        </div>
      </div>
    `,

      onProceed: ($confirmModal, $proceedButton) => {
        savePerformanceTarget(type, newValue, $proceedButton);
      },

      onBack: () => {},
    });
  }

  function savePerformanceTarget(type, value, proceedButton) {
    const loading = proceedButton
      ? AppUtils.setButtonLoading(proceedButton, "Saving")
      : null;

    google.script.run
      .withSuccessHandler((result) => {
        if (!result?.success) {
          loading?.restore();

          AppUtils.showError("Unable to update performance target.");

          return;
        }

        loading?.setSuccess("Saved");

        AppUtils.showDashboardToast(
          `${type === "daily" ? "Daily" : "Monthly"} target updated successfully.`,
        );

        setTimeout(() => {
          AppUtils.closeModal(TARGET_MODAL_ID);
          refreshTargetData();
        }, 1000);
      })
      .withFailureHandler((error) => {
        loading?.restore();

        AppUtils.showError(
          error?.message || "Unable to update performance target.",
        );
      })
      .updatePerformanceTarget(type, value);
  }

  function refreshTargetData() {
    loadTargetProgress(true);

    HourTargetProgress.loadTargetChart(
      "targetChart",
      "getCurrentYearTargetChartData",
      false,
      true,
    );
  }

  // --------------------------------------------------
  // EXISTING SUMMARY
  // --------------------------------------------------

  function renderTargetSummary(data) {
    setMetric("current-month-hours", formatHours(data.currentMonthHours));

    setMetric("current-month", data.currentMonth || "—");

    setMetric("monthly-target", formatHours(data.monthlyTarget));

    setMetric("monthly-progress", formatPercent(data.monthlyProgress));

    setMetric("monthly-target-actual", formatHours(data.currentMonthHours));

    setMetric("monthly-target-goal", formatHours(data.monthlyTarget));

    setMetric("daily-target", formatHours(data.dailyTarget));

    setMetric("daily-progress", formatPercent(data.dailyProgress));

    setMetric("ytd-hours", formatHours(data.ytdHours));

    setMetric("ytd-progress", formatPercent(data.ytdProgress));

    setMetric("ytd-target", formatHours(data.ytdTarget));

    setMetric("annual-target", formatHours(data.annualTarget));

    setMetric("annual-progress", formatPercent(data.annualProgress));

    setMetric("projected-hours", formatHours(data.projectedAnnualHours));

    setMetric("projected-progress", formatPercent(data.projectedProgress));

    setMetric("working-days", formatNumber(data.workingDays));

    setMetric("daily-target-efficiency", formatHours(data.dailyTarget));

    setMetric("monthly-target-efficiency", formatHours(data.monthlyTarget));

    setMetric("target-year", data.currentYear || "—");

    updateProgressBar("target-monthly-progress-bar", data.monthlyProgress);

    updateProgressBar("target-ytd-progress-bar", data.ytdProgress);
  }

  // --------------------------------------------------
  // TARGET GUIDANCE
  // --------------------------------------------------

  function renderTargetGuidance(data) {
    const currentHours = toNumber(data.currentMonthHours);
    const monthlyTarget = toNumber(data.monthlyTarget);
    const workingDays = toNumber(data.workingDays);

    if (currentHours === null || monthlyTarget === null) {
      setMetric("guidance-status", "No data");
      setMetric("guidance-message", "Monthly target data unavailable.");
      setMetric("guidance-detail", "Check the current target configuration.");

      return;
    }

    const remainingHours = Math.max(0, monthlyTarget - currentHours);

    const progress = monthlyTarget > 0 ? currentHours / monthlyTarget : 0;

    setMetric("guidance-current-hours", formatHours(currentHours));

    setMetric("guidance-monthly-target", formatHours(monthlyTarget));

    setMetric("guidance-remaining-hours", formatHours(remainingHours));

    updateProgressBar("target-guidance-progress-bar", progress);

    if (workingDays === null || workingDays <= 0) {
      setMetric("guidance-required-daily", "—");

      setGuidanceStatus("No schedule", "bg-secondary");

      setMetric(
        "guidance-message",
        "No remaining working-day schedule is available.",
      );

      setMetric("guidance-detail", "Target pace cannot be calculated yet.");

      return;
    }

    const expectedHours =
      toNumber(data.dailyTarget) !== null
        ? data.dailyTarget * workingDays
        : null;

    const requiredDaily = remainingHours > 0 ? remainingHours / workingDays : 0;

    setMetric("guidance-required-daily", formatHours(requiredDaily));

    const currentPace =
      expectedHours !== null ? currentHours / expectedHours : progress;

    if (remainingHours <= 0) {
      setGuidanceStatus("Target reached", "bg-success");

      setMetric("guidance-message", "Your monthly target has been reached.");

      setMetric(
        "guidance-detail",
        `${formatHours(currentHours)} hrs tracked against a ${formatHours(monthlyTarget)} hr target.`,
      );

      return;
    }

    if (currentPace >= 1) {
      setGuidanceStatus("On pace", "bg-success");

      setMetric(
        "guidance-message",
        "Your current pace is aligned with the expected schedule.",
      );

      setMetric(
        "guidance-detail",
        `${formatHours(remainingHours)} hrs remain, requiring about ${formatHours(requiredDaily)} hrs/day.`,
      );

      return;
    }

    setGuidanceStatus("Needs attention", "bg-warning");

    setMetric(
      "guidance-message",
      "Your current progress is below the expected working pace.",
    );

    setMetric(
      "guidance-detail",
      `${formatHours(remainingHours)} hrs remain. The required pace is about ${formatHours(requiredDaily)} hrs/day.`,
    );
  }

  // --------------------------------------------------
  // WHAT-IF PLANNER
  // --------------------------------------------------

  function initializePlanner(data) {
    const paceInput = document.getElementById("target-planner-daily-pace");

    const daysInput = document.getElementById("target-planner-working-days");

    if (!paceInput || !daysInput) {
      return;
    }

    paceInput.value = Number.isFinite(Number(data.dailyTarget))
      ? Number(data.dailyTarget)
      : 0;

    const currentMonthHours = toNumber(data.currentMonthHours);

    const monthlyTarget = toNumber(data.monthlyTarget);

    const dailyTarget = toNumber(data.dailyTarget);

    const workingDays = toNumber(data.workingDays);

    const remainingHours =
      currentMonthHours !== null && monthlyTarget !== null
        ? Math.max(0, monthlyTarget - currentMonthHours)
        : 0;

    const defaultRemainingDays =
      dailyTarget !== null && dailyTarget > 0
        ? Math.ceil(remainingHours / dailyTarget)
        : 0;

    daysInput.value = Math.max(
      0,
      Math.min(
        workingDays || defaultRemainingDays,
        defaultRemainingDays || workingDays || 0,
      ),
    );

    if (Number(daysInput.value) === 0) {
      daysInput.value = defaultRemainingDays || 0;
    }

    updatePlanner(data);
  }

  function updatePlanner(data) {
    const paceInput = document.getElementById("target-planner-daily-pace");

    const daysInput = document.getElementById("target-planner-working-days");

    if (!paceInput || !daysInput) {
      return;
    }

    const pace = Number(paceInput.value);
    const remainingDays = Number(daysInput.value);

    const currentHours = toNumber(data.currentMonthHours);

    const monthlyTarget = toNumber(data.monthlyTarget);

    if (
      !Number.isFinite(pace) ||
      !Number.isFinite(remainingDays) ||
      currentHours === null ||
      monthlyTarget === null
    ) {
      setMetric("planner-projected-hours", "—");

      setMetric("planner-target", formatHours(monthlyTarget));

      setMetric("planner-difference", "—");

      setMetric("planner-status", "—");

      return;
    }

    const projectedHours =
      currentHours + Math.max(0, pace) * Math.max(0, remainingDays);

    const difference = projectedHours - monthlyTarget;

    setMetric("planner-projected-hours", formatHours(projectedHours));

    setMetric("planner-target", formatHours(monthlyTarget));

    const differenceText =
      difference >= 0
        ? `+${formatHours(difference)} hrs`
        : `${formatHours(difference)} hrs`;

    const differenceElement = document.querySelector(
      '[data-metric="planner-difference"]',
    );

    if (differenceElement) {
      differenceElement.textContent = differenceText;

      differenceElement.classList.remove(
        "text-success",
        "text-danger",
        "text-warning",
      );

      differenceElement.classList.add(
        difference >= 0 ? "text-success" : "text-danger",
      );
    }

    setMetric(
      "planner-status",
      difference >= 0 ? "Monthly target reached" : "Below monthly target",
    );
  }

  // --------------------------------------------------
  // HELPERS
  // --------------------------------------------------

  function setGuidanceStatus(text, className) {
    const element = document.querySelector('[data-metric="guidance-status"]');

    if (!element) {
      return;
    }

    element.textContent = text;

    element.classList.remove(
      "bg-success",
      "bg-warning",
      "bg-secondary",
      "bg-danger",
      "bg-info",
    );

    element.classList.add(className);
  }

  function setMetric(name, value) {
    const element = document.querySelector(`[data-metric="${name}"]`);

    if (element) {
      element.textContent = value;
    }
  }

  function toNumber(value) {
    const number = Number(value);

    return Number.isFinite(number) ? number : null;
  }

  function formatHours(value) {
    const number = toNumber(value);

    if (number === null) {
      return "—";
    }

    return number.toLocaleString(undefined, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  }

  function formatPercent(value) {
    const number = toNumber(value);

    if (number === null) {
      return "—";
    }

    return `${(number * 100).toFixed(2)}%`;
  }

  function formatNumber(value) {
    const number = toNumber(value);

    if (number === null) {
      return "—";
    }

    return number.toLocaleString();
  }

  function updateProgressBar(id, value) {
    const progressBar = document.getElementById(id);

    if (!progressBar) {
      return;
    }

    const number = toNumber(value);

    if (number === null) {
      progressBar.style.width = "0%";
      progressBar.setAttribute("aria-valuenow", "0");
      return;
    }

    const progress = Math.max(0, Math.min(1, number));

    const progressPercent = progress * 100;

    progressBar.style.width = `${progressPercent}%`;

    progressBar.setAttribute("aria-valuenow", String(progressPercent));

    updateProgressColor(progressBar, progressPercent);
  }

  function updateProgressColor(progressBar, value) {
    progressBar.classList.remove(
      "bg-success",
      "bg-info",
      "bg-warning",
      "bg-danger",
    );

    if (value >= 100) {
      progressBar.classList.add("bg-success");
    } else if (value >= 75) {
      progressBar.classList.add("bg-info");
    } else if (value >= 50) {
      progressBar.classList.add("bg-warning");
    } else {
      progressBar.classList.add("bg-danger");
    }
  }

  return {
    init,
    destroy,
  };
})();

export { performanceTargetPage };
