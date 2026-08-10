import { ChartModule } from "../charts.js";
import { HourTargetProgress } from "../hours/hour-target-progress.js";

const performanceTargetPage = (() => {
  function init() {
    ChartModule.drawRealtimeAnimatedChart();
    ChartModule.loadPrevYearCombinedChart();

    HourTargetProgress.loadTargetProgress(
      "targetPercentsCurrentYear",
      "getCurrentYearTargetProgress",
      "curr-target-hrs",
      true,
    );

    HourTargetProgress.loadTargetProgress(
      "targetPercentsPreviousYear",
      "getPreviousYearTargetProgress",
      "prev-target-hrs",
      true,
    );
  }

  return { init };
})();

export { performanceTargetPage };
