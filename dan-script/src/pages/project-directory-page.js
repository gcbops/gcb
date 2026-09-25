import { ProjectDirectory } from "../projects/project-directory";

const projectDirectoryPage = (() => {
  let bound = false;

  function init() {
    if (bound) {
      return;
    }

    bound = true;

    ProjectDirectory.init();
  }

  function destroy() {
    if (!bound) {
      return;
    }

    bound = false;

    ProjectDirectory.destroy?.();
  }

  return {
    init,
    destroy,
  };
})();

export { projectDirectoryPage };
