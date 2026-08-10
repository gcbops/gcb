import { ClientDataService } from "../clients/client-data-service.js";
import { HourSummary } from "../hours/hour-summary.js";
import { TableModule } from "../tables.js";

const addManualHoursPage = (() => {
  function init() {
          HourSummary.loadHourTotals();
          ClientDataService.renderClientDataByStatus("Client Tracker - Today", "Activity Today", "Activity Today");
          TableModule.loadClients();
  }
  return { init };
})();

export { addManualHoursPage };