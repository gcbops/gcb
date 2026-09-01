import { RouterModule } from "../routers.js";
import { AppUtils } from "../utils.js";
import { ClientRanking } from "../clients/client-ranking.js";
import { ClientDirectory } from "../clients/client-directory.js";
import { ProjectRankings } from "../projects/project-ranking.js";
import { TableClientSelector } from "../tables/client-selector.js";
import { ReportActions } from "../reports/actions.js";

const allClientsPage = (() => {
  let bound = false;

  const init = () => {
    if (bound) {return;}
    bound = true;

    bindActions();
    loadData();
  };

  const destroy = () => {
    if (!bound) {return;}
    bound = false;

    // remove only this module’s events
    $(document).off("click.allClients");
    $(document).off("submit.allClients");

    ClientDirectory.destroy?.();
    TableClientSelector.destroy?.();
  };

  const bindActions = () => {

    $(document)
      .off("click.allClients", "#add-new-client-sheet")
      .on("click.allClients", "#add-new-client-sheet", function () {
        AppUtils.openDrawer("#drawerClientAdd");

        const $addClientForm = $("#addClientForm");

        $addClientForm
          .off("submit.allClients")
          .on("submit.allClients", function (e) {
            e.preventDefault();

            const $submitBtn = $(this).find('button[type="submit"]');
            const clientName = $("#sheet_name").val().trim();

            if (!clientName) {
              AppUtils.showError("Client name is required!");
              return;
            }

            // Added confirmation step before form execution
            ReportActions.confirmAction(
              "addClientSheet",
              "Register New Client?",
              `Are you sure you want to add "${clientName}" to the record?`,
              () => {
                AppUtils.submitForm({
                  gscriptFunc: "createClientSheet",
                  data: { name: clientName },
                  $btn: $submitBtn,
                  loadingText: "Creating new client sheet...",
                  onSuccess: () => {
                    AppUtils.showDashboardToast(
                      "Sheet created successfully!",
                      "success",
                    );

                    google.script.run
                      .withFailureHandler(() =>
                        AppUtils.showError("Syncing error!"),
                      )
                      .syncClientSheetList();

                    AppUtils.cacheClear("allClientsData");

                    if (RouterModule.getCurrentPage() === "addManualHours") {
                      TableClientSelector.init();
                    }

                    ClientDirectory.init("allClientsData");

                    $("#sheet_name").val("");
                  },
                });
              },
            );
          });
      })

      .off("click.allClients", "#sync-clients-list")
      .on("click.allClients", "#sync-clients-list", function () {
        ReportActions.confirmAction(
          "syncClientsList",
          "Synchronize Client Directory?",
          "This will pull down the latest names, and sheet records from the main hub spreadsheet. Proceed?",
          () => {
            ClientDirectory.refreshClientDirectory("allClientsData", () => {
              AppUtils.showDashboardToast(
                "Clients refreshed successfully.",
                "success",
              );
            });
          },
        );
      });

  };

  const loadData = () => {
    ClientDirectory.init("allClientsData");
    ClientRanking.renderTopPaidClients();
    ProjectRankings.renderTopProjects();
  };

  return { init, destroy };
})();

export { allClientsPage };