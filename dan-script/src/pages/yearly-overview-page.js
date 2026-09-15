import { ChartModule } from "../charts.js";
import { HourSummary } from "../hours/hour-summary.js";

const yearlyOverviewPage = (() => {
  function init() {
    HourSummary.loadYearHoursSummary("#year-hours-summary");

    initYearlyMonthlyHoursChart();
  }

  function destroy() {
    $(document).off(".yearlyMonthlyHours");

    hideYearlyMonthlyHoursChartLoading();

    ChartModule.destroyChart?.("yearly_monthly_hours");
  }

  function loadYearlyMonthlyHoursChart(
    showLoading = true,
    selectedYear = null,
  ) {
    const year = selectedYear ?? Number($("#chartYearFilter").val());

    if (!year) {
      return;
    }

    if (showLoading) {
      showYearlyMonthlyHoursChartLoading();
    }

    ChartModule.loadChart(
      "yearly_monthly_hours",
      false,
      year,
      false,
      false,
      {},
      undefined,
      hideYearlyMonthlyHoursChartLoading,
    );
  }

  function bindYearlyMonthlyHoursChartFilters() {
    $(document)
      .off("click.yearlyMonthlyHours", "#chartFilterSubmit")
      .on("click.yearlyMonthlyHours", "#chartFilterSubmit", function () {
        loadYearlyMonthlyHoursChart();
      });
  }

  function initYearlyMonthlyHoursFilters() {
    const currentYear = new Date().getFullYear();

    const $year = $("#chartYearFilter");

    $year.empty();

    // 2024 → current year
    for (let year = 2024; year <= currentYear; year++) {
      $year.append(`<option value="${year}">${year}</option>`);
    }

    // Default to current year
    $year.val(String(currentYear));

    return currentYear;
  }

  function initYearlyMonthlyHoursChart() {
    const currentYear = initYearlyMonthlyHoursFilters();

    bindYearlyMonthlyHoursChartFilters();

    loadYearlyMonthlyHoursChart(false, currentYear);
  }

  function showYearlyMonthlyHoursChartLoading() {
    $("#chart-yearly_monthly_hours-loading").removeClass("d-none");

    $("#chartYearFilter, #chartFilterSubmit").prop("disabled", true);

    ChartModule.animateChart("yearly_monthly_hours", true, 1800);
  }

  function hideYearlyMonthlyHoursChartLoading() {
    ChartModule.animateChart("yearly_monthly_hours", false);

    $("#chartYearFilter, #chartFilterSubmit").prop("disabled", false);

    $("#chart-yearly_monthly_hours-loading").addClass("d-none");
  }

  return {
    init,
    destroy,
  };
})();

export { yearlyOverviewPage };
