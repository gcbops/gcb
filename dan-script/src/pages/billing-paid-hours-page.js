import { HourSummary } from "../hours/hour-summary.js";
import { ClientRanking } from "../clients/client-ranking.js";
import { ProjectRankings } from "../projects/project-ranking.js";

const billingPaidHoursPage = (() => {
  function init() {
    HourSummary.loadHoursSummary("#billing-hours-summary");

    ClientRanking.renderTopPaidClients();
    ProjectRankings.renderTopProjects();
  }

  return { init };
})();

export { billingPaidHoursPage };