import { ChartModule } from "../charts.js";
import { HourSummary } from "../hours/hour-summary.js";

const performanceYearlyPage = (() => {
  function init() {
    HourSummary.loadHoursSummary("#hours-summary");

    ChartModule.loadChart("yearly");
  }

  return { init };
})();

export { performanceYearlyPage };
