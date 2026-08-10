import { allClientsPage } from "./pages/all-clients-page.js";
import { upsellOverviewPage } from "./pages/upsell-overview-page.js";
import { hourlyOverviewPage } from "./pages/hourly-overview-page.js";
import { reportsExportDataPage } from "./pages/reports-export-data-page.js";
import { reportsMonthlyReportPage } from "./pages/reports-monthly-report-page.js";
import { reportsAnnualReportPage } from "./pages/reports-annual-report-page.js";
import { settingsConfigurationPage } from "./pages/config-page.js";

const PageModules = {
  allClients: allClientsPage,
  upsellOverview: upsellOverviewPage,
  hourlyOverview: hourlyOverviewPage,
  reportsExportData: reportsExportDataPage,
  reportsMonthlyReport: reportsMonthlyReportPage,
  reportsAnnualReport: reportsAnnualReportPage,
  settingsConfiguration: settingsConfigurationPage,
};

export { PageModules };