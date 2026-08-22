import { ClientDataService } from "../clients/client-data-service";
import { ClientRanking } from "../clients/client-ranking.js";
import { ProjectRankings } from "../projects/project-ranking.js";

const activeClientsPage = (() => {
  function init() {
    ClientDataService.renderActivePaidOwedClients();

    ClientRanking.renderTopPaidClients();
    ProjectRankings.renderTopProjects();
  }

  return { init };
})();

export { activeClientsPage };
