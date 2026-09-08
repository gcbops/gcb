import { ChartModule } from "../charts.js";
import { HourSummary } from "../hours/hour-summary.js";
import { ClientRanking } from "../clients/client-ranking.js";
import { ProjectRankings } from "../projects/project-ranking.js";

const dailyOverviewPage = (() => {
  function init() {
    HourSummary.loadDailyOverviewSummary();
    ChartModule.loadChart("daily");
    ClientRanking.renderTopPaidClients();
    ProjectRankings.renderTopProjects();
  }

  return { init };
})();

export { dailyOverviewPage };
