import { ChartModule } from "../charts.js";
import { HourSummary } from "../hours/hour-summary.js";
import { ClientRanking } from "../clients/client-ranking.js";
import { ProjectRankings } from "../projects/project-ranking.js";

const growthComparisonOverviewPage = (() => {
  function init() {
    HourSummary.loadHoursSummary("#hours-summary");

    ChartModule.loadPrevYearCombinedChart();
    ChartModule.loadChart("yearly");

    ClientRanking.renderTopPaidClients();
    ProjectRankings.renderTopProjects();
  }

  return { init };
})();

export { growthComparisonOverviewPage };
