import { ChartModule } from "../charts.js";
import { HourSummary } from "../hours/hour-summary.js";
import { ClientRanking } from "../clients/client-ranking.js";
import { ProjectRankings } from "../projects/project-ranking.js";
import { PerformanceMetrics } from "../performance/performance-metrics.js";
import { ClientDataService } from "../clients/client-data-service.js";
import { ClientTableService } from "../clients/client-table-service.js";

const HomePage = (() => {
  function init() {
    HourSummary.loadHoursSummary("#hours-summary");
    ChartModule.loadChart("daily", false, false, false, false, {
      showAxes: false,
      showGrid: false,
      showPoints: false,
      showTooltip: false,
      showLegend: false,
      showLabel: false,
    });
    ChartModule.loadChart("monthly");
    ChartModule.loadPrevYearCombinedChart();
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

    HourSummary.loadTodayChargedHours();
    ClientRanking.renderTopPaidClients();
    ProjectRankings.renderTopProjects();

    ClientDataService.renderActivePaidOwedClients(true);
  }

  function destroy() {
    ClientTableService.destroyStatusFilter();
  }

  return { init, destroy };
})();

export { HomePage };

