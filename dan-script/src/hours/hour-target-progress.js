import { ChartModule } from "../charts";
import { AppUtils } from "../utils";

const HourTargetProgress = (() => {
  const TARGET_CONFIG = [
    {
      id: "monthly-target",
      valueKey: "monthlyProgress",
      actualKey: "currentMonthHours",
      targetKey: "monthlyTarget",
      suffix: " hrs",
    },
    {
      id: "daily-target",
      valueKey: "dailyProgress",
      actualKey: "currentMonthHours",
      targetKey: "dailyElapsedTarget",
      suffix: " hrs",
    },
    {
      id: "ytd-target",
      valueKey: "ytdProgress",
      actualKey: "ytdHours",
      targetKey: "ytdTarget",
      suffix: " hrs",
    },
    {
      id: "annual-target",
      valueKey: "annualProgress",
      actualKey: "ytdHours",
      targetKey: "annualTarget",
      suffix: " hrs",
    },
    {
      id: "projected-target",
      valueKey: "projectedProgress",
      actualKey: "projectedAnnualHours",
      targetKey: "annualTarget",
      suffix: " hrs",
    },
  ];

  function loadTargetProgress(
    cacheKey = "targetProgress",
    functionName = "getCurrentTargetProgress",
    debug = false,
    reset = false,
  ) {
    AppUtils.cachedGScriptCall(
      cacheKey,
      functionName,
      [],
      (data) => {
        if (!data || typeof data !== "object") {
          AppUtils.showError("⚠️ Invalid target data.");
          return;
        }

        if (debug) {
          console.log("[HourTargetProgress] data:", data);
        }

        renderTargetProgress(data);
      },
      debug,
      reset,
    );
  }

  function renderTargetProgress(data) {
    TARGET_CONFIG.forEach((config) => {
      updateTargetBox(config, data);
    });

    updateCurrentMonthHours(data);
  }

  function updateTargetBox(config, data) {
    const box = document.getElementById(config.id);

    if (!box) {
      return;
    }

    const value = data[config.valueKey];
    const actual = data[config.actualKey];
    const target = data[config.targetKey];

    const number = box.querySelector(".widget-numbers");

    const actualElement = box.querySelector(".target-actual");

    const goalElement = box.querySelector(".target-goal");

    const progressBar = box.querySelector(".progress-bar");

    /*
     * No current-month data.
     *
     * Don't display 0% because that would imply
     * the user actually recorded zero hours.
     */
    if (
      (config.id === "monthly-target" || config.id === "daily-target") &&
      data.currentMonthHours === null
    ) {
      if (number) {
        number.textContent = "—";
      }

      if (actualElement) {
        actualElement.textContent = "No current-month data";
      }

      if (goalElement) {
        goalElement.textContent = "";
      }

      if (progressBar) {
        progressBar.style.width = "0%";
        progressBar.setAttribute("aria-valuenow", "0");
        progressBar.classList.remove(
          "bg-success",
          "bg-info",
          "bg-warning",
          "bg-danger",
        );
      }

      return;
    }

    if (typeof value !== "number" || !Number.isFinite(value)) {
      return;
    }

    if (number) {
      number.textContent = `${value.toFixed(2)}%`;
    }

    if (actualElement && typeof actual === "number") {
      actualElement.textContent = `${actual.toFixed(2)} hrs`;
    }

    if (goalElement && typeof target === "number") {
      goalElement.textContent = `${target.toFixed(2)} hrs`;
    }

    if (!progressBar) {
      return;
    }

    const progress = Math.max(0, Math.min(100, value));

    progressBar.style.width = `${progress}%`;

    progressBar.setAttribute("aria-valuenow", String(progress));

    updateProgressColor(progressBar, value);
  }

  function updateCurrentMonthHours(data) {
    const element = document.getElementById("current-month-target-hours");

    const status = document.getElementById("current-month-target-status");

    if (!element) {
      return;
    }

    if (data.currentMonthHours === null) {
      element.textContent = "—";

      if (status) {
        status.textContent = "No current-month data";
      }

      return;
    }

    element.textContent = `${data.currentMonthHours.toFixed(2)} hrs`;

    if (status) {
      status.textContent = `${data.currentMonth}`;
    }
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

  function loadTargetChart(
    cacheKey = "targetChart",
    functionName = "getCurrentYearTargetChartData",
    debug = false,
    reset = false,
  ) {
    AppUtils.cachedGScriptCall(
      cacheKey,
      functionName,
      [],
      (data) => {
        if (!Array.isArray(data)) {
          AppUtils.showError("⚠️ Invalid target chart data.");
          return;
        }

        if (debug) {
          console.log("[HourTargetProgress] chart data:", data);
        }

        renderTargetChart(data);
      },
      debug,
      reset,
    );
  }

  function renderTargetChart(data) {
    const container = document.getElementById("chart-monthly-targets");

    if (!container) {
      console.warn(
        "[HourTargetProgress] Chart container not found:",
        "chart-monthly-targets",
      );
      return;
    }

    /*
     * No monthly data.
     */
    if (!data.length) {
      container.innerHTML = `
        <div class="text-center text-muted py-5">
          No monthly hours data available.
        </div>
      `;
      return;
    }

    /*
     * Remove loader.
     */
    container.innerHTML = "";

    const canvas = document.createElement("canvas");

    canvas.id = "monthly-target-hours-chart";

    container.appendChild(canvas);

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    /*
     * Destroy an existing chart if one exists.
     */
    const existing = Chart.getChart(canvas);

    if (existing) {
      existing.destroy();
    }

    ChartModule.drawMonthlyTargetChart(ctx, "monthly_target_hours", data);
  }

  return {
    loadTargetProgress,
    loadTargetChart,
  };
})();

export { HourTargetProgress };
