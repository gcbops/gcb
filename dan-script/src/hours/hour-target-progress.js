import { AppUtils } from "../utils";

const HourTargetProgress = (() => {
  function loadTargetProgress(
    cacheKey,
    functionName,
    containerSuffix,
    enableProgressColors = false,
  ) {
    AppUtils.cachedGScriptCall(cacheKey, functionName, [], (data) => {
      if (!data) {
        return;
      }

      renderTargetProgress(data, containerSuffix, enableProgressColors);
    });
  }

  function renderTargetProgress(data, containerSuffix, enableProgressColors) {
    Object.entries(data).forEach(([id, value]) => {
      updateTargetBox(id, value, containerSuffix, enableProgressColors);
    });
  }

  function updateTargetBox(id, value, containerSuffix, enableProgressColors) {
    if (typeof value !== "number") {
      return;
    }

    const box = document.querySelector(`#${id}-${containerSuffix}`);

    if (!box) {
      return;
    }

    const number = box.querySelector(".widget-numbers");

    if (number) {
      number.textContent = `${value.toFixed(2)}%`;
    }

    const progressBar = box.querySelector(".progress-bar");

    if (!progressBar) {
      return;
    }

    updateProgressBar(progressBar, value, enableProgressColors);
  }

  function updateProgressBar(progressBar, value, enableProgressColors) {
    progressBar.style.width = `${value}%`;

    progressBar.setAttribute("aria-valuenow", value);

    if (!enableProgressColors) {
      return;
    }

    progressBar.classList.remove(
      "bg-success",
      "bg-info",
      "bg-warning",
      "bg-danger",
    );

    progressBar.classList.add(getProgressColor(value));
  }

  function getProgressColor(value) {
    if (value >= 100) {
      return "bg-success";
    }

    if (value >= 75) {
      return "bg-info";
    }

    if (value >= 50) {
      return "bg-warning";
    }

    return "bg-danger";
  }

  return {
    loadTargetProgress,
  };
})();

export { HourTargetProgress };
