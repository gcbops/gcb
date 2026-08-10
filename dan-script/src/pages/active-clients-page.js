import { ClientRanking } from "../clients/client-ranking.js";
import { ClientDirectory } from "../clients/client-directory.js";
import { ProjectRankings } from "../projects/project-ranking.js";

const activeClientsPage = (() => {
  function init() {
    ClientDirectory.loadClientDirectory("activeClientsData");

    ClientRanking.renderTopPaidClients();
    ProjectRankings.renderTopProjects();
  }

  return { init };
})();

export { activeClientsPage };
