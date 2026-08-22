import { DataTableModule } from "../tables/data-table";
import { AppUtils } from "../utils";

const ProjectDirectory = (() => {
  function init() {
    bindEvents();
    loadProjectDirectory();
  }

  function destroy() {
    $(document).off(".projectDirectory");
  }

  function loadProjectDirectory(log = false) {

    const cacheKey = "allProjects";
    const cached = fetchCachedProjects(cacheKey);

    if (cached) {
      renderProjectDirectory(cached, log);
      refreshProjectDirectory(cacheKey, cached, log);
      return;
    }

    fetchProjectDirectory(cacheKey, log);
  }

  function fetchCachedProjects(cacheKey) {
    const cached = AppUtils.cacheGet(cacheKey);

    return Array.isArray(cached) && cached.length ? cached : null;
  }

  function fetchProjectDirectory(cacheKey, log) {
    AppUtils.cachedGScriptCall(
      cacheKey,
      "getProjects",
      [],
      (data) => {
        if (!Array.isArray(data)) {
          AppUtils.showError("Something went wrong!");
          return;
        }

        renderProjectDirectory(data, log);
      },
      log,
    );
  }

  function refreshProjectDirectory(cacheKey, cached, log) {
    AppUtils.cachedGScriptCall(
      cacheKey,
      "getProjects",
      [],
      (fresh) => {
        if (!Array.isArray(fresh)) {
          return;
        }

        if (JSON.stringify(fresh) !== JSON.stringify(cached)) {
          renderProjectDirectory(fresh, log);
        }
      },
      log,
    );
  }

  function renderProjectDirectory(data, log) {
    const tbody = document.getElementById("dataBody");

    if (!tbody) {
      if (log) {
        console.log("[ProjectDirectory] tbody not found");
      }
      return;
    }

    tbody.innerHTML = "";

    if (!Array.isArray(data) || data.length === 0) {
      tbody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center text-muted">
          No projects found.
        </td>
      </tr>
    `;

      return;
    }

    data.forEach((project, index) => {
      tbody.appendChild(createProjectDirectoryRow(project, index));
    });

    /*
     * Initialize after rows are rendered.
     */
    DataTableModule.init("Projects", "#projectsTable");

    if (log) {
      console.log("[ProjectDirectory] Rendered", data.length, "projects");
    }
  }

  function createProjectDirectoryRow(project, index) {
    const tr = document.createElement("tr");

    const colA = project[0] ?? "";
    const colB = project[1] ?? "";
    const colC = project[2] ?? "";

    tr.innerHTML = `
    <td class="text-center text-muted font-weight-bold">
      ${index + 1}
    </td>

    <td>
      ${AppUtils.escapeHtml(colA)}
    </td>

    <td class="text-center">
      ${AppUtils.escapeHtml(colB)}
    </td>

    <td class="text-center">
      ${AppUtils.escapeHtml(colC)}
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
      .on("click.projectDirectory", "#refresh-projects", function () {
        fetchProjectDirectory("allProjects");
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
    destroy
  };
})();

export { ProjectDirectory };
