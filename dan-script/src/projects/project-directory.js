import { DataTableModule } from "../tables/data-table";
import { AppUtils } from "../utils";
import { ProjectRankings } from "./project-rankings";

const ProjectDirectory = (() => {
  let initialized = false;

  const TABLE_ID = "#projectsTable";
  const TABLE_TITLE = "Project Directory";
  const CACHE_KEY = "allProjects";

  function init() {
    if (initialized) {
      return;
    }

    initialized = true;

    bindEvents();
    ProjectRankings.renderSummary();
    loadProjectDirectory();
  }

  function destroy() {
    if (!initialized) {
      return;
    }

    initialized = false;

    $(document).off(".projectDirectory");

    DataTableModule.destroy(TABLE_ID);
  }

  function loadProjectDirectory(log = false, refresh = false, loading = false) {
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

        renderProjectDirectory(data, logMessage, refresh, loading);
      },
      log,
      refresh,
    );
  }

  function renderProjectDirectory(data, log, refresh = false, loading = false) {
    if (!Array.isArray(data)) {
      DataTableModule.showError(TABLE_ID, "Unable to load projects.");

      return;
    }

    if (!data.length) {
      DataTableModule.showEmpty(TABLE_ID, "No projects found.");

      return;
    }

    DataTableModule.renderRows(TABLE_ID, data, createProjectDirectoryRow);

    DataTableModule.init(TABLE_TITLE, TABLE_ID, false);

    if (typeof log === "function") {
      log("[ProjectDirectory] Rendered", data.length, "projects");
    }

    if (refresh && loading) {
      AppUtils.showDashboardToast(
        "Projects refreshed successfully.",
        "success",
      );
      loading.restore();
    }
  }

  function createProjectDirectoryRow(project, index) {
    const row = document.createElement("tr");

    const projectName = String(project?.[0] ?? "").trim();
    const hours = String(project?.[1] ?? "").trim();
    const activeYear = String(project?.[2] ?? "").trim();
    const activeMonth = String(project?.[3] ?? "").trim();
    const clientName = String(project?.[4] ?? "").trim();
    const startedDate = String(project?.[5] ?? "").trim();

    row.innerHTML = `
    <td class="text-center text-muted font-weight-bold">
      ${index + 1}
    </td>

    <td>
      ${AppUtils.escapeHtml(projectName)}
    </td>

    <td>
      ${AppUtils.escapeHtml(clientName)}
    </td>

    <td class="text-center">
      ${AppUtils.escapeHtml(hours)}
    </td>

    <td class="text-center">
      ${renderStatusBadge(activeYear)}
    </td>

    <td class="text-center">
      ${renderStatusBadge(activeMonth)}
    </td>

    <td class="text-center">
      ${AppUtils.escapeHtml(startedDate)}
    </td>
  `;

    return row;
  }

  function renderStatusBadge(value) {
    const normalized = String(value || "")
      .trim()
      .toLowerCase();

    if (normalized === "yes") {
      return `
        <span class="badge bg-success-subtle text-success">
          Yes
        </span>
      `;
    }

    if (normalized === "no") {
      return `
        <span class="badge bg-secondary-subtle text-secondary">
          No
        </span>
      `;
    }

    return `
      <span class="badge bg-light text-muted">
        ${AppUtils.escapeHtml(value || "—")}
      </span>
    `;
  }

  function refreshProjectDirectory(button) {
    const loading = AppUtils.setButtonLoading(button, false, true);

    AppUtils.cacheClear(CACHE_KEY);

    loadProjectDirectory(false, true, loading);
  }

  function bindEvents() {
    /*
     * Add Project
     */
    $(document)
      .off("click.projectDirectory", '[data-client-action="add-project"]')
      .on(
        "click.projectDirectory",
        '[data-client-action="add-project"]',
        function () {
          AppUtils.confirmAction(
            "addProjectDirectory",
            "Add Initial Hours?",
            "To register a new project, you must first assign its initial baseline hours. Do you want to proceed?",
            handleAddProjectClick,
          );
        },
      );

    /*
     * Refresh Project Directory
     */
    $(document)
      .off("click.projectDirectory", '[data-client-action="sync"]')
      .on("click.projectDirectory", '[data-client-action="sync"]', function () {
        const button = this;

        AppUtils.confirmAction(
          "refreshProjectDirectory",
          "Refresh Project Directory?",
          "This will pull the latest spreadsheet logging updates and sync the directory records. Proceed?",
          () => {
            refreshProjectDirectory(button);
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
