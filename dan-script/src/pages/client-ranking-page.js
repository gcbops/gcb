import { clientRankings } from "../clients/client-ranking.js";

const clientRankingsPage = (() => {
  let bound = false;

  function init() {
    if (bound) {
      return;
    }

    bound = true;

    clientRankings.init();
  }

  function destroy() {
    if (!bound) {
      return;
    }

    bound = false;

    clientRankings.destroy?.();
  }

  return {
    init,
    destroy,
  };
})();

export { clientRankingsPage };
