import CustomCarousel from "../components/carousel.js";
import { ChartModule } from "../components/charts.js";
import { ClientActivityTrends } from "../clients/client-activity-trends.js";
import { ClientDataService } from "../clients/client-data-service.js";
import { HourSummary } from "../hours/hour-summary.js";
import { ActivityToday } from "../tables/activity-today.js";
import { TableClientSelector } from "../tables/client-selector.js";
import { DataTableModule } from "../components/data-table.js";
import { AppUtils } from "../utils/utils.js";
import { performanceTargetPage } from "./performance-target-page.js";

const clientActivityPage = (() => {
  let bound = false;

  const mobileQuery = window.matchMedia("(max-width: 767px)");

  let carouselInstance = null;

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

  function handleCarousel() {
    if (mobileQuery.matches) {
      if (carouselInstance) {
        carouselInstance.destroy();
        carouselInstance = null;
      }

      return;
    }

    if (!carouselInstance) {
      carouselInstance = CustomCarousel.init("#infoCarousel");
    }
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
    
    HourSummary.loadTodayChargedHours();
    
    ChartModule.loadChart("daily", false, false, false, false, {
      showAxes: false,
      showGrid: false,
      showPoints: false,
      showTooltip: false,
      showLegend: false,
      showLabel: false,
    });
    
    ClientDataService.renderActiveClients();

    ClientActivityTrends.init();
    
    handleCarousel();
    
    performanceTargetPage.loadTargetProgress();

    mobileQuery.addEventListener("change", handleCarousel);
  }

  function destroy() {
    if (!bound) {
      return;
    }

    document.removeEventListener("gcb:hours-recorded", handleHoursRecorded);

    mobileQuery.removeEventListener("change", handleCarousel);

    TableClientSelector.destroy?.();
    CustomCarousel.destroyAll();

    carouselInstance = null;
    bound = false;
  }

  return {
    init,
    destroy,
  };
})();

export { clientActivityPage };
