import { TableModule } from "../tables.js";
import { ClientRanking } from "../clients/client-ranking.js";
import { ProjectDirectory } from "../projects/project-directory.js";
import { ProjectRankings } from "../projects/project-ranking.js";

const allManualProjectsPage = (() => {
  function init() {
    ProjectDirectory.loadProjectDirectory();

    ClientRanking.renderTopPaidClients();
    ProjectRankings.renderTopProjects();

    TableModule.setupTaskForm();
    TableModule.loadClients("#client", true);
  }

  return { init };
})();

export { allManualProjectsPage };
