import { ProjectRankings } from "../projects/project-rankings";


const projectRankingsPage = (() => {
  let bound = false;

  function init() {
    if (bound) {
      return;
    }

    bound = true;

    ProjectRankings.init();
  }

  function destroy() {
    if (!bound) {
      return;
    }

    bound = false;

    ProjectRankings.destroy?.();
  }

  return {
    init,
    destroy,
  };
})();

export { projectRankingsPage };
