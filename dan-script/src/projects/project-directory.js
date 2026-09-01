import { ReportActions } from "../reports/actions";
import { DataTableModule } from "../tables/data-table";
import { AppUtils } from "../utils";

const ProjectDirectory = (() => {
  let initialized = false;

  const TABLE_ID = "#projectsTable";
  const TABLE_TITLE = "Projects";
  const CACHE_KEY = "allProjects";

  function init() {
    if (initialized) {
      return;
    }

    initialized = true;

    bindEvents();
    loadProjectDirectory();
  }

  function destroy() {
    if (!initialized) {
      return;
    }

    initialized = false;

    $(document).off(".projectDirectory");
  }

  function loadProjectDirectory(log = false, refresh = false) {
    const logMessage = (...args) => {
      if (log) {
        console.log(...args);
      }
    };

    DataTableModule.showLoader(TABLE_ID);

    AppUtils.cachedGScriptCall(
      CACHE_KEY,
      "getProjects",
      [],
      (data) => {
        if (!Array.isArray(data)) {
          DataTableModule.showError(TABLE_ID, "Unable to load projects.");

          return;
        }

        renderProjectDirectory(data, logMessage, refresh);
      },
      log,
      refresh,
    );
  }

  function renderProjectDirectory(data, log, refresh = false) {
    if (!Array.isArray(data)) {
      DataTableModule.showError(TABLE_ID, "Unable to load projects.");

      return;
    }

    DataTableModule.renderRows(TABLE_ID, data, createProjectDirectoryRow);

    DataTableModule.init(TABLE_TITLE, TABLE_ID, false);

    if (typeof log === "function") {
      log("[ProjectDirectory] Rendered", data.length, "projects");
    }

    if (refresh) {
      AppUtils.showDashboardToast(
        "Projects refreshed successfully.",
        "success",
      );
    }
  }

  function createProjectDirectoryRow(project, index) {
    const row = document.createElement("tr");

    const projectName = String(project?.[0] ?? "").trim();
    const clientName = String(project?.[1] ?? "").trim();
    const hours = String(project?.[2] ?? "").trim();

    row.innerHTML = `
      <td class="text-center text-muted font-weight-bold">
        ${index + 1}
      </td>

      <td class="text-center">
        ${AppUtils.escapeHtml(projectName)}
      </td>

      <td class="text-center">
        ${AppUtils.escapeHtml(clientName)}
      </td>

      <td class="text-center">
        ${AppUtils.escapeHtml(hours)}
      </td>
    `;

    return row;
  }

  function refreshProjectDirectory(log = false) {
    AppUtils.cacheClear(CACHE_KEY);
    loadProjectDirectory(false, true);
  }

  function bindEvents() {
    /*
     * Add Project
     */
    $(document)
      .off("click.projectDirectory", "#add-new-project")
      .on("click.projectDirectory", "#add-new-project", () => {
        ReportActions.confirmAction(
          "addProjectDirectory",
          "Add Initial Hours?",
          "To register a new project, you must first assign its initial baseline hours. Do you want to proceed?",
          handleAddProjectClick,
        );
      });

    /*
     * Refresh Project Directory
     */
    $(document)
      .off("click.projectDirectory", "#refresh-projects")
      .on("click.projectDirectory", "#refresh-projects", () => {
        ReportActions.confirmAction(
          "refreshProjectDirectory",
          "Refresh Project Directory?",
          "This will pull the latest spreadsheet logging updates and sync the directory records. Proceed?",
          () => {
            refreshProjectDirectory();
          },
        );
      });
  }

  function handleAddProjectClick() {
    AppUtils.openDrawer("#drawerManualAdd", {
      contentClass: "drawer-grid-5",
    });

    $("#taskForm .form-group").first().removeClass("element-hidden");
  }

  return {
    init,
    destroy,
    loadProjectDirectory,
  };
})();

export { ProjectDirectory };
