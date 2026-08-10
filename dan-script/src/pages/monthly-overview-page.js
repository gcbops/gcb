import { ChartModule } from "../charts.js";
import { HourSummary } from "../hours/hour-summary.js";
import { ClientRanking } from "../clients/client-ranking.js";
import { ProjectRankings } from "../projects/project-ranking.js";

const monthlyOverviewPage = (() => {
  function init() {
    HourSummary.loadHoursSummary("#hours-summary");
    ChartModule.loadChart("monthly");
    ClientRanking.renderTopPaidClients();
    ProjectRankings.renderTopProjects();
  }

  return { init };
})();

export { monthlyOverviewPage };
