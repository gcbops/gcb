import { AppUtils } from "./utils.js";

const ChartModule = (() => {
  const CHART_CONFIG = {
    daily: {
      serverFunction: "getDailyChartData",
      cacheKey: "chartData_daily",
    },

    monthly: {
      serverFunction: "getMonthlyChartData",
      cacheKey: "chartData_monthly",
    },

    yearly: {
      serverFunction: "getYearlyChartData",
      cacheKey: (year) => `chartData_yearly_${year}`,
    },

    hourly: {
      serverFunction: "getHourlyChartData",
      cacheKey: "chartData_hourly",
    },

    monthly_prev: {
      serverFunction: "getPrevYearMonthlyChartData",
      cacheKey: "chartData_monthly_prev",
    },
  };

  const chartInstances = {};
  const animationFrames = {};

  const REPORT_MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const MONTH_MAP = {
    January: 1,
    February: 2,
    March: 3,
    April: 4,
    May: 5,
    June: 6,
    July: 7,
    August: 8,
    September: 9,
    October: 10,
    November: 11,
    December: 12,
  };

  let tabEventsBound = false;

  function bindTabEvents() {
    if (tabEventsBound) {
      return;
    }

    tabEventsBound = true;

    $(document)
      .off("shown.bs.tab.ChartModule")
      .on("shown.bs.tab.ChartModule", '[data-bs-toggle="tab"]', () => {
        requestAnimationFrame(() => {
          resizeAllCharts();
        });
      });
  }

  // --------------------------------------------------
  // DATA LOADING
  // --------------------------------------------------

  function loadChart(
    chartType,
    animated = false,
    year = "all",
    refresh = false,
    log = false,
  ) {
    const logMessage = (...args) => {
      if (log) {
        console.log("[Charts]", ...args);
      }
    };

    const chartDiv = document.getElementById(`chart-${chartType}`);

    if (!chartDiv) {
      return AppUtils.showError(
        `Chart container not found: chart-${chartType}`,
      );
    }

    const config = CHART_CONFIG[chartType];

    if (!config) {
      return AppUtils.showError(
        `No chart configuration found for: ${chartType}`,
      );
    }

    const cacheKey =
      typeof config.cacheKey === "function"
        ? config.cacheKey(year)
        : config.cacheKey;

    const args = chartType === "yearly" ? [year] : [];

    logMessage("Loading chart:", {
      chartType,
      year,
      cacheKey,
      args,
      refresh,
      animated,
    });

    AppUtils.cachedGScriptCall(
      cacheKey,
      config.serverFunction,
      args,
      (data) => {
        logMessage("Chart data received:", data);

        if (!document.body.contains(chartDiv)) {
          logMessage("Chart container no longer exists.");
          return;
        }

        if (!Array.isArray(data) || !data.length) {
          logMessage("No chart data found.");

          chartDiv.innerText = "No data found.";
          return;
        }

        logMessage("Drawing chart:", {
          chartType,
          rows: data.length,
        });

        drawChart(chartType, data, false, animated);
      },
      log,
      refresh,
    );
  }

  function loadChartData(chartType, callback) {
    const config = CHART_CONFIG[chartType];

    if (!config) {
      AppUtils.showError(`Unknown chart type: ${chartType}`);
      return;
    }

    if (typeof callback !== "function") {
      console.warn(
        `[ChartModule] Invalid callback for chart type: ${chartType}`,
      );
      return;
    }

    bindTabEvents();

    const cacheKey =
      typeof config.cacheKey === "function"
        ? config.cacheKey("all")
        : config.cacheKey;

    const args = chartType === "yearly" ? ["all"] : [];

    AppUtils.cachedGScriptCall(cacheKey, config.serverFunction, args, callback);
  }

  function loadPrevYearCombinedChart(refresh = false, log = false) {
    const chartId = "monthly-prev-merged";

    if (log) {
      console.log("[Charts] Loading previous/current year combined chart:", {
        refresh,
      });
    }

    loadChartData(
      "monthly_prev",
      (prevData) => {
        if (!Array.isArray(prevData)) {
          AppUtils.showError("Invalid previous year chart data.");
          return;
        }

        loadChartData(
          "monthly",
          (currentData) => {
            if (!Array.isArray(currentData)) {
              AppUtils.showError("Invalid current year chart data.");
              return;
            }

            if (log) {
              console.log("[Charts] Combined chart data:", {
                prevYear: prevData,
                currentYear: currentData,
              });
            }

            drawChart(chartId, {
              prevYear: prevData,
              currentYear: currentData,
            });
          },
          refresh,
          log,
        );
      },
      refresh,
      log,
    );
  }

  // --------------------------------------------------
  // MAIN DRAW ROUTER
  // --------------------------------------------------

  function drawChart(type, data, debug = false, animated = false) {
    const chartDiv = document.getElementById(`chart-${type}`);

    if (!chartDiv) {
      return AppUtils.showError(`chart-${type} not found`);
    }

    if (debug) {
      console.log(`[ChartModule] Drawing ${type}`, data);
    }

    destroyChart(type);

    const canvas = createChartCanvas(chartDiv, type);
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return AppUtils.showError(`Unable to create chart context for ${type}`);
    }

    switch (type) {
      case "yearly":
        return drawYearlyChart(ctx, type, data, true);

      case "hourly":
        return drawHourlyChart(ctx, type, data, true);

      case "monthly-prev-merged":
        return drawMonthlyComparisonChart(ctx, type, data, true);

      case "daily":
      case "monthly":
        return drawLineChart(ctx, type, data, animated, true);

      default:
        return AppUtils.showError(`Unknown chart type: ${type}`);
    }
  }

  function resizeAllCharts() {
    Object.values(chartInstances).forEach((chart) => {
      chart.resize();
    });
  }

  // --------------------------------------------------
  // YEARLY
  // --------------------------------------------------

  function drawYearlyChart(ctx, type, data, animated = false) {
    const labels = data.map((row) => row?.[0] ?? "");

    const paid = data.map((row) => Number(row?.[2]) || 0);
    const owed = data.map((row) => Number(row?.[3]) || 0);
    const net = data.map((row) => Number(row?.[4]) || 0);

    chartInstances[type] = new Chart(ctx, {
      type: "bar",

      data: {
        labels,

        datasets: [
          {
            label: "Net Paid",
            data: paid,

            backgroundColor: createGradient(
              ctx,
              "rgba(14, 165, 233, 0.8)",
              "rgba(14, 165, 233, 0.4)",
            ),

            borderColor: "#0ea5e9",
            borderWidth: 1,

            borderRadius: 6,
            borderSkipped: false,

            barPercentage: 0.8,
            categoryPercentage: 0.75,
          },

          {
            label: "Net Owed",
            data: owed,

            backgroundColor: createGradient(
              ctx,
              "rgba(249, 115, 22, 0.8)",
              "rgba(249, 115, 22, 0.4)",
            ),

            borderColor: "#f97316",
            borderWidth: 1,

            borderRadius: 6,
            borderSkipped: false,

            barPercentage: 0.8,
            categoryPercentage: 0.75,
          },

          {
            label: "Net Hrs",
            data: net,

            backgroundColor: createGradient(
              ctx,
              "rgba(16, 185, 129, 0.8)",
              "rgba(16, 185, 129, 0.4)",
            ),

            borderColor: "#10b981",
            borderWidth: 1,

            borderRadius: 6,
            borderSkipped: false,

            barPercentage: 0.8,
            categoryPercentage: 0.75,
          },
        ],
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,

        animation: animated ? undefined : false,

        ...(animated && {
          animations: {
            y: {
              duration: 1200,
              easing: "easeOutQuart",
              from: 0,
            },
          },
        }),

        interaction: {
          mode: "index",
          axis: "x",
          intersect: false,
        },

        plugins: {
          legend: {
            position: "top",
          },

          tooltip: {
            mode: "index",
            axis: "x",
            intersect: false,

            backgroundColor: "rgba(255, 255, 255, 0.9)",

            titleColor: "#111827",
            bodyColor: "#374151",

            borderColor: "#d1d5db",
            borderWidth: 0,

            padding: 12,
            cornerRadius: 8,

            displayColors: true,

            callbacks: {
              label: (context) => {
                const value = Number(context.parsed.y) || 0;

                return `${context.dataset.label}: ${value.toLocaleString()} hrs`;
              },
            },
          },
        },

        scales: {
          x: {
            stacked: false,

            grid: {
              color: "rgba(0, 0, 0, 0.04)",
            },

            ticks: {
              font: {
                size: 10,
              },
            },

            border: {
              display: false,
            },
          },

          y: {
            beginAtZero: true,
            stacked: false,

            title: {
              display: true,
              text: "Hours",
            },

            grid: {
              color: "rgba(0, 0, 0, 0.04)",
            },

            ticks: {
              font: {
                size: 10,
              },

              callback: (value) => `${value} hrs`,
            },

            border: {
              display: false,
            },
          },
        },
      },
    });
  }

  // --------------------------------------------------
  // HOURLY
  // --------------------------------------------------

  function drawHourlyChart(ctx, type, data, animated = false) {
    const labels = data.map((row) => String(row?.[0] || ""));
    const values = data.map((row) => Number(row?.[1]) || 0);

    chartInstances[type] = new Chart(ctx, {
      type: "bar",

      data: {
        labels,

        datasets: [
          {
            label: "Total",

            data: values,

            backgroundColor: createGradient(
              ctx,
              "rgba(14, 165, 233, 0.8)",
              "rgba(14, 165, 233, 0.4)",
            ),

            borderColor: "#0ea5e9",
            borderWidth: 2,

            borderRadius: 6,
            borderSkipped: false,

            barPercentage: 0.8,
            categoryPercentage: 0.75,

            hoverBackgroundColor: "rgba(14, 165, 233, 0.95)",
            hoverBorderColor: "#0284c7",
            hoverBorderWidth: 2,
          },
        ],
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,

        animation: animated ? undefined : false,

        ...(animated && {
          animations: {
            y: {
              duration: 1200,
              easing: "easeOutQuart",
              from: 0,
            },
          },
        }),

        interaction: {
          mode: "index",
          axis: "x",
          intersect: false,
        },

        plugins: {
          legend: {
            display: false,
          },

          title: {
            display: true,
            text: "Hourly History by Year",
            color: "#334155",

            font: {
              size: 18,
              weight: "600",
            },

            padding: {
              bottom: 16,
            },
          },

          tooltip: {
            enabled: true,

            mode: "index",
            axis: "x",
            intersect: false,

            backgroundColor: "rgba(255, 255, 255, 0.9)",

            titleColor: "#111827",
            bodyColor: "#374151",

            borderColor: "#d1d5db",
            borderWidth: 0,

            padding: 12,
            cornerRadius: 8,

            displayColors: true,

            callbacks: {
              title: (tooltipItems) => {
                return tooltipItems[0]?.label || "";
              },

              label: (context) => {
                const value = Number(context.parsed.y) || 0;

                return `Total: ${value.toLocaleString()} hrs`;
              },
            },
          },
        },

        scales: {
          x: {
            grid: {
              color: "rgba(0, 0, 0, 0.04)",
            },

            ticks: {
              font: {
                size: 10,
              },

              autoSkip: true,
              maxRotation: 0,
            },

            border: {
              display: false,
            },
          },

          y: {
            beginAtZero: true,

            title: {
              display: true,
              text: "Hours",
            },

            grid: {
              color: "rgba(0, 0, 0, 0.04)",
            },

            ticks: {
              font: {
                size: 10,
              },

              callback: (value) => `${value} hrs`,
            },

            border: {
              display: false,
            },
          },
        },
      },
    });
  }

  // --------------------------------------------------
  // MONTHLY COMPARISON
  // --------------------------------------------------

  function drawMonthlyComparisonChart(ctx, type, data, animated = false) {
    const prev = fillMonthlyData(data?.prevYear || []);
    const current = fillMonthlyData(data?.currentYear || []);

    chartInstances[type] = new Chart(ctx, {
      type: "bar",

      data: {
        labels: REPORT_MONTHS,

        datasets: [
          {
            label: "Previous Year",
            data: prev,

            backgroundColor: createGradient(
              ctx,
              "rgba(249, 115, 22, 0.9)",
              "rgba(249, 115, 22, 0.5)",
            ),

            borderColor: "#f97316",
            borderWidth: 1,

            borderRadius: 6,
            borderSkipped: false,

            barPercentage: 0.8,
            categoryPercentage: 0.75,

            hoverBackgroundColor: "rgba(249, 115, 22, 1)",
            hoverBorderColor: "#ea580c",
            hoverBorderWidth: 1,
          },

          {
            label: "Current Year",
            data: current,

            // Lighter, related orange/amber for current year
            backgroundColor: createGradient(
              ctx,
              "rgba(251, 146, 60, 0.9)",
              "rgba(251, 146, 60, 0.5)",
            ),

            borderColor: "#fb923c",
            borderWidth: 1,

            borderRadius: 6,
            borderSkipped: false,

            barPercentage: 0.8,
            categoryPercentage: 0.75,

            hoverBackgroundColor: "rgba(251, 146, 60, 1)",
            hoverBorderColor: "#f97316",
            hoverBorderWidth: 1,
          },
        ],
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,

        animation: animated ? undefined : false,

        ...(animated && {
          animations: {
            y: {
              duration: 1200,
              easing: "easeOutQuart",
              from: 0,
            },
          },
        }),

        interaction: {
          mode: "index",
          axis: "x",
          intersect: false,
        },

        plugins: {
          legend: {
            display: true,
            position: "top",
          },

          tooltip: {
            mode: "index",
            axis: "x",
            intersect: false,

            backgroundColor: "rgba(255, 255, 255, 0.95)",

            titleColor: "#111827",
            bodyColor: "#374151",

            borderColor: "#e5e7eb",
            borderWidth: 1,

            padding: 12,
            cornerRadius: 8,

            displayColors: true,

            callbacks: {
              label: function (context) {
                const value = Number(context.parsed.y) || 0;

                return `${context.dataset.label}: ${value.toLocaleString()}`;
              },
            },
          },
        },

        scales: {
          x: {
            grid: {
              color: "rgba(0, 0, 0, 0.04)",
            },

            ticks: {
              font: {
                size: 10,
              },
            },

            border: {
              display: false,
            },
          },

          y: {
            beginAtZero: true,

            grid: {
              color: "rgba(0, 0, 0, 0.04)",
            },

            ticks: {
              font: {
                size: 10,
              },

              callback: (value) => `${value}`,
            },

            border: {
              display: false,
            },
          },
        },
      },
    });
  }

  function fillMonthlyData(data) {
    const values = Array(12).fill(0);

    data.forEach((row) => {
      if (!Array.isArray(row) || row.length < 2) {
        return;
      }

      const monthName = String(row[0] || "").split(" ")[0];
      const monthNumber = MONTH_MAP[monthName];

      if (!monthNumber) {
        return;
      }

      values[monthNumber - 1] = Number(row[1]) || 0;
    });

    return values;
  }

  // --------------------------------------------------
  // DAILY / MONTHLY LINE
  // --------------------------------------------------

  function drawLineChart(ctx, type, data, animated = false) {
    const labels = data.map((row) => row?.[0] ?? "");
    const values = data.map((row) => Number(row?.[1]) || 0);

    const isMonthly = type === "monthly";

    const lineColor = isMonthly
      ? "#22c55e" // Green for monthly
      : "#0ea5e9"; // Blue for daily

    const gradientTopColor = isMonthly
      ? "rgba(34, 197, 94, 0.5)"
      : "rgba(14, 165, 233, 0.5)";

    const gradientBottomColor = isMonthly
      ? "rgba(220, 252, 231, 0.2)"
      : "rgba(231, 246, 254, 0.2)";

    chartInstances[type] = new Chart(ctx, {
      type: "line",

      data: {
        labels,

        datasets: [
          {
            label: isMonthly ? "Monthly Data" : "Daily Data",
            data: values,

            borderColor: lineColor,

            backgroundColor: createGradient(
              ctx,
              gradientTopColor,
              gradientBottomColor,
            ),

            fill: true,
            tension: 0.4,

            pointRadius: 2,
            pointHoverRadius: 5,

            pointBackgroundColor: "#ffffff",
            pointBorderColor: lineColor,
            pointBorderWidth: 2,

            borderWidth: 2,
          },
        ],
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,

        animation: animated ? undefined : false,

        ...(animated && {
          animations: {
            tension: {
              duration: 1500,
              easing: "easeInOutQuart",
              from: 1,
              to: 0.4,
              loop: true,
            },
          },
        }),

        scales: {
          x: {
            grid: {
              color: "rgba(0, 0, 0, 0.04)",
            },

            ticks: {
              font: {
                size: 10,
              },
            },

            border: {
              display: false,
            },
          },

          y: {
            beginAtZero: true,

            grid: {
              color: "rgba(0, 0, 0, 0.04)",
            },

            ticks: {
              font: {
                size: 10,
              },
            },

            border: {
              display: false,
            },
          },
        },

        plugins: {
          legend: {
            display: false,
          },

          tooltip: {
            mode: "index",
            axis: "x",
            intersect: false,

            backgroundColor: "rgba(255, 255, 255, 0.9)",

            titleColor: "#111827",
            bodyColor: "#374151",

            borderColor: "#d1d5db",
            borderWidth: 0,

            padding: 12,
            cornerRadius: 8,

            displayColors: true,

            callbacks: {
              label: function (context) {
                const value = Number(context.parsed.y) || 0;

                return `${context.dataset.label}: ${value.toLocaleString()}`;
              },
            },
          },
        },

        interaction: {
          mode: "index",
          axis: "x",
          intersect: false,
        },
      },
    });
  }

  // --------------------------------------------------
  // REALTIME ANIMATED CHART
  // --------------------------------------------------

  function drawRealtimeAnimatedChart() {
    const type = "sample_realtime_animated";
    const chartDiv = document.getElementById(`chart-${type}`);

    if (!chartDiv) {
      return;
    }

    destroyRealtimeChart(type);

    const canvas = createChartCanvas(chartDiv, type);
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    chartInstances[type] = new Chart(ctx, {
      type: "line",

      data: {
        datasets: [
          {
            label: "Dataset 1",
            data: [],

            borderColor: "#8b5cf6",

            backgroundColor: createGradient(
              ctx,
              "rgba(139, 92, 246, 0.45)",
              "rgba(237, 233, 254, 0.05)",
            ),

            fill: true,

            borderDash: [8, 4],
            borderWidth: 3,

            pointRadius: 2,
            pointHoverRadius: 5,

            pointBackgroundColor: "#ffffff",
            pointBorderColor: "#8b5cf6",
            pointBorderWidth: 2,

            tension: 0.4,
          },

          {
            label: "Dataset 2",
            data: [],

            borderColor: "#10b981",

            backgroundColor: createGradient(
              ctx,
              "rgba(16, 185, 129, 0.45)",
              "rgba(220, 252, 231, 0.05)",
            ),

            fill: true,

            borderWidth: 3,

            pointRadius: 2,
            pointHoverRadius: 5,

            pointBackgroundColor: "#ffffff",
            pointBorderColor: "#10b981",
            pointBorderWidth: 2,

            tension: 0.4,
          },
        ],
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,

        // Data is updated manually through requestAnimationFrame
        animation: false,

        interaction: {
          mode: "nearest",
          axis: "x",
          intersect: false,
        },

        plugins: {
          legend: {
            display: false,
          },

          tooltip: {
            enabled: true,

            mode: "nearest",
            axis: "x",
            intersect: false,

            backgroundColor: "rgba(255, 255, 255, 0.9)",

            titleColor: "#111827",
            bodyColor: "#374151",

            borderColor: "#d1d5db",
            borderWidth: 0,

            padding: 12,
            cornerRadius: 8,

            displayColors: true,

            callbacks: {
              title: (tooltipItems) => {
                const timestamp = tooltipItems[0]?.parsed.x;

                if (!timestamp) {
                  return "";
                }

                return new Date(timestamp).toLocaleTimeString();
              },

              label: (context) => {
                const value = Number(context.parsed.y) || 0;

                return `${context.dataset.label}: ${value.toFixed(2)}`;
              },
            },
          },
        },

        scales: {
          x: {
            type: "linear",

            grid: {
              color: "rgba(0, 0, 0, 0.04)",
            },

            ticks: {
              font: {
                size: 10,
              },

              callback: (value) => {
                return new Date(value).toLocaleTimeString([], {
                  minute: "2-digit",
                  second: "2-digit",
                });
              },
            },

            border: {
              display: false,
            },
          },

          y: {
            beginAtZero: false,

            grid: {
              color: "rgba(0, 0, 0, 0.04)",
            },

            ticks: {
              font: {
                size: 10,
              },
            },

            border: {
              display: false,
            },
          },
        },
      },
    });

    let lastTime = 0;

    let value1 = 20;
    let value2 = 60;

    let target1 = 20;
    let target2 = 60;

    function animate(time) {
      const chart = chartInstances[type];

      if (!chart) {
        return;
      }

      if (time - lastTime > 80) {
        const now = Date.now();

        value1 += (target1 - value1) * 0.03;
        value2 += (target2 - value2) * 0.03;

        if (Math.abs(value1 - target1) < 2) {
          target1 = Math.random() * 100;
        }

        if (Math.abs(value2 - target2) < 2) {
          target2 = Math.random() * 100;
        }

        chart.data.datasets[0].data.push({
          x: now,
          y: value1,
        });

        chart.data.datasets[1].data.push({
          x: now,
          y: value2,
        });

        const cutoff = now - 30000;

        chart.data.datasets.forEach((dataset) => {
          dataset.data = dataset.data.filter((point) => {
            return point.x >= cutoff;
          });
        });

        chart.options.scales.x.min = cutoff;
        chart.options.scales.x.max = now;

        chart.update("none");

        lastTime = time;
      }

      animationFrames[type] = requestAnimationFrame(animate);
    }

    animationFrames[type] = requestAnimationFrame(animate);
  }

  function destroyRealtimeChart(type = "sample_realtime_animated") {
    if (animationFrames[type]) {
      cancelAnimationFrame(animationFrames[type]);
      delete animationFrames[type];
    }

    destroyChart(type);
  }

  // --------------------------------------------------
  // HELPERS
  // --------------------------------------------------

  function createGradient(ctx, startColor, endColor) {
    if (!startColor || !endColor) {
      console.warn("Invalid gradient colors:", {
        startColor,
        endColor,
      });

      return startColor || endColor || "rgba(14, 165, 233, 0.5)";
    }

    const height = ctx.canvas.height || 300;

    const gradient = ctx.createLinearGradient(0, 0, 0, height);

    gradient.addColorStop(0, startColor);
    gradient.addColorStop(1, endColor);

    return gradient;
  }

  function createChartCanvas(chartDiv, type) {
    if (!chartDiv) {
      return null;
    }

    /*
     * Remove any existing canvas/chart DOM.
     */
    chartDiv.replaceChildren();

    const canvas = document.createElement("canvas");

    canvas.id = `chartCanvas_${type}`;
    canvas.setAttribute("aria-label", `${type} chart`);

    /*
     * Make sure Chart.js has a proper responsive container.
     */
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";

    chartDiv.appendChild(canvas);

    return canvas;
  }

  function destroyChart(type) {
    if (!chartInstances[type]) {
      return;
    }

    chartInstances[type].destroy();

    delete chartInstances[type];
  }

  function destroyAllCharts() {
    Object.keys(animationFrames).forEach((type) => {
      cancelAnimationFrame(animationFrames[type]);
      delete animationFrames[type];
    });

    Object.keys(chartInstances).forEach((type) => {
      destroyChart(type);
    });
  }

  return {
    loadChart,
    loadPrevYearCombinedChart,

    drawChart,
    resizeAllCharts,

    drawRealtimeAnimatedChart,
    destroyRealtimeChart,
    destroyAllCharts,
  };
})();

export { ChartModule };
