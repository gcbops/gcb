import { ClientDataService } from "../clients/client-data-service.js";
import { HourSummary } from "../hours/hour-summary.js";
import { TableClientSelector } from "../tables/client-selector.js";

const addManualHoursPage = (() => {
  let bound = false;

  function init() {
    if (bound) {
      return;
    }

    bound = true;

    HourSummary.loadHourTotals();

    ClientDataService.renderClientDataByStatus(
      "Client Tracker - Today",
      "Activity Today",
      "Activity Today",
    );

    TableClientSelector.init();
  }

  function destroy() {
    if (!bound) {
      return;
    }

    bound = false;

    TableClientSelector.destroy?.();
  }

  return {
    init,
    destroy,
  };
})();

export { addManualHoursPage };
