import { ClientRanking } from "../clients/client-ranking.js";

const clientRankingPage = (() => {
  let bound = false;

  function init() {
    if (bound) {
      return;
    }

    bound = true;

    ClientRanking.init();
  }

  function destroy() {
    if (!bound) {
      return;
    }

    bound = false;

    ClientRanking.destroy?.();
  }

  return {
    init,
    destroy,
  };
})();

export { clientRankingPage };
