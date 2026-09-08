// import { ChartModule } from "../charts.js";
import { HourTargetProgress } from "../hours/hour-target-progress.js";

const performanceTargetPage = (() => {
  function init() {

    HourTargetProgress.loadTargetChart(
      "targetChart",
      "getCurrentYearTargetChartData",
    );

    HourTargetProgress.loadTargetProgress(
      "targetProgress",
      "getCurrentTargetProgress",
    );
  }

  return { init };
})();

export { performanceTargetPage };
