import { ChartModule } from "../charts.js";
import { HourSummary } from "../hours/hour-summary.js";
import { AppUtils } from "../utils.js";

const monthlyOverviewPage = (() => {
  function init() {
    HourSummary.loadMonthlyHoursSummary("#monthly-hours-summary");
    initCurrentMonthLogChart();
  }

  function destroy() {
    // Remove page-specific filter events
    $(document).off(".currentMonthLog");

    // Hide loading state
    hideCurrentMonthLogChartLoading();

    // Destroy chart instance
    ChartModule.destroyChart?.("current_month_log");
  }

  function loadCurrentMonthLogChart(showLoading = true) {
    const month = Number($("#chartMonthFilter").val());
    const year = Number($("#chartYearFilter").val());
    
    if (!month || !year) {
      return;
    }
    if (showLoading) {
      showCurrentMonthLogChartLoading();
    }

    AppUtils.initSelect2(".chart-filters");

    ChartModule.loadChart(
      "current_month_log",
      false,
      year,
      false,
      false,
      {},
      month,
      hideCurrentMonthLogChartLoading,
    );
  }

  function bindCurrentMonthLogChartFilters() {
    $(document)
      .off("change.currentMonthLog", "#chartYearFilter")
      .on("change.currentMonthLog", "#chartYearFilter", function () {
        const selectedYear = Number(this.value);
        const currentMonth = new Date().getMonth() + 1;

        updateCurrentMonthLogMonthOptions(selectedYear, currentMonth);
      });

    $(document)
      .off("click.currentMonthLog", "#chartFilterSubmit")
      .on("click.currentMonthLog", "#chartFilterSubmit", function () {
        loadCurrentMonthLogChart();
      });
  }

  function initCurrentMonthLogChart() {
    initCurrentMonthLogFilters();
    bindCurrentMonthLogChartFilters();
    loadCurrentMonthLogChart(false);
  }

  function initCurrentMonthLogFilters() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const $year = $("#chartYearFilter");

    // Years: 2024 -> current year
    $year.empty();

    for (let year = 2024; year <= currentYear; year++) {
      $year.append(`<option value="${year}">${year}</option>`);
    }

    // Default to current year
    $year.val(currentYear);

    updateCurrentMonthLogMonthOptions(currentYear, currentMonth);
  }

  function updateCurrentMonthLogMonthOptions(selectedYear, currentMonth) {
    const $month = $("#chartMonthFilter");

    $month.empty();

    const months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    const currentYear = new Date().getFullYear();

    // Current year → January through current month
    // Previous years → all 12 months
    const maxMonth = selectedYear === currentYear ? currentMonth : 12;

    for (let month = 1; month <= maxMonth; month++) {
      $month.append(`<option value="${month}">${months[month - 1]}</option>`);
    }

    // Current year → current month
    // Previous years → December
    $month.val(selectedYear === currentYear ? currentMonth : 12);
  }

  function showCurrentMonthLogChartLoading() {
    $("#chart-current_month_log-loading").removeClass("d-none");

    $("#chartMonthFilter, #chartYearFilter, #chartFilterSubmit").prop(
      "disabled",
      true,
    );

    ChartModule.animateChart("current_month_log", true, 1800);
  }

  function hideCurrentMonthLogChartLoading() {
    ChartModule.animateChart("current_month_log", false);

    $("#chartMonthFilter, #chartYearFilter, #chartFilterSubmit").prop(
      "disabled",
      false,
    );

    $("#chart-current_month_log-loading").addClass("d-none");
  }

  return {
    init,
    destroy,
  };
})();

export { monthlyOverviewPage };
