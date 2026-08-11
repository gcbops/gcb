import { ClientDataService } from "../clients/client-data-service.js";
import { HourSummary } from "../hours/hour-summary.js";
import { TableClientSelector } from "../tables/client-selector.js";

const addManualHoursPage = (() => {
  function init() {
          HourSummary.loadHourTotals();
          ClientDataService.renderClientDataByStatus("Client Tracker - Today", "Activity Today", "Activity Today");
          TableClientSelector.initClientSelector();
  }
  return { init };
})();

export { addManualHoursPage };