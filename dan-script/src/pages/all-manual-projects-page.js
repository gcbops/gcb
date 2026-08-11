import { TableModule } from "../tables/tables.js";
import { ClientRanking } from "../clients/client-ranking.js";
import { ProjectDirectory } from "../projects/project-directory.js";
import { ProjectRankings } from "../projects/project-ranking.js";
import { TableClientSelector } from "../tables/client-selector.js";

const allManualProjectsPage = (() => {
  function init() {
    ProjectDirectory.loadProjectDirectory();

    ClientRanking.renderTopPaidClients();
    ProjectRankings.renderTopProjects();

    TableModule.setupTaskForm();
    TableClientSelector.initClientSelector("#client", true);
  }

  return { init };
})();

export { allManualProjectsPage };
