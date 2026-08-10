import { ChartModule } from "../charts.js";
import { HourSummary } from "../hours/hour-summary.js";

const performanceDailyPage = (() => {
  function init() {
    HourSummary.loadHourTotals();

    ChartModule.loadChart("daily", true);
  }

  return { init };
})();

export { performanceDailyPage };
