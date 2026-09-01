import { ChartModule } from "../charts.js";
import { HourSummary } from "../hours/hour-summary.js";
import { ClientRanking } from "../clients/client-ranking.js";
import { ProjectRankings } from "../projects/project-ranking.js";
import { PerformanceMetrics } from "../performance/performance-metrics.js";

const HomePage = (() => {
  function init() {
    HourSummary.loadHoursSummary("#hours-summary");
    ChartModule.loadChart("daily");
    ChartModule.loadChart("monthly");
    ChartModule.loadChart("yearly");
    ChartModule.loadPrevYearCombinedChart();
    ClientRanking.renderTopPaidClients();
    ProjectRankings.renderTopProjects();
    PerformanceMetrics.loadPerformanceSummary(
      "current-performance-summary",
      "current-paid-growth",
      "current",
    );
    PerformanceMetrics.loadPerformanceSummary(
      "previous-performance-summary",
      "previous-paid-growth",
      "previous",
    );
  }

  return { init };
})();

export { HomePage };

