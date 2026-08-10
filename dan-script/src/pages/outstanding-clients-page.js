import { ClientRanking } from "../clients/client-ranking.js";
import { ClientDataService } from "../clients/client-data-service.js";
import { ProjectRankings } from "../projects/project-ranking.js";

const outstandingClientsPage = (() => {
  function init() {
    ClientDataService.renderClientDataByStatus(
      "Paid & Owed Log",
      "Outstanding Accounts",
      "Outstanding Accounts",
    );

    ClientRanking.renderLowestPaidClients();
    ProjectRankings.renderLowestProjects();
  }

  return { init };
})();

export { outstandingClientsPage };
