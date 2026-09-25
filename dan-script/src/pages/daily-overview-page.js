import { AppUtils } from "../utils.js";
import { ChartModule } from "../charts.js";
import { HourSummary } from "../hours/hour-summary.js";

const dailyOverviewPage = (() => {
  const DATE_RANGE_CACHE_KEY = "dailyOverviewSelectedRange";

  let datePicker = null;

  function init() {
    HourSummary.loadDailyOverviewSummary();

    initDateRangePicker();
    bindDateRangeFilter();
    loadInitialChart();
  }

  function initDateRangePicker() {
    const $input = $("#dailyOverviewDateRange");

    if (!$input.length || typeof window.flatpickr !== "function") {
      console.warn("[DailyOverview] Flatpickr is not available.");
      return;
    }

    const today = new Date();

    const todayString = formatDate(today);

    const cachedRange = AppUtils.cacheGet(DATE_RANGE_CACHE_KEY);

    const startDate = cachedRange?.startDate || todayString;

    const endDate = cachedRange?.endDate || todayString;

    datePicker = window.flatpickr($input[0], {
      mode: "range",
      showMonths: window.innerWidth <= 767 ? 1 : 2,
      dateFormat: "M d, Y",

      defaultDate: [parseLocalDate(startDate), parseLocalDate(endDate)],

      maxDate: "today",
      disableMobile: true,

      onOpen: function (selectedDates, dateStr, instance) {
        instance.set("minDate", null);
      },

      onChange: function (selectedDates, dateStr, instance) {
        if (selectedDates.length === 1) {
          instance.set("minDate", selectedDates[0]);
        }
      },
    });
  }

  function bindDateRangeFilter() {
    $(document)
      .off("click.dailyOverview", "#dailyOverviewFilterSubmit")
      .on("click.dailyOverview", "#dailyOverviewFilterSubmit", function () {
        const dates = datePicker?.selectedDates || [];

        if (!dates.length) {
          AppUtils.showError("Please select a date.");
          return;
        }

        const startDate = formatDate(dates[0]);

        const endDate = formatDate(dates[1] || dates[0]);

        saveDateRange(startDate, endDate);

        loadDailyOverviewChart(startDate, endDate);
      });
  }

  function loadInitialChart() {
    if (!datePicker) {
      return;
    }

    const dates = datePicker.selectedDates;

    if (!dates.length) {
      return;
    }

    const startDate = formatDate(dates[0]);
    const endDate = formatDate(dates[1] || dates[0]);

    loadDailyOverviewChart(startDate, endDate, false);
  }

  function loadDailyOverviewChart(startDate, endDate, showLoading = true) {
    if (showLoading) {
      showChartLoading();
    }

    AppUtils.cachedGScriptCall(
      `dailyOverviewChart_${startDate}_${endDate}`,
      "updateDailyOverviewChartRange",
      [startDate, endDate],
      (data) => {
        if (showLoading) {
          hideChartLoading();
        }

        ChartModule.drawChart("daily_overview", data, false, true);
      },
      false,
      true,
    );
  }

  function saveDateRange(startDate, endDate) {
    AppUtils.cacheSet(DATE_RANGE_CACHE_KEY, {
      startDate,
      endDate,
    });
  }

  function formatDate(date) {
    const year = date.getFullYear();

    const month = String(date.getMonth() + 1).padStart(2, "0");

    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function parseLocalDate(dateString) {
    const [year, month, day] = dateString.split("-").map(Number);

    return new Date(year, month - 1, day);
  }

  function showChartLoading() {
    $("#chart-daily_overview-loading").removeClass("d-none");

    $("#dailyOverviewDateRange, #dailyOverviewFilterSubmit").prop(
      "disabled",
      true,
    );
  }

  function hideChartLoading() {
    $("#chart-daily_overview-loading").addClass("d-none");

    $("#dailyOverviewDateRange, #dailyOverviewFilterSubmit").prop(
      "disabled",
      false,
    );
  }

  function destroy() {
    $(document).off(".dailyOverview");

    if (datePicker) {
      datePicker.destroy();
      datePicker = null;
    }

    ChartModule.destroyChart?.("daily_overview");
  }

  return {
    init,
    destroy,
  };
})();

export { dailyOverviewPage };
