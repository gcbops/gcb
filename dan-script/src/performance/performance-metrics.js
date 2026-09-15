import { AppUtils } from "../utils";

const PerformanceMetrics = (() => {
  const WIDGET_SUFFIX = {
    current: "1",
    previous: "2",
  };

  const COLORS = {
    current: [
      "bg-grow-early",
      "bg-love-kiss",
      "bg-sunny-morning",
      "bg-night-sky",
    ],
    previous: [
      "bg-grow-early",
      "bg-love-kiss",
      "bg-sunny-morning",
      "bg-night-sky",
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

      const numericValue = Number(value) || 0;

      const displayValue = numericValue.toFixed(1);

      /*
       * Progress bars must stay between
       * 0% and 100%.
       *
       * The displayed number can still
       * be negative.
       */
      const progressValue = Math.max(0, Math.min(100, numericValue));

      if (percentEl) {
        percentEl.textContent = `${displayValue}%`;
      }

      if (labelEl) {
        labelEl.textContent = label;
      }

      if (progressEl) {
        const color = colors[index % colors.length];

        progressEl.style.width = `${progressValue}%`;

        progressEl.setAttribute("aria-valuenow", displayValue);

        progressEl.setAttribute("aria-valuemin", "0");

        progressEl.setAttribute("aria-valuemax", "100");

        progressEl.className = `progress-bar ${color}`;
      }
    });

    renderPaidGrowth(growthEl, paidGrowth);
  }

  function renderPaidGrowth(growthEl, paidGrowth) {
    if (!growthEl) {
      return;
    }

    const growthValue = Number(paidGrowth) || 0;

    const displayValue = growthValue.toFixed(2);

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

    growthEl.innerHTML = `${growthIcon} ${displayValue}%`;
  }

  return {
    loadPerformanceSummary,
  };
})();

export { PerformanceMetrics };
