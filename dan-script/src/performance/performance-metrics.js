import { AppUtils } from "../utils";

const PerformanceMetrics = (() => {
  const WIDGET_SUFFIX = {
    current: "1",
    previous: "2",
  };

  const COLORS = {
    current: [
      "bg-arielle-smile",
      "bg-sunny-morning",
      "bg-ripe-malin",
      "bg-grow-early",
    ],

    previous: [
      "bg-deep-blue",
      "bg-tempting-azure",
      "bg-ripe-malin",
      "bg-grow-early",
    ],
  };

  function loadPerformanceSummary(containerId, growthId, yearType) {
    const container = document.getElementById(containerId);
    const growthEl = document.getElementById(growthId);

    if (!container) {
      console.warn("[PerformanceMetrics] Container not found:", containerId);
      return;
    }

    const suffix = WIDGET_SUFFIX[yearType];

    if (!suffix) {
      console.error("[PerformanceMetrics] Unknown year type:", yearType);
      return;
    }

    const cacheKey = `performanceSummary_${yearType}`;

    resetPerformanceSummary(container, growthEl);

    AppUtils.cachedGScriptCall(
      cacheKey,
      "getPerformanceSummary",
      [yearType],
      (data) => {

        if (!data || !Array.isArray(data.percentages)) {
          console.warn("[PerformanceMetrics] Invalid data:", data);

          setPerformanceError(container, growthEl);

          return;
        }

        renderPerformanceSummary(
          container,
          growthEl,
          suffix,
          data,
          COLORS[yearType],
        );
      },
    );
  }

  function resetPerformanceSummary(container, growthEl) {
    if (growthEl) {
      growthEl.textContent = "Loading...";
    }

    container.querySelectorAll(".widget-numbers").forEach((el) => {
      el.textContent = "0%";
    });

    container.querySelectorAll(".progress-bar").forEach((el) => {
      el.style.width = "0%";
      el.setAttribute("aria-valuenow", "0");
    });
  }

  function setPerformanceError(container, growthEl) {
    container.querySelectorAll(".widget-numbers").forEach((el) => {
      el.textContent = "-";
    });

    if (growthEl) {
      growthEl.textContent = "-";
    }
  }

  function renderPerformanceSummary(container, growthEl, suffix, data, colors) {
    const { percentages, paidGrowth } = data;

    percentages.forEach(([label, value], index) => {
      const number = index + 1;

      const percentId = `percent-${number}-${suffix}`;

      const labelId = `label-${number}-${suffix}`;

      const progressId = `progress-${number}-${suffix}`;

      const percentEl = document.getElementById(percentId);

      const labelEl = document.getElementById(labelId);

      const progressEl = document.getElementById(progressId);

      const percent = parseFloat(value || 0).toFixed(1);

      if (percentEl) {
        percentEl.textContent = `${percent}%`;
      }

      if (labelEl) {
        labelEl.textContent =
          index >= 2 ? label.split(" ").slice(1).join(" ") : label;
      }

      if (progressEl) {
        const color = colors[index % colors.length];

        progressEl.style.width = `${percent}%`;

        progressEl.setAttribute("aria-valuenow", percent);

        progressEl.className = `progress-bar ${color}`;
      }
    });

    renderPaidGrowth(growthEl, paidGrowth);
  }

  function renderPaidGrowth(growthEl, paidGrowth) {
    if (!growthEl) {
      return;
    }

    const growthValue = parseFloat(paidGrowth || 0).toFixed(2);

    let growthClass;
    let growthIcon;

    if (growthValue > 0) {
      growthClass = "text-success";
      growthIcon = '<i class="fa fa-angle-up"></i>';
    } else if (growthValue < 0) {
      growthClass = "text-danger";
      growthIcon = '<i class="fa fa-angle-down"></i>';
    } else {
      growthClass = "text-warning";
      growthIcon = '<i class="fa fa-dot-circle"></i>';
    }

    growthEl.classList.remove("text-success", "text-danger", "text-warning");

    growthEl.classList.add(growthClass);

    growthEl.innerHTML = `${growthIcon} ${growthValue}%`;
  }

  return {
    loadPerformanceSummary,
  };
})();

export { PerformanceMetrics };
