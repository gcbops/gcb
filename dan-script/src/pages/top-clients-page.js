import { ClientRanking } from "../clients/client-ranking.js";
import { ProjectRankings } from "../projects/project-ranking.js";
import { ClientDataService } from "../clients/client-data-service.js";

const topClientsPage = (() => {
  function init() {
    ClientDataService.renderClientDataByStatus(
      "Paid & Owed Log",
      "Top Paid Accounts",
      "Top Paid",
    );

    ClientRanking.renderTopPaidClients();
    ProjectRankings.renderTopProjects();
  }

  return { init };
})();

export { topClientsPage };
