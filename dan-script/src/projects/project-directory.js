import { DataTableModule } from "../tables/data-table";
import { AppUtils } from "../utils";

const ProjectDirectory = (() => {
  const TABLE_ID = "#projectsTable";
  const TABLE_TITLE = "Projects";
  const CACHE_KEY = "allProjects";

  function init() {
    bindEvents();
    loadProjectDirectory();
  }

  function destroy() {
    $(document).off(".projectDirectory");

    DataTableModule.destroy(TABLE_ID);
  }

  function loadProjectDirectory(log = false) {
    const logMessage = (...args) => {
      if (log) {
        console.log(...args);
      }
    };

    /*
     * Show loader immediately while cached/server data is being loaded.
     */
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

        renderProjectDirectory(data, logMessage);
      },
      log,
    );
  }

  function renderProjectDirectory(data, log) {
    if (!Array.isArray(data)) {
      DataTableModule.showError(TABLE_ID, "Unable to load projects.");

      return;
    }

    /*
     * Render rows before DataTables initialization.
     */
    DataTableModule.renderRows(TABLE_ID, data, createProjectDirectoryRow);

    /*
     * Initialize DataTable after the tbody is populated.
     *
     * DataTableModule.init() already destroys any
     * previous instance before initializing.
     */
    DataTableModule.init(TABLE_TITLE, TABLE_ID, false);

    log("[ProjectDirectory] Rendered", data.length, "projects");
  }

  function createProjectDirectoryRow(project, index) {
    const tr = document.createElement("tr");

    const projectName = project[0] ?? "";
    const clientName = project[1] ?? "";
    const hours = project[2] ?? "";

    tr.innerHTML = `
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

    return tr;
  }

  function bindEvents() {
    $(document)
      .off("click.projectDirectory", "#add-new-project")
      .on("click.projectDirectory", "#add-new-project", handleAddProjectClick);

    $(document)
      .off("click.projectDirectory", "#refresh-projects")
      .on("click.projectDirectory", "#refresh-projects", () => {
        loadProjectDirectory(true);
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
