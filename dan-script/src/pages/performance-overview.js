import { DataTableModule } from "../tables/data-table";
import { ChartModule } from "../charts";
import { AppUtils } from "../utils";

const performanceOverviewPage = (() => {
  let initialized = false;
  let eventsBound = false;

  const TABLE_ID = "#performance-yearly-table";
  const TABLE_TITLE = "Yearly Performance";
  const CACHE_KEY = "performanceOverview";

  function init() {
    if (initialized) {
      return;
    }

    initialized = true;

    bindEvents();
    loadPerformanceOverview();
    loadMonthlyPerformanceChart();
  }

  function destroy() {
    if (!initialized) {
      return;
    }

    initialized = false;

    DataTableModule.destroy(TABLE_ID);
  }

  function bindEvents() {
    if (eventsBound) {
      return;
    }

    eventsBound = true;
  }

  function loadPerformanceOverview(log = false, refresh = false) {
    DataTableModule.showLoader(TABLE_ID);

    AppUtils.cachedGScriptCall(
      CACHE_KEY,
      "getPerformanceOverview",
      [],
      (data) => {
        if (
          !data ||
          typeof data !== "object" ||
          !Array.isArray(data.yearlyData)
        ) {
          DataTableModule.showError(
            TABLE_ID,
            "Unable to load performance data.",
          );
          return;
        }

        renderPerformanceOverview(data, log, refresh);
      },
      log,
      refresh,
    );
  }

  function loadMonthlyPerformanceChart(log = false, refresh = false) {
    AppUtils.cachedGScriptCall(
      "performanceMonthlyChart",
      "getCurrentYearTargetChartData",
      [],
      (data) => {
        if (!Array.isArray(data)) {
          renderMonthlyPerformanceChart([]);
          return;
        }

        if (log) {
          console.log("[PerformanceOverview] Monthly chart data:", data);
        }

        renderMonthlyPerformanceChart(data);
      },
      log,
      refresh,
    );
  }

  function renderMonthlyPerformanceChart(data) {
    const container = document.getElementById("performance-monthly-chart");

    if (!container) {
      return;
    }

    if (!data.length) {
      container.innerHTML = `
      <div class="text-center text-muted py-5">
        No monthly hours data available.
      </div>
    `;

      return;
    }

    container.innerHTML = "";

    const canvas = document.createElement("canvas");

    canvas.id = "performance-monthly-hours-chart";

    container.appendChild(canvas);

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    const existing = Chart.getChart(canvas);

    if (existing) {
      existing.destroy();
    }

    ChartModule.drawMonthlyTargetChart(ctx, "performance_monthly_hours", data);
  }

  function renderPerformanceOverview(data, log = false, refresh = false) {
    renderSummary(data);
    renderCurrentPerformance(data);
    renderYearlyPerformance(data.yearlyData);

    if (log) {
      console.log(
        "[PerformanceOverview] Rendered",
        data.yearlyData.length,
        "yearly records",
      );
    }

    if (refresh) {
      AppUtils.showDashboardToast(
        "Performance overview refreshed successfully.",
        "success",
      );
    }
  }

  function renderSummary(data) {
    const target = data?.target || {};

    const ytdHours = toNumber(target.ytdHours);
    const currentMonthHours = toNumber(target.currentMonthHours);
    const ytdTarget = toNumber(target.ytdTarget);
    const annualTarget = toNumber(target.annualTarget);
    const projectedAnnualHours = toNumber(target.projectedAnnualHours);

    const monthsElapsed = new Date().getMonth() + 1;

    const monthlyAverage =
      ytdHours !== null && monthsElapsed > 0 ? ytdHours / monthsElapsed : null;

    /*
     * YTD Hours
     */
    setMetric("ytd-hours", AppUtils.formatHours(ytdHours));

    setMetric("current-month-label", target.currentMonth || "—");

    setMetric("current-month-hours", AppUtils.formatHours(currentMonthHours));

    /*
     * YTD Target
     */
    setMetric("ytd-target", AppUtils.formatHours(ytdTarget));

    setMetric("ytd-progress", AppUtils.formatPercent(target.ytdProgress));

    /*
     * Tasks Completed
     */
    setMetric("tasks-completed", formatCount(target.tasksCompletedThisYear));

    setMetric(
      "tasks-completed-month",
      formatCount(target.tasksCompletedThisMonth),
    );

    /*
     * Monthly Average
     */
    setMetric("monthly-average", formatHoursPerMonth(monthlyAverage));

    setMetric("ytd-hours-secondary", AppUtils.formatHours(ytdHours));

    /*
     * Annual Target
     */
    setMetric("annual-target", AppUtils.formatHours(annualTarget));

    setMetric("annual-progress", AppUtils.formatPercent(target.annualProgress));

    /*
     * Projected Annual
     */
    setMetric(
      "projected-annual-hours",
      AppUtils.formatHours(projectedAnnualHours),
    );

    setMetric(
      "projected-annual-progress",
      AppUtils.formatPercent(target.projectedAnnualProgress),
    );
  }

  function renderCurrentPerformance(data) {
    const target = data?.target || {};

    const ytdHours = toNumber(target.ytdHours);
    const ytdTarget = toNumber(target.ytdTarget);

    const tasksCompleted = toNumber(target.tasksCompletedThisYear);

    const hoursPerTask =
      tasksCompleted > 0 && ytdHours !== null
        ? ytdHours / tasksCompleted
        : null;

    setMetric(
      "ytd-progress-detail",
      AppUtils.formatPercent(target.ytdProgress),
    );

    setMetric("ytd-hours-detail", AppUtils.formatHours(ytdHours));

    setMetric("ytd-target-detail", AppUtils.formatHours(ytdTarget));

    setMetric("tasks-completed-detail", formatCount(tasksCompleted));

    setMetric("hours-per-task", formatHoursPerTask(hoursPerTask));

    const progressBar = document.getElementById("performance-ytd-progress-bar");

    if (progressBar) {
      const progress = Math.max(
        0,
        Math.min(1, Number(target.ytdProgress) || 0),
      );

      const progressPercent = progress * 100;

      progressBar.style.width = `${progressPercent}%`;

      progressBar.setAttribute("aria-valuenow", String(progressPercent));
    }
  }

  function renderYearlyPerformance(data) {
    if (!Array.isArray(data) || !data.length) {
      DataTableModule.showEmpty(TABLE_ID, "No yearly performance data found.");
      return;
    }

    DataTableModule.renderRows(TABLE_ID, data, createYearlyPerformanceRow);

    DataTableModule.init(TABLE_TITLE, TABLE_ID, false);
  }

  function createYearlyPerformanceRow(row) {
    const tr = document.createElement("tr");

    tr.innerHTML = `
    <td>${AppUtils.escapeHtml(row?.[0] ?? "")}</td>
    <td class="text-center">
      ${AppUtils.formatHours(row?.[1] ?? 0)}
    </td>
    <td class="text-center">
      ${AppUtils.formatHours(row?.[2] ?? 0)}
    </td>
    <td class="text-center">
      ${AppUtils.formatHours(row?.[3] ?? 0)}
    </td>
    <td class="text-center">
      ${AppUtils.formatHours(row?.[4] ?? 0)}
    </td>
    <td class="text-center">
      ${AppUtils.formatPercent(row?.[6] ?? 0)}
    </td>
    <td class="text-center">
      ${AppUtils.formatPercent(row?.[7] ?? 0)}
    </td>
    <td class="text-center">
      ${AppUtils.formatPercent(row?.[9] ?? 0)}
    </td>
    <td class="text-center">
      ${AppUtils.formatHours(row?.[13] ?? 0)}
    </td>
  `;

    return tr;
  }

  function setMetric(name, value) {
    document
      .querySelectorAll(`[data-performance="${name}"]`)
      .forEach((element) => {
        element.textContent = value;
      });
  }

  function toNumber(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    const number = Number(value);

    return Number.isFinite(number) ? number : null;
  }

  function formatCount(value) {
    const number = toNumber(value);

    return number === null ? "—" : number.toLocaleString();
  }

  function formatHoursPerMonth(value) {
    const number = toNumber(value);

    return number === null ? "—" : `${number.toFixed(2)} hrs/mo`;
  }

  function formatHoursPerTask(value) {
    const number = toNumber(value);

    return number === null ? "—" : `${number.toFixed(2)} hrs`;
  }

  return {
    init,
    destroy,
    loadPerformanceOverview,
  };
})();

export { performanceOverviewPage };
