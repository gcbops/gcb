import { AppUtils } from "../utils";

const HourSummary = (() => {
    function loadHoursSummary(containerSelector) {
      AppUtils.cachedGScriptCall(
        "hoursSummary",
        "getHoursSummary",
        [],
        (data) => {
          if (!data) {
            AppUtils.showError("No metrics found");
            return;
          }

          renderHoursSummary(containerSelector, data);
        },
      );
    }

    function renderHoursSummary(containerSelector, data) {
      const $container = $(containerSelector);

      if (!$container.length || !data) {
        return;
      }

      $container
        .find('[data-metric="total-hours"]')
        .text(AppUtils.formatHours(data.totalHours));

      $container
        .find('[data-metric="paid-hours"]')
        .text(AppUtils.formatHours(data.totalPaid));

      $container
        .find('[data-metric="owed-hours"]')
        .text(AppUtils.formatHours(data.owedHours));

      $container
        .find('[data-metric="net-hours"]')
        .text(AppUtils.formatHours(data.netHours));

      $container
        .find('[data-metric="lifetime"]')
        .text(AppUtils.formatPercent(data.lifetimePercent));

      $container
        .find('[data-metric="collection"]')
        .text(AppUtils.formatPercent(data.collectionRate));

      $container
        .find('[data-metric="debt"]')
        .text(AppUtils.formatPercent(data.debtExposureRate));

      $container
        .find('[data-metric="yield"]')
        .text(AppUtils.formatPercent(data.netHoursYield));

      /*
       * Dynamic colors.
       */
      setRateColor(
        $container.find('[data-metric="collection"]'),
        data.collectionRate,
        "collection",
      );

      setRateColor(
        $container.find('[data-metric="debt"]'),
        data.debtExposureRate,
        "debt",
      );

      setRateColor(
        $container.find('[data-metric="yield"]'),
        data.netHoursYield,
        "yield",
      );

      setNetHoursColor(
        $container.find('[data-metric="net-hours"]'),
        data.netHours,
      );
    }

    function loadHourTotals(isRefresh) {
      AppUtils.cachedGScriptCall(
        "hourTotals",
        "getHourTotals",
        [],
        (data) => {
          if (!data) {
            return;
          }

          const dailyEl = document.getElementById("daily-hour-total");
          const monthlyEl = document.getElementById("monthly-hour-total");
          const yearlyEl = document.getElementById("yearly-hour-total");

          if (dailyEl) {
            dailyEl.textContent = data.daily;
          }

          if (monthlyEl) {
            monthlyEl.textContent = data.monthly;
          }

          if (yearlyEl) {
            yearlyEl.textContent = data.yearly;
          }
        },
        false,
        isRefresh,
      );
    }

    function loadYearHoursSummary(containerSelector) {
      const currentYear = new Date().getFullYear();

      AppUtils.cachedGScriptCall(
        "yearHoursSummary",
        "getYearHoursSummary",
        [currentYear],
        (data) => {
          if (!data) {
            AppUtils.showError("No yearly analytics found.");
            return;
          }

          renderYearHoursSummary(containerSelector, data);
        },
      );
    }

    function renderYearHoursSummary(containerSelector, data) {
      const $container = $(containerSelector);

      if (!$container.length || !data) {
        return;
      }

      $container
        .find('[data-metric="total-hours"]')
        .text(AppUtils.formatHours(data.hours));

      $container
        .find('[data-metric="paid-hours"]')
        .text(AppUtils.formatHours(data.paid));

      $container
        .find('[data-metric="owed-hours"]')
        .text(AppUtils.formatHours(data.owed));

      $container
        .find('[data-metric="net-hours"]')
        .text(AppUtils.formatHours(data.netHours));

      $container
        .find('[data-metric="lifetime"]')
        .text(AppUtils.formatPercent(data.lifetime));

      $container
        .find('[data-metric="collection"]')
        .text(AppUtils.formatPercent(data.collection));

      $container
        .find('[data-metric="debt"]')
        .text(AppUtils.formatPercent(data.debt));

      $container
        .find('[data-metric="yield"]')
        .text(AppUtils.formatPercent(data.yield));

      /*
       * Dynamic metric colors.
       */
      setRateColor(
        $container.find('[data-metric="collection"]'),
        data.collection,
        "collection",
      );

      setRateColor($container.find('[data-metric="debt"]'), data.debt, "debt");

      setRateColor(
        $container.find('[data-metric="yield"]'),
        data.yield,
        "yield",
      );

      setNetHoursColor(
        $container.find('[data-metric="net-hours"]'),
        data.netHours,
      );
    }

    function setRateColor($element, value, type) {
      const number = AppUtils.parsePercent(value);

      $element.removeClass(
        "text-success text-warning text-danger bg-success-light bg-warning-light bg-danger-light text-primary",
      );

      if (type === "collection") {
        if (number >= 70) {
          $element.addClass("text-success bg-success-light");
        } else if (number >= 40) {
          $element.addClass("text-warning bg-warning-light");
        } else {
          $element.addClass("text-danger bg-danger-light");
        }

        return;
      }

      if (type === "debt") {
        if (number <= 30) {
          $element.addClass("text-success bg-success-light");
        } else if (number <= 60) {
          $element.addClass("text-warning bg-warning-light");
        } else {
          $element.addClass("text-danger bg-danger-light");
        }

        return;
      }

      if (type === "yield") {
        if (number > 0) {
          $element.addClass("text-success bg-success-light");
        } else if (number === 0) {
          $element.addClass("text-warning bg-warning-light");
        } else {
          $element.addClass("text-danger bg-danger-light");
        }
      }
    }

    function setNetHoursColor($element, value) {
      const number = Number(value);

      $element.removeClass("text-success text-warning text-danger");

      if (!Number.isFinite(number)) {
        $element.addClass("text-dark");
        return;
      }

      if (number > 0) {
        $element.addClass("text-success");
      } else if (number === 0) {
        $element.addClass("text-warning");
      } else {
        $element.addClass("text-danger");
      }
    }

    return {
      loadHoursSummary,
      loadHourTotals,
      loadYearHoursSummary,
    };

})(); 

export { HourSummary };