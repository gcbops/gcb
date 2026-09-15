import { ChartModule } from "../charts.js";
import { AppUtils } from "../utils.js";

const growthComparisonOverviewPage = (() => {
  const CACHE_KEY = "growthComparison";

  function init() {
    loadGrowthComparison("#growth-comparison");

    initMonthlyHoursChart();

    ChartModule.loadChart("yearly");
  }

  function destroy() {
    $(document).off(".monthlyHoursByYear");

    const $year = $("#monthlyHoursYearFilter");

    if ($year.hasClass("select2-hidden-accessible")) {
      $year.select2("destroy");
    }

    hideMonthlyHoursChartLoading();

    ChartModule.destroyChart?.("monthly_hours_by_year");
  }

  function initMonthlyHoursFilters() {
    const currentYear = new Date().getFullYear();

    const $year = $("#monthlyHoursYearFilter");

    $year.empty();

    for (let year = 2024; year <= currentYear; year++) {
      $year.append(`<option value="${year}">${year}</option>`);
    }

    // Default: previous year + current year
    $year.val([currentYear - 1, currentYear]);

    AppUtils.initSelect2($year, {
      closeOnSelect: false,
      placeholder: "Select years",
    });
  }

  function bindMonthlyHoursFilters() {
    $(document)
      .off("click.monthlyHoursByYear", "#monthlyHoursFilterSubmit")
      .on("click.monthlyHoursByYear", "#monthlyHoursFilterSubmit", function () {
        loadMonthlyHoursChart();
      });
  }

  function loadMonthlyHoursChart(showLoading = true) {
    const selectedYears = $("#monthlyHoursYearFilter")
      .val()
      ?.map(Number)
      .filter(Boolean);

    if (!selectedYears?.length) {
      return;
    }

    if (showLoading) {
      showMonthlyHoursChartLoading();
    }

    ChartModule.loadChart(
      "monthly_hours_by_year",
      false,
      selectedYears,
      false,
      false,
      {},
      undefined,
      hideMonthlyHoursChartLoading,
    );
  }

  function initMonthlyHoursChart() {
    initMonthlyHoursFilters();

    bindMonthlyHoursFilters();

    loadMonthlyHoursChart(false);
  }

  function showMonthlyHoursChartLoading() {
    $("#chart-monthly_hours_by_year-loading").removeClass("d-none");

    $("#monthlyHoursYearFilter, #monthlyHoursFilterSubmit").prop(
      "disabled",
      true,
    );

    ChartModule.animateChart("monthly_hours_by_year", true, 1800);
  }

  function hideMonthlyHoursChartLoading() {
    ChartModule.animateChart("monthly_hours_by_year", false);

    $("#monthlyHoursYearFilter, #monthlyHoursFilterSubmit").prop(
      "disabled",
      false,
    );

    $("#chart-monthly_hours_by_year-loading").addClass("d-none");
  }

  function loadGrowthComparison(
    containerSelector,
    currentYear = new Date().getFullYear(),
    comparisonYear = new Date().getFullYear() - 1,
    refresh = false,
    log = false,
  ) {
    const cacheKey = `${CACHE_KEY}_${currentYear}_${comparisonYear}`;

    if (log) {
      console.log(
        "[GrowthComparison] Loading:",
        currentYear,
        "vs",
        comparisonYear,
      );
    }

    AppUtils.cachedGScriptCall(
      cacheKey,
      "getGrowthComparisonSummary",
      [currentYear, comparisonYear],
      (data) => {
        if (!data) {
          AppUtils.showError(
            `No growth comparison data found for ${currentYear} vs ${comparisonYear}.`,
          );

          return;
        }

        if (log) {
          console.log("[GrowthComparison] Data:", data);
        }

        renderGrowthComparison(containerSelector, data);
      },
      log,
      refresh,
    );
  }

  function renderGrowthComparison(containerSelector, data) {
    const $container = $(containerSelector);

    if (!$container.length || !data) {
      return;
    }

    /*
     * Main values.
     */
    $container
      .find('[data-metric="hours"]')
      .text(AppUtils.formatHours(data.current.hours));

    $container
      .find('[data-metric="paid"]')
      .text(AppUtils.formatHours(data.current.paid));

    $container
      .find('[data-metric="owed"]')
      .text(AppUtils.formatHours(data.current.owed));

    $container
      .find('[data-metric="net-hours"]')
      .text(AppUtils.formatHours(data.current.netHours));

    $container
      .find('[data-metric="monthly-average"]')
      .text(AppUtils.formatHours(data.current.monthlyAverage));

    $container
      .find('[data-metric="collection"]')
      .text(AppUtils.formatPercent(data.current.collection));

    /*
     * Comparison values.
     */
    const hoursChange = calculatePercentChange(
      data.current.hours,
      data.previous.hours,
    );

    const paidChange = calculatePercentChange(
      data.current.paid,
      data.previous.paid,
    );

    const owedChange = calculatePercentChange(
      data.current.owed,
      data.previous.owed,
    );

    const netHoursChange = calculatePercentChange(
      data.current.netHours,
      data.previous.netHours,
    );

    const monthlyAverageChange = calculatePercentChange(
      data.current.monthlyAverage,
      data.previous.monthlyAverage,
    );

    const collectionChange = data.current.collection - data.previous.collection;

    /*
     * Render comparison footnotes.
     */
    renderTrend(
      $container.find('[data-trend="hours"]'),
      hoursChange,
      data.current.hours,
      data.previous.hours,
      "hours",
    );

    renderTrend(
      $container.find('[data-trend="paid"]'),
      paidChange,
      data.current.paid,
      data.previous.paid,
      "paid",
    );

    renderTrend(
      $container.find('[data-trend="owed"]'),
      owedChange,
      data.current.owed,
      data.previous.owed,
      "owed",
    );

    renderTrend(
      $container.find('[data-trend="net-hours"]'),
      netHoursChange,
      data.current.netHours,
      data.previous.netHours,
      "net",
    );

    renderTrend(
      $container.find('[data-trend="monthly-average"]'),
      monthlyAverageChange,
      data.current.monthlyAverage,
      data.previous.monthlyAverage,
      "average",
    );

    renderRateTrend(
      $container.find('[data-trend="collection"]'),
      collectionChange,
    );

    /*
     * Dynamic metric colors.
     */
    setGrowthColor(
      $container.find('[data-trend="hours"]'),
      hoursChange,
      "positive",
    );

    setGrowthColor(
      $container.find('[data-trend="paid"]'),
      paidChange,
      "positive",
    );

    /*
     * For owed hours, an increase is bad.
     */
    setGrowthColor(
      $container.find('[data-trend="owed"]'),
      owedChange,
      "negative",
    );

    /*
     * Net hours: positive movement is generally good.
     */
    setGrowthColor(
      $container.find('[data-trend="net-hours"]'),
      netHoursChange,
      "positive",
    );

    setGrowthColor(
      $container.find('[data-trend="monthly-average"]'),
      monthlyAverageChange,
      "positive",
    );

    /*
     * Collection rate:
     * higher = better.
     */
    setGrowthColor(
      $container.find('[data-trend="collection"]'),
      collectionChange,
      "positive",
    );
  }

  function calculatePercentChange(current, previous) {
    current = Number(current) || 0;
    previous = Number(previous) || 0;

    /*
     * No meaningful percentage change when
     * the previous value is zero.
     */
    if (previous === 0) {
      return null;
    }

    return ((current - previous) / Math.abs(previous)) * 100;
  }

  function renderTrend($element, change, current, previous, type) {
    if (!$element.length) {
      return;
    }

    const yearText = $element.data("comparison-label") || "vs last year";

    if (change === null) {
      $element.html(`
        <span class="text-muted font-weight-bold">
          —
        </span>
        ${yearText}
      `);

      return;
    }

    const direction = change > 0 ? "up" : change < 0 ? "down" : "right";

    const formattedChange = `${Math.abs(change).toFixed(2)}%`;

    $element.html(`
      <span class="font-weight-bold me-1">
        <i class="fa fa-arrow-${direction} me-1"></i>
        ${formattedChange}
      </span>
      ${yearText}
    `);
  }

  function renderRateTrend($element, change) {
    if (!$element.length) {
      return;
    }

    const yearText = $element.data("comparison-label") || "vs last year";

    if (change === 0) {
      $element.html(`
        <span class="text-muted font-weight-bold">
          —
        </span>
        ${yearText}
      `);

      return;
    }

    const direction = change > 0 ? "up" : "down";

    $element.html(`
      <span class="font-weight-bold me-1">
        <i class="fa fa-arrow-${direction} me-1"></i>
        ${Math.abs(change).toFixed(2)} pts
      </span>
      ${yearText}
    `);
  }

  function setGrowthColor($element, change, goodDirection) {
    if (!$element.length) {
      return;
    }

    $element.removeClass("text-success text-danger text-warning");

    if (change === null || change === 0) {
      $element.addClass("text-muted");
      return;
    }

    const isGood = goodDirection === "positive" ? change > 0 : change < 0;

    $element.addClass(isGood ? "text-success" : "text-danger");
  }

  return { init, destroy };
})();

export { growthComparisonOverviewPage };
