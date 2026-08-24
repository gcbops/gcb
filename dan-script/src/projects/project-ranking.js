import { AppUtils } from "../utils";

const ProjectRankings = (() => {

  function renderTopProjects() {
    renderProjectRanking({
      cacheKey: "topProjects",
      method: "getTopProjects",
      listSelector: "#top-projects",
      avatarClass: "bg-malibu-beach",
      sortFn: sortTopProjects,
      iconClass: "fas fa-briefcase",
      iconColor: "text-warning",
    });
  }

  function renderLowestProjects() {
    renderProjectRanking({
      cacheKey: "lowestProjects",
      method: "getTopProjects",
      listSelector: "#lowest-projects",
      avatarClass: "bg-love-kiss",
      sortFn: sortLowestProjects,
      iconClass: "fas fa-exclamation-circle",
      iconColor: "text-danger",
    });
  }

  function renderProjectRanking(config) {
    AppUtils.cachedGScriptCall(config.cacheKey, config.method, [], (data) => {
      if (!Array.isArray(data) || !data.length) {
        return;
      }

      const list = document.querySelector(config.listSelector);

      if (!list) {
        return;
      }

      list.innerHTML = "";

      renderProjectList(list, config.sortFn([...data]), config);
    });
  }

  function renderProjectList(list, projects, config) {
    projects.forEach((project) => {
      list.appendChild(createProjectItem(project, config));
    });
  }

  function createProjectItem(project, config) {
    const [projectName, hours, client] = project;

    const li = document.createElement("li");
    li.className = "list-group-item";

    li.innerHTML = `
      <div class="widget-content p-0">
        <div class="widget-content-wrapper">

          <div class="widget-content-left me-3">
            <div
              class="avatar-circle swatch-holder swatch-holder-lg ${config.avatarClass}
              text-white rounded-circle d-flex align-items-center justify-content-center"
              style="width:42px;height:42px;font-weight:600;">
              ${AppUtils.getInitials(client)}
            </div>
          </div>

          <div class="widget-content-left">
            <div class="widget-heading">
              ${projectName}
            </div>

            <div class="widget-subheading">
              ${client}
            </div>
          </div>

          <div class="widget-content-right font-weight-bold">
            <div class="font-size-xs text-muted">
              <span>${hours}</span>
              <small class="${config.iconColor} ps-2">
                <i class="${config.iconClass}"></i>
              </small>
            </div>
          </div>

        </div>
      </div>
    `;

    return li;
  }

  function sortTopProjects(data) {
    return data.sort((a, b) => (b[1] || 0) - (a[1] || 0)).slice(0, 10);
  }

  function sortLowestProjects(data) {
    return data.sort((a, b) => (a[1] || 0) - (b[1] || 0)).slice(0, 10);
  }

  return {
    renderTopProjects,
    renderLowestProjects,
  };
})();

export { ProjectRankings };
