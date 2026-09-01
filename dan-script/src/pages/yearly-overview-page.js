import { ChartModule } from "../charts.js";
import { HourSummary } from "../hours/hour-summary.js";
import { ClientRanking } from "../clients/client-ranking.js";
import { ProjectRankings } from "../projects/project-ranking.js";

const yearlyOverviewPage = (() => {
  function init() {
    HourSummary.loadYearHoursSummary("#year-hours-summary");
    ChartModule.loadChart("yearly", false, new Date().getFullYear());
    ClientRanking.renderTopPaidClients();
    ProjectRankings.renderTopProjects();
  }

  return { init };
})();

export { yearlyOverviewPage };
