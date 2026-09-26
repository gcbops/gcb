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

    function loadDailyOverviewSummary() {
      AppUtils.cachedGScriptCall(
        "dailyOverviewSummary",
        "getDailyOverviewSummary",
        [],
        (data) => {
          if (!data) {
            AppUtils.showError("No daily analytics found.");
            return;
          }

          renderDailyOverviewSummary(data);
        },
      );
    }

    function renderDailyOverviewSummary(data) {
      const $container = $("#daily-overview-summary");

      if (!$container.length || !data) {
        return;
      }

      // Main metrics
      $container
        .find('[data-metric="today-hours"]')
        .text(AppUtils.formatHours(data.todayHours));

      $container
        .find('[data-metric="active-clients"]')
        .text(data.activeClientsToday ?? 0);

      $container
        .find('[data-metric="month-hours"]')
        .text(AppUtils.formatHours(data.currentMonth));

      $container
        .find('[data-metric="month-average"]')
        .text(formatHoursPerDay(data.currentMonthAverage));

      $container
        .find('[data-metric="overall-hours"]')
        .text(AppUtils.formatHours(data.overallTotalHours));

      $container
        .find('[data-metric="yesterday-hours"]')
        .text(AppUtils.formatHours(data.yesterdayHours));

      // Comparisons
      renderDailyTrend(
        $container.find('[data-metric="hours-yesterday"]'),
        data.hoursVsYesterday,
        "hours",
      );

      renderDailyTrend(
        $container.find('[data-metric="clients-yesterday"]'),
        calculateChange(data.activeClientsToday, data.activeClientsYesterday),
        "clients",
      );

      renderDailyTrend(
        $container.find('[data-metric="month-previous"]'),
        data.monthVsPreviousMonth,
        "month",
      );
    }

    function renderDailyTrend($element, value, type) {
      if (!$element?.length) {
        return;
      }

      if (
        value === null ||
        value === undefined ||
        value === "" ||
        !Number.isFinite(Number(value))
      ) {
        $element.removeClass("text-success text-danger text-warning text-muted")
          .html(`
        <span class="text-muted">
          No comparison available
        </span>
      `);

        return;
      }

      const numericValue = Number(value);

      $element.removeClass("text-success text-danger text-warning text-muted");

      if (numericValue === 0) {
        $element.addClass("text-warning").html(`
      <i class="fa fa-minus me-1"></i>
      No change
    `);

        return;
      }

      const isPositive = numericValue > 0;
      const percentage = AppUtils.formatPercent(Math.abs(numericValue));

      let text;

      switch (type) {
        case "hours":
          text = isPositive
            ? `${percentage} more hours vs yesterday`
            : `${percentage} fewer hours vs yesterday`;
          break;

        case "clients":
          text = isPositive
            ? `${percentage} more active clients vs yesterday`
            : `${percentage} fewer active clients vs yesterday`;
          break;

        case "month":
          text = isPositive
            ? `${percentage} more hours vs last month`
            : `${percentage} fewer hours vs last month`;
          break;

        default:
          text = `${percentage} vs previous period`;
      }

      $element.addClass(isPositive ? "text-success" : "text-danger").html(`
      <i class="fa ${isPositive ? "fa-arrow-up" : "fa-arrow-down"} me-1"></i>
      ${text}
    `);
    }

    function loadMonthlyHoursSummary(containerSelector) {
      AppUtils.cachedGScriptCall(
        "monthlyHoursSummary",
        "getMonthlyHoursSummary",
        [],
        (data) => {
          if (!data) {
            AppUtils.showError("No monthly analytics found.");
            return;
          }

          renderMonthlyHoursSummary(containerSelector, data);
        },
      );
    }

    function renderMonthlyHoursSummary(containerSelector, data) {
      const $container = $(containerSelector);

      if (!$container.length || !data) {
        return;
      }

      /*
       * Current month
       */
      $container
        .find('[data-metric="current-hours"]')
        .text(AppUtils.formatHours(data.currentMonth?.hours ?? 0));

      $container
        .find('[data-metric="current-month-label"]')
        .text(data.currentMonth?.label || "—");

      /*
       * Previous month
       */
      $container
        .find('[data-metric="previous-hours"]')
        .text(AppUtils.formatHours(data.previousMonth?.hours ?? 0));

      $container
        .find('[data-metric="previous-month-total"]')
        .text(AppUtils.formatHours(data.previousMonth?.hours ?? 0));

      $container
        .find('[data-metric="previous-month-label"]')
        .text(data.previousMonth?.label || "—");

      /*
       * Same month last year
       */
      $container
        .find('[data-metric="last-year-hours"]')
        .text(AppUtils.formatHours(data.lastYear?.hours ?? 0));

      /*
       * Percentage changes.
       */
      const previousChange = data.previousMonthChange;
      const lastYearChange = data.lastYearChange;

      $container
        .find('[data-metric="previous-month-change"]')
        .text(
          previousChange === null || previousChange === undefined
            ? "—"
            : formatTrendPercent(previousChange),
        );

      $container
        .find('[data-metric="last-year-change"]')
        .text(
          lastYearChange === null || lastYearChange === undefined
            ? "—"
            : formatTrendPercent(lastYearChange),
        );

      /*
       * Charged hours.
       */
      $container
        .find('[data-metric="charged-hours"]')
        .text(AppUtils.formatHours(data.chargedHours ?? 0));

      $container
        .find('[data-metric="charged-rate"]')
        .text(
          data.chargedRate === null || data.chargedRate === undefined
            ? "—"
            : AppUtils.formatPercent(data.chargedRate),
        );

      /*
       * Weekly average.
       */
      $container
        .find('[data-metric="average-weekly"]')
        .text(AppUtils.formatHours(data.averageWeekly ?? 0));

      $container
        .find('[data-metric="weeks-count"]')
        .text(data.activeWeeks ?? 0);

      /*
       * Dynamic trend colors.
       *
       * Positive = green
       * Negative = red
       * Zero = neutral
       */
      setTrendColor(
        $container.find('[data-metric="previous-month-change"]'),
        previousChange,
      );

      setTrendColor(
        $container.find('[data-metric="last-year-change"]'),
        lastYearChange,
      );
    }

    function loadYearHoursSummary(containerSelector) {
      const currentYear = new Date().getFullYear();

      // console.log("[HoursSummary] Loading yearly summary:", {
      //   currentYear,
      //   containerSelector,
      // });

      AppUtils.cachedGScriptCall(
        "yearHoursSummary",
        "getYearHoursSummary",
        [currentYear],
        (data) => {
          // console.log("[HoursSummary] Yearly summary response:", data);

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
        console.warn("[HoursSummary] Yearly summary container/data missing.", {
          containerSelector,
          data,
        });

        return;
      }

      // console.log("[HoursSummary] Rendering yearly summary:", data);

      /*
       * Current year metrics.
       */
      $container
        .find('[data-metric="total-hours"]')
        .text(AppUtils.formatHours(data.hours));

      $container
        .find('[data-metric="lifetime"]')
        .text(AppUtils.formatPercent(data.lifetime));

      $container
        .find('[data-metric="paid-hours"]')
        .text(AppUtils.formatHours(data.paid));

      $container
        .find('[data-metric="collection"]')
        .text(AppUtils.formatPercent(data.collection));

      $container
        .find('[data-metric="owed-hours"]')
        .text(AppUtils.formatHours(data.owed));

      $container
        .find('[data-metric="debt"]')
        .text(AppUtils.formatPercent(data.debt));

      $container
        .find('[data-metric="net-hours"]')
        .text(AppUtils.formatHours(data.netHours));

      $container
        .find('[data-metric="yield"]')
        .text(AppUtils.formatPercent(data.yield));

      /*
       * Year-over-year metrics.
       */
      renderYearlyTrend(
        $container.find('[data-metric="hours-yoy"]'),
        data.hoursYoY,
        "hours",
      );

      renderYearlyTrend(
        $container.find('[data-metric="collection-yoy"]'),
        data.collectionYoY,
        "collection",
      );

      renderYearlyTrend(
        $container.find('[data-metric="debt-yoy"]'),
        data.debtYoY,
        "debt",
      );

      renderYearlyTrend(
        $container.find('[data-metric="yield-yoy"]'),
        data.yieldYoY,
        "yield",
      );

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

    function renderYearlyTrend($element, value, type) {
      if (!$element?.length) {
        return;
      }

      // No previous-year comparison available
      if (
        value === null ||
        value === undefined ||
        value === "" ||
        !Number.isFinite(Number(value))
      ) {
        $element.removeClass("text-success text-danger text-warning").html(`
        <span class="text-muted">
          No prior-year comparison
        </span>
      `);

        return;
      }

      const numericValue = Number(value);

      // No change
      if (numericValue === 0) {
        $element.removeClass("text-success text-danger text-warning").html(`
        <i class="fa fa-minus me-1"></i>
        No change vs last year
      `);

        return;
      }

      const isPositive = numericValue > 0;

      const icon = isPositive ? "fa-arrow-up" : "fa-arrow-down";

      let text;
      let isGood;

      switch (type) {
        case "hours":
          text = isPositive
            ? `${formatTrendPercent(numericValue)} more hours vs last year`
            : `${formatTrendPercent(numericValue)} fewer hours vs last year`;

          isGood = isPositive;
          break;

        case "collection":
          text = isPositive
            ? `${formatTrendPercent(numericValue)} improvement vs last year`
            : `${formatTrendPercent(numericValue)} drop since last year`;

          isGood = isPositive;
          break;

        case "debt":
          text = isPositive
            ? `${formatTrendPercent(numericValue)} risk spike vs last year`
            : `${formatTrendPercent(numericValue)} lower exposure vs last year`;

          // Lower debt exposure is better
          isGood = !isPositive;
          break;

        case "yield":
          text = isPositive
            ? `${formatTrendPercent(numericValue)} stronger yield vs last year`
            : `${formatTrendPercent(numericValue)} lost margin yield vs last year`;

          isGood = isPositive;
          break;

        default:
          text = `${formatTrendPercent(numericValue)} vs last year`;
          isGood = isPositive;
      }

      const colorClass = isGood ? "text-success" : "text-danger";

      $element
        .removeClass("text-success text-danger text-warning")
        .addClass(colorClass).html(`
      <i class="fa ${icon} me-1"></i>
      ${text}
    `);
    }

    function loadTodayChargedHours() {
      AppUtils.cachedGScriptCall(
        "todayChargedHours",
        "getTodayChargedHours",
        [],
        (data) => {
          if (!data) {
            AppUtils.showError("Unable to load today's hours.");
            return;
          }

          renderTodayChargedHours(data);
        },
        false,
        true
      );
    }

    function renderTodayChargedHours(data) {
      const $container = $("#today-hours-summary");

      if (!$container.length) {
        return;
      }

      const todayHours = Number(data.todayHours) || 0;
      const change = data.change;

      $container
        .find('[data-metric="today-hours"]')
        .text(AppUtils.formatHours(todayHours));

      renderTodayHoursTrend($container, change);
    }

    function renderTodayHoursTrend($container, change) {
      const $status = $container.find('[data-metric="today-hours-status"]');

      const $change = $container.find('[data-metric="today-hours-change"]');

      if (!$status.length || !$change.length) {
        return;
      }

      const $icon = $status.find("i");

      $status.removeClass(
        "bg-success-subtle bg-danger-subtle bg-warning-subtle bg-secondary-subtle " +
          "text-success text-danger text-warning text-secondary",
      );

      $icon.removeClass("fa-arrow-up fa-arrow-down fa-arrow-right fa-minus");

      if (change === null || change === undefined) {
        $status.addClass("bg-secondary-subtle text-secondary");

        $icon.addClass("fa-minus");

        $change.text("—");

        return;
      }

      const number = Number(change);

      if (!Number.isFinite(number)) {
        $status.addClass("bg-secondary-subtle text-secondary");

        $icon.addClass("fa-minus");

        $change.text("—");

        return;
      }

      const percent = AppUtils.formatPercent(Math.abs(number * 100));

      if (number > 0) {
        $status.addClass("bg-success-subtle text-success");

        $icon.addClass("fa-arrow-up");

        $change.text(`+${percent}`);
      } else if (number < 0) {
        $status.addClass("bg-danger-subtle text-danger");

        $icon.addClass("fa-arrow-down");

        $change.text(`-${percent}`);
      } else {
        $status.addClass("bg-warning-subtle text-warning");

        $icon.addClass("fa-arrow-right");

        $change.text("0%");
      }
    }

    function formatTrendPercent(value) {
      const number = Number(value);

      if (!Number.isFinite(number)) {
        return "—";
      }

      const sign = number > 0 ? "+" : "";

      return `${sign}${AppUtils.formatPercent(Math.abs(number))}`;
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

    function setTrendColor($element, value) {
      if (!$element?.length) {
        return;
      }

      $element.removeClass("text-success text-danger text-warning text-muted");

      if (value === null || value === undefined) {
        $element.addClass("text-muted");
        return;
      }

      if (value > 0) {
        $element.addClass("text-success");
      } else if (value < 0) {
        $element.addClass("text-danger");
      } else {
        $element.addClass("text-warning");
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

    function calculateChange(current, previous) {
      const currentValue = Number(current);
      const previousValue = Number(previous);

      if (
        !Number.isFinite(currentValue) ||
        !Number.isFinite(previousValue) ||
        previousValue === 0
      ) {
        return null;
      }

      return currentValue / previousValue - 1;
    }

    function formatHoursPerDay(value) {
      const number = Number(value);

      if (!Number.isFinite(number)) {
        return "—";
      }

      return `${number.toLocaleString(undefined, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })} hrs/day`;
    }

    return {
      loadHoursSummary,
      loadYearHoursSummary,
      loadMonthlyHoursSummary,
      loadDailyOverviewSummary,
      loadTodayChargedHours,
    };

})(); 

export { HourSummary };