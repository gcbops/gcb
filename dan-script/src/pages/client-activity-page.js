import { ChartModule } from "../charts.js";
import { ClientActivityTrends } from "../clients/client-activity-trends.js";
import { ClientDataService } from "../clients/client-data-service.js";
import { HourSummary } from "../hours/hour-summary.js";
import { ActivityToday } from "../tables/activity-today.js";
import { TableClientSelector } from "../tables/client-selector.js";
import { DataTableModule } from "../tables/data-table.js";
import { AppUtils } from "../utils.js";

const clientActivityPage = (() => {
  let bound = false;

  function handleHoursRecorded(event) {
    const formData = event.detail;

    if (!formData?.client) {
      return;
    }

    const client = String(formData.client).trim();

    if (!client) {
      return;
    }

    // Invalidate feature-specific caches.
    ActivityToday.clearClientCaches(client);
    AppUtils.resetCacheKeys(ActivityToday.resetableCacheKeyForUpdatingHours);
    ActivityToday.resetYearlyChartCaches();

    // Refresh the table only when it exists.
    const activityTable = DataTableModule.getInstance("#table");

    if (activityTable) {
      ActivityToday.refreshActivityTable(activityTable);
    }

    // Refresh confirmed hours after either recording or editing.
    HourSummary.loadTodayChargedHours();
  }

  function init() {
    if (bound) {
      return;
    }

    bound = true;

    document.addEventListener("gcb:hours-recorded", handleHoursRecorded);

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

    document.removeEventListener("gcb:hours-recorded", handleHoursRecorded);

    TableClientSelector.destroy?.();

    bound = false;
  }

  return {
    init,
    destroy,
  };
})();

export { clientActivityPage };
