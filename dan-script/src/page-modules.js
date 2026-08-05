import {
  allClientsPageModule,
  upsellOverviewPageModule,
  hourlyOverviewPageModule,
  reportsExportDataPageModule,
  reportsMonthlyReportModule,
  reportsAnnualReportModule,
  ConfigPageModule,
} from "./modules.js";

const PageModules = {
  allClients: allClientsPageModule,
  upsellOverview: upsellOverviewPageModule,
  hourlyOverview: hourlyOverviewPageModule,
  reportsExportData: reportsExportDataPageModule,
  reportsMonthlyReport: reportsMonthlyReportModule,
  reportsAnnualReport: reportsAnnualReportModule,
  settingsConfiguration: ConfigPageModule,
};

export { PageModules };