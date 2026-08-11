import { RouterModule } from "../routers.js";
import { AppUtils } from "../utils.js";
import { ClientRanking } from "../clients/client-ranking.js";
import { ClientDirectory } from "../clients/client-directory.js";
import { ProjectRankings } from "../projects/project-ranking.js";
import { TableClientSelector } from "../tables/client-selector.js";

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

            AppUtils.showDashboardToast("Creating new sheet ...", "info");

            AppUtils.submitForm({
              gscriptFunc: "createClientSheetFromDialog",
              data: { name: clientName },
              $btn: $submitBtn,
              onSuccess: () => {
                AppUtils.showDashboardToast("Sheet created successfully!", "success");

                google.script.run
                  .withFailureHandler(() =>
                    AppUtils.showError("Syncing error!"),
                  )
                  .syncClientSheetList();

                AppUtils.cacheClear("allClientsData");

                if (RouterModule.getCurrentPage() === "addManualHours") {
                  TableClientSelector.initClientSelector();
                }

                ClientDirectory.loadClientDirectory("allClientsData");

                $("#sheet_name").val("");
              }
            });
          });

      });
  };

  const loadData = () => {
    ClientDirectory.loadClientDirectory("allClientsData");
    ClientRanking.renderTopPaidClients();
    ProjectRankings.renderTopProjects();
  };

  return { init, destroy };
})();

export { allClientsPage };