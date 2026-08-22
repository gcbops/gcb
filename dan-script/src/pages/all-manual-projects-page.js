import { ClientRanking } from "../clients/client-ranking.js";
import { ProjectDirectory } from "../projects/project-directory.js";
import { ProjectRankings } from "../projects/project-ranking.js";
import { TableClientSelector } from "../tables/client-selector.js";
import { ActivityToday } from "../tables/activity-today.js";

const allManualProjectsPage = (() => {
  let bound = false;

  function init() {
    if (bound) {
      return;
    }

    bound = true;

    ProjectDirectory.init();

    ClientRanking.renderTopPaidClients();
    ProjectRankings.renderTopProjects();

    ActivityToday.setupTaskForm();
    TableClientSelector.init("#client", true);
  }

  function destroy() {
    if (!bound) {
      return;
    }

    bound = false;

    ProjectDirectory.destroy?.();
    ActivityToday.destroy?.();
    TableClientSelector.destroy?.();
  }

  return {
    init,
    destroy,
  };
})();

export { allManualProjectsPage };
