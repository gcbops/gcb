import { ChartModule } from "../charts.js";
import { HourSummary } from "../hours/hour-summary.js";
import { clientRankings } from "../clients/client-ranking.js";
import { ProjectRankings } from "../projects/project-rankings.js";
import { PerformanceMetrics } from "../performance/performance-metrics.js";
import { ClientDataService } from "../clients/client-data-service.js";
import { TableFilterService } from "../tables/table-filter-service.js";
import { ProfilePopoverModule } from "../profile/profile-popover.js";

const HomePage = (() => {
  let initialized = false;

  function init() {
    if (initialized) {
      return;
    }

    initialized = true;

    loadData();
    bindEvents();
  }

  function loadData() {
    HourSummary.loadHoursSummary("#hours-summary");

    ChartModule.loadChart("monthly");
    ChartModule.loadPrevYearCombinedChart();
    PerformanceMetrics.loadPerformanceSummary(
      "current-performance-summary",
      "current-paid-growth",
      "current",
    );

    PerformanceMetrics.loadPerformanceSummary(
      "previous-performance-summary",
      "previous-paid-growth",
      "previous",
    );

    HourSummary.loadTodayChargedHours();
    ChartModule.loadChart("daily", false, false, false, false, {
      showAxes: false,
      showGrid: false,
      showPoints: false,
      showTooltip: false,
      showLegend: false,
      showLabel: false,
    });
    clientRankings.renderTopPaidClients();
    ProjectRankings.renderTopProjects();

    ClientDataService.renderActivePaidOwedClients(true);
  }

  function bindEvents() {
    document.addEventListener("click", handleClientDetailsClick);
  }

  function destroy() {
    if (!initialized) {
      return;
    }

    initialized = false;

    TableFilterService.destroy("categoryDtFilter");
    document.removeEventListener("click", handleClientDetailsClick);
  }

  function handleClientDetailsClick(event) {
    const trigger = event.target.closest("[data-client-details]");

    if (!trigger) {
      return;
    }

    const clientName = trigger.dataset.clientName?.trim();

    if (!clientName) {
      return;
    }

    ProfilePopoverModule.openClientDetails(clientName);
  }

  return { init, destroy };
})();

export { HomePage };

