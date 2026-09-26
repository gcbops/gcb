import { AppUtils } from "../utils.js";

const performanceProductivityPage = (() => {
  let initialized = false;
  let eventsBound = false;
  let productivityData = null;

  const CACHE_KEY = "productivityOverview";

  function init() {
    if (initialized) {return;}

    initialized = true;

    bindEvents();
    loadProductivityData();
  }

  function destroy() {
    if (!initialized) {return;}

    initialized = false;
    productivityData = null;
  }

  function bindEvents() {
    if (eventsBound) {return;}

    eventsBound = true;

    document.addEventListener("input", handleInput);
  }

  function handleInput(event) {
    const target = event.target;

    if (
      target.id !== "productivity-rate-min" &&
      target.id !== "productivity-rate-max"
    ) {
      return;
    }

    renderValueReference();
  }

  function loadProductivityData(reset = false) {
    AppUtils.cachedGScriptCall(
      CACHE_KEY,
      "getProductivityOverview",
      [],
      (data) => {
        if (!data) {
          renderEmpty();
          return;
        }

        productivityData = data;

        renderOverview();
        renderValueReference();
      },
      false,
      reset,
    );
  }

  function renderOverview() {
    const data = productivityData || {};

    setMetric("target-year", data.targetYear ?? "—");

    setMetric("current-month", data.currentMonth || "—");

    setMetric("tasks-completed-year", formatCount(data.tasksCompletedThisYear));

    setMetric(
      "tasks-completed-month",
      formatCount(data.tasksCompletedThisMonth),
    );

    setMetric("ytd-tasks", formatCount(data.tasksCompletedThisYear));

    setMetric("current-month-tasks", formatCount(data.tasksCompletedThisMonth));

    setMetric("ytd-hours", formatHours(data.ytdHours));

    setMetric("current-month-hours", formatHours(data.currentMonthHours));

    const ytdHours = toNumber(data.ytdHours);
    const ytdTasks = toNumber(data.tasksCompletedThisYear);

    const hoursPerTask =
      ytdHours !== null && ytdTasks !== null && ytdTasks > 0
        ? ytdHours / ytdTasks
        : null;

    const tasksPerHour =
      hoursPerTask !== null && hoursPerTask > 0 ? 1 / hoursPerTask : null;

    setMetric(
      "hours-per-task",
      hoursPerTask !== null ? hoursPerTask.toFixed(2) : "—",
    );

    setMetric(
      "hours-per-task-rate",
      tasksPerHour !== null ? tasksPerHour.toFixed(2) : "—",
    );
  }

  function renderValueReference() {
    if (!productivityData) {
      return;
    }

    const minRate = getRate("productivity-rate-min");
    const maxRate = getRate("productivity-rate-max");

    if (minRate === null || maxRate === null) {
      clearValueReference();
      return;
    }

    const lowerRate = Math.min(minRate, maxRate);
    const upperRate = Math.max(minRate, maxRate);

    setMetric(
      "rate-range",
      formatCurrency(lowerRate) + " – " + formatCurrency(upperRate),
    );

    renderValueRange(
      "current-month",
      productivityData.currentMonthHours,
      lowerRate,
      upperRate,
    );

    renderValueRange("ytd", productivityData.ytdHours, lowerRate, upperRate);

    renderValueRange(
      "projected",
      productivityData.projectedAnnualHours,
      lowerRate,
      upperRate,
    );
  }

  function renderValueRange(prefix, hours, minRate, maxRate) {
    const numericHours = toNumber(hours);

    if (numericHours === null) {
      setMetric(prefix + "-value-hours", "—");

      setMetric(prefix + "-value-min", "$—");

      setMetric(prefix + "-value-max", "$—");

      return;
    }

    setMetric(prefix + "-value-hours", formatHours(numericHours));

    setMetric(prefix + "-value-min", formatCurrency(numericHours * minRate));

    setMetric(prefix + "-value-max", formatCurrency(numericHours * maxRate));
  }

  function clearValueReference() {
    ["current-month", "ytd", "projected"].forEach((prefix) => {
      setMetric(prefix + "-value-hours", "—");

      setMetric(prefix + "-value-min", "$—");

      setMetric(prefix + "-value-max", "$—");
    });

    setMetric("rate-range", "$—");
  }

  function renderEmpty() {
    [
      "target-year",
      "current-month",
      "tasks-completed-year",
      "tasks-completed-month",
      "ytd-tasks",
      "current-month-tasks",
      "ytd-hours",
      "current-month-hours",
      "hours-per-task",
      "hours-per-task-rate",
    ].forEach((metric) => {
      setMetric(metric, "—");
    });

    clearValueReference();
  }

  function getRate(id) {
    const element = document.getElementById(id);

    if (!element) {
      return null;
    }

    const value = Number(element.value);

    if (!Number.isFinite(value) || value < 0) {
      return null;
    }

    return value;
  }

  function formatHours(value) {
    const number = toNumber(value);

    if (number === null) {
      return "—";
    }

    return AppUtils.formatHours(number);
  }

  function formatCount(value) {
    const number = toNumber(value);

    if (number === null) {
      return "—";
    }

    return number.toLocaleString();
  }

  function formatCurrency(value) {
    const number = toNumber(value);

    if (number === null) {
      return "$—";
    }

    return (
      "$" +
      number.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  }

  function setMetric(name, value) {
    const element = document.querySelector(`[data-metric="${name}"]`);

    if (!element) {
      return;
    }

    element.textContent = value;
  }

  function toNumber(value) {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    const number = Number(value);

    return Number.isFinite(number) ? number : null;
  }

  return {
    init,
    destroy,
  };
})();

export { performanceProductivityPage };
