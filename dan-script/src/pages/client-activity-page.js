import { ChartModule } from "../charts.js";
import { ClientActivityTrends } from "../clients/client-activity-trends.js";
import { ClientDataService } from "../clients/client-data-service.js";
import { HourSummary } from "../hours/hour-summary.js";
import { TableClientSelector } from "../tables/client-selector.js";

const clientActivityPage = (() => {
  let bound = false;

  function init() {
    if (bound) {
      return;
    }

    bound = true;

    ClientDataService.renderClientDataByStatus(
      "Client Tracker - Today",
      "Activity Today",
      "Activity Today",
    );

    TableClientSelector.init();

    ClientDataService.renderActiveClients();
    
    HourSummary.loadTodayChargedHours();
    ChartModule.loadChart("daily", false, false, false, false, {
      showAxes: false,
      showGrid: false,
      showPoints: false,
      showTooltip: false,
      showLegend: false,
      showLabel: false,
    });
    ClientActivityTrends.init();
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

export { clientActivityPage };
