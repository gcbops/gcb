import { ClientRanking } from "../clients/client-ranking.js";
import { ProjectDirectory } from "../projects/project-directory.js";
import { ProjectRankings } from "../projects/project-ranking.js";
import { TableClientSelector } from "../tables/client-selector.js";
import { ActivityToday } from "../tables/activity-today.js";

const allManualProjectsPage = (() => {
  function init() {
    ProjectDirectory.loadProjectDirectory();

    ClientRanking.renderTopPaidClients();
    ProjectRankings.renderTopProjects();

    ActivityToday.setupTaskForm();
    TableClientSelector.initClientSelector("#client", true);
  }

  return { init };
})();

export { allManualProjectsPage };
