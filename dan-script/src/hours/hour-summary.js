import { AppUtils } from "../utils";

const HourSummary = (() => {
    function loadHoursSummary(containerSelector) {
      AppUtils.cachedGScriptCall(
        "hoursSummary",
        "getHoursSummary",
        [],
        (data) => {
          if (!data) {
            AppUtils.showDashboardToast("No metrics found", "error");
            return;
          }

          renderHoursSummary(containerSelector, data);
        },
      );
    }

    function renderHoursSummary(containerSelector, data) {
      const map = {
        "Total Hours": data.totalHours,
        "Paid Hours": data.totalPaid,
        "Owed Hours": data.owedHours,
        "Net Hours": data.netHours,
      };

      document
        .querySelectorAll(`${containerSelector} .widget-content`)
        .forEach((container) => {
          const heading = container
            .querySelector(".widget-heading")
            ?.innerText.trim();
          const valueSpan = container.querySelector(".widget-numbers span");

          if (map[heading] !== undefined && valueSpan) {
            valueSpan.textContent = map[heading];
          }
        });
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

    return {
      loadHoursSummary,
      loadHourTotals,
    };

})(); 

export { HourSummary };