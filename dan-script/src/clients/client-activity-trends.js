import { AppUtils } from "../utils.js";

const ClientActivityTrends = (() => {
  const CONTAINER_ID = "client-activity-trends";
  const CACHE_KEY = "clientActivityTrends";

  const trends = [
    {
      key: "activeClients",
      label: "Active Clients",
      icon: "pe-7s-users",
      color: "primary",
      suffix: "",
    },
    {
      key: "hoursLogged",
      label: "Hours Logged",
      icon: "pe-7s-clock",
      color: "success",
      suffix: " hrs",
    },
    {
      key: "tasksCompleted",
      label: "Tasks Completed",
      icon: "pe-7s-check",
      color: "info",
      suffix: "",
    },
    {
      key: "projectsActive",
      label: "Projects Active",
      icon: "pe-7s-portfolio",
      color: "warning",
      suffix: "",
    },
    {
      key: "newClients",
      label: "New Clients",
      icon: "pe-7s-add-user",
      color: "primary",
      suffix: "",
      fixedComparison: "this year",
    },
    {
      key: "newProjects",
      label: "New Projects",
      icon: "pe-7s-exapnd2 ",
      color: "secondary",
      suffix: "",
      fixedComparison: "this year",
    },
  ];

  function init() {
    load();
  }

  function load() {
    AppUtils.cachedGScriptCall(
      CACHE_KEY,
      "getClientActivityTrends",
      [],
      (data) => {
        if (!data || typeof data !== "object") {
          renderEmpty();
          return;
        }

        render(data);
      },
    );
  }

  function render(data) {
    const container = document.getElementById(CONTAINER_ID);

    if (!container) {
      console.warn(
        `[ClientActivityTrends] Container not found: ${CONTAINER_ID}`,
      );
      return;
    }

    const comparison = getComparisonPeriod();

    container.innerHTML = trends
      .map((trend) => {
        const value = Number(data[trend.key]) || 0;

        const formattedValue = formatValue(value, trend.suffix);

        const valueClass = getTrendColor(trend.key, value);

        const badgeClass = `${trend.color}-subtle`;

        const textClass = `text-${trend.color}`;

        const comparisonText = trend.fixedComparison || comparison;

        return `
          <div class="row align-items-center mb-4">
            <div class="col-8">
              <div class="d-flex align-items-center">

                <div>
                  <div
                    class="fs-5 bsb-w-50 bsb-h-50
                    bg-${badgeClass} ${textClass}
                    rounded-2 d-flex align-items-center
                    justify-content-center me-3"
                  >
                    <i class="bi ${trend.icon}"></i>
                  </div>
                </div>

                <div>
                  <h6 class="m-0">
                    ${trend.label}
                  </h6>

                  <p class="text-secondary m-0 fs-7">
                    ${comparisonText}
                  </p>
                </div>

              </div>
            </div>

            <div class="col-4">
              <h6
                class="fs-7 d-flex
                align-items-center
                justify-content-end m-0"
              >
                <span
                  class="${valueClass} rounded-2
                  py-1 px-2"
                >
                  ${formattedValue}
                </span>
              </h6>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function formatValue(value, suffix = "") {
    const sign = value > 0 ? "+" : "";

    const formatted = Number.isInteger(value)
      ? value.toLocaleString()
      : value.toLocaleString(undefined, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        });

    return `${sign}${formatted}${suffix}`;
  }

  function getComparisonPeriod() {
    const now = new Date();
    const day = now.getDate();

    /*
     * Week 1:
     *   since last week
     *
     * Week 2:
     *   since last week
     *
     * Week 3:
     *   since last 2 weeks
     *
     * Week 4+:
     *   since last 3 weeks
     *
     * This prevents the comparison text from
     * becoming misleading early in the month.
     */

    if (day <= 7) {
      return "since last week";
    }

    if (day <= 14) {
      return "since last week";
    }

    if (day <= 21) {
      return "since last 2 weeks";
    }

    return "since last 3 weeks";
  }

  function getTrendColor(key, value) {
    /*
     * For most metrics:
     *   positive = good
     *   negative = bad
     *
     * For these:
     *   lower is better.
     */

    if (value === 0) {
      return "bg-secondary-subtle text-secondary";
    }

    return value > 0
      ? "bg-success-subtle text-success"
      : "bg-danger-subtle text-danger";
  }

  function renderEmpty() {
    const container = document.getElementById(CONTAINER_ID);

    if (!container) {return;}

    container.innerHTML = `
      <div class="text-center text-secondary py-4">
        No client activity trends available.
      </div>
    `;
  }

  function refresh() {
    AppUtils.cacheClear(CACHE_KEY);
    load();
  }

  return {
    init,
    refresh,
  };
})();

export { ClientActivityTrends };
