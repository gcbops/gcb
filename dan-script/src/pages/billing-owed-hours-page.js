import { HourSummary } from "../hours/hour-summary.js";
import { ClientRanking } from "../clients/client-ranking.js";
import { ProjectRankings } from "../projects/project-ranking.js";

const billingOwedHoursPage = (() => {
  function init() {
    HourSummary.loadHoursSummary("#billing-hours-summary");

    ClientRanking.renderLowestPaidClients();
    ProjectRankings.renderLowestProjects();
  }

  return { init };
})();

export { billingOwedHoursPage };
