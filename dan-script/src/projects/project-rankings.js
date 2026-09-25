import { AppUtils } from "../utils";

const ProjectRankings = (() => {
  let initialized = false;

  const CACHE_KEY = "projectRankings";

  function init() {
    if (initialized) {
      return;
    }

    initialized = true;

    loadProjectRankings();
  }

  function destroy() {
    if (!initialized) {
      return;
    }

    initialized = false;
  }

  function loadProjectRankings(forceRefresh = false) {
    AppUtils.cachedGScriptCall(
      CACHE_KEY,
      "getProjectRankings",
      [],
      (data) => {
        if (!data) {
          renderError();
          return;
        }

        renderSummary(data.summary);
        renderTopProjects(data.topProjects);
        renderRecentProjects(data.recentProjects);
        renderActivity(data.activity);
        renderClientSummary(data.clientSummary);
      },
      false,
      forceRefresh,
    );
  }

  function renderSummary(summary) {
    if (summary === undefined) {
      AppUtils.cachedGScriptCall(
        CACHE_KEY,
        "getProjectRankings",
        [],
        (data) => {
          renderSummary(data?.summary);
        },
        false,
      );
      return;
    }

    summary = summary || {};

    $("#project-total-count").text(summary.total ?? 0);

    $("#project-active-year-count").text(summary.activeYear ?? 0);

    $("#project-active-month-count").text(summary.activeMonth ?? 0);

    $("#project-new-year-count").text(summary.newYear ?? 0);
  }

  function renderTopProjects(projects) {
    // If no data was supplied, load the project rankings data first.
    if (projects === undefined) {
      AppUtils.cachedGScriptCall(
        CACHE_KEY,
        "getProjectRankings",
        [],
        (data) => {
          renderTopProjects(data?.topProjects);
        },
        false,
      );
      return;
    }

    const $container = $("#top-projects");

    if (!$container.length) {
      return;
    }

    if (!Array.isArray(projects) || !projects.length) {
      $container.html(`
        <div class="text-center text-muted py-4">
          No project data available.
        </div>
      `);
      return;
    }

    $container.html("");

    projects.forEach((project, index) => {
      const name = String(project?.name ?? "").trim();
      const client = String(project?.client ?? "").trim();
      const hours = project?.hours ?? 0;

      const item = document.createElement("div");

      item.className = "project-item";

      item.innerHTML = `
        <div class="project-project">
          <div class="project-project-name">
            ${AppUtils.escapeHtml(name)}
          </div>

          <div class="project-project-meta">
            ${AppUtils.escapeHtml(client)}
          </div>
        </div>

        <div class="project-value">
          ${AppUtils.escapeHtml(String(hours))} hrs
        </div>
      `;

      // item.innerHTML = `
      //   <div class="project-position">
      //     ${index + 1}
      //   </div>

      //   <div class="project-avatar project-icon-primary">
      //     <i class="fa fa-folder"></i>
      //   </div>

      //   <div class="project-project">
      //     <div class="project-project-name">
      //       ${AppUtils.escapeHtml(name)}
      //     </div>

      //     <div class="project-project-meta">
      //       ${AppUtils.escapeHtml(client)}
      //     </div>
      //   </div>

      //   <div class="project-value">
      //     ${AppUtils.escapeHtml(String(hours))} hrs
      //   </div>
      // `;

      $container[0].appendChild(item);
    });
  }

  function renderRecentProjects(projects) {
    const $container = $("#recent-projects");

    if (!$container.length) {return;}

    if (!Array.isArray(projects) || !projects.length) {
      $container.html(`
        <div class="text-center text-muted py-4">
          No recent projects available.
        </div>
      `);
      return;
    }

    $container.html("");

    projects.forEach((project, index) => {
      const name = String(project?.name ?? "").trim();
      const client = String(project?.client ?? "").trim();
      const started = String(project?.started ?? "").trim();

      const item = document.createElement("div");

      item.className = "project-item";

      item.innerHTML = `
        <div class="project-position">
          ${index + 1}
        </div>

        <div class="project-avatar project-icon-info">
          <i class="fa fa-calendar"></i>
        </div>

        <div class="project-project">
          <div class="project-project-name">
            ${AppUtils.escapeHtml(name)}
          </div>

          <div class="project-project-meta">
            ${AppUtils.escapeHtml(client)}
          </div>
        </div>

        <div class="project-value">
          ${AppUtils.escapeHtml(started)}
        </div>
      `;

      $container[0].appendChild(item);
    });
  }

  function renderActivity(activity) {
    activity = activity || {};

    $("#project-activity-year").text(activity.activeYear ?? 0);

    $("#project-activity-year-inactive").text(activity.inactiveYear ?? 0);

    $("#project-activity-month").text(activity.activeMonth ?? 0);

    $("#project-activity-month-inactive").text(activity.inactiveMonth ?? 0);

    $("#project-total-hours").text(
      AppUtils.formatHours(activity.totalHours ?? 0),
    );

    $("#project-average-hours").text(
      AppUtils.formatHours(activity.averageHours ?? 0),
    );
  }

  function renderClientSummary(clients) {
    const $container = $("#project-client-summary");

    if (!$container.length) {return;}

    if (!Array.isArray(clients) || !clients.length) {
      $container.html(`
        <div class="text-center text-muted py-4">
          No client project data available.
        </div>
      `);
      return;
    }

    $container.html("");

    clients.forEach((client, index) => {
      const name = String(client?.name ?? "").trim();
      const projects = Number(client?.projects) || 0;
      const hours = client?.hours ?? 0;

      const item = document.createElement("div");

      item.className = "project-item";

      item.innerHTML = `
        <div class="project-position">
          ${index + 1}
        </div>

        <div class="project-avatar project-icon-primary">
          <i class="fa fa-user"></i>
        </div>

        <div class="project-project">
          <div class="project-project-name">
            ${AppUtils.escapeHtml(name)}
          </div>

          <div class="project-project-meta">
            ${projects} project${projects === 1 ? "" : "s"}
          </div>
        </div>

        <div class="project-value">
          ${AppUtils.escapeHtml(String(hours))} hrs
        </div>
      `;

      $container[0].appendChild(item);
    });
  }

  function renderError() {
    AppUtils.showError("Unable to load project rankings.");
  }

  return {
    init,
    destroy,
    loadProjectRankings,
    renderTopProjects,
    renderSummary,
  };
})();

export { ProjectRankings };
