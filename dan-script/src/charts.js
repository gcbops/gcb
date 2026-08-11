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

  function loadChart(chartType, animated = false, year = "all") {
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

    chartDiv.innerText = "Loading chart...";

    const cacheKey =
      typeof config.cacheKey === "function"
        ? config.cacheKey(year)
        : config.cacheKey;

    const args = chartType === "yearly" ? [year] : [];

    AppUtils.cachedGScriptCall(
      cacheKey,
      config.serverFunction,
      args,
      (data) => {

        if (!document.body.contains(chartDiv)) {
          return;
        }

        if (!Array.isArray(data) || !data.length) {
          chartDiv.innerText = "No data found.";
          return;
        }

        drawChart(chartType, data, false, animated);
      },
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

  function loadPrevYearCombinedChart() {
    const chartId = "monthly-prev-merged";

    loadChartData("monthly_prev", (prevData) => {
      if (!Array.isArray(prevData)) {
        AppUtils.showError("Invalid previous year chart data.");
        return;
      }

      loadChartData("monthly", (currentData) => {
        if (!Array.isArray(currentData)) {
          AppUtils.showError("Invalid current year chart data.");
          return;
        }

        drawChart(chartId, {
          prevYear: prevData,
          currentYear: currentData,
        });
      });
    });
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
        return drawYearlyChart(ctx, type, data);

      case "hourly":
        return drawHourlyChart(ctx, type, data);

      case "monthly-prev-merged":
        return drawMonthlyComparisonChart(ctx, type, data);

      case "daily":
      case "monthly":
        return drawLineChart(ctx, type, data, animated);

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

  function drawYearlyChart(ctx, type, data) {
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
          },

          {
            label: "Net Owed",
            data: owed,
            backgroundColor: createGradient(
              ctx,
              "rgba(249, 115, 22, 0.8)",
              "rgba(249, 115, 22, 0.4)",
            ),
          },

          {
            label: "Net Hrs",
            data: net,
            backgroundColor: createGradient(
              ctx,
              "rgba(16, 185, 129, 0.8)",
              "rgba(16, 185, 129, 0.4)",
            ),
          },
        ],
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,

        plugins: {
          legend: {
            position: "top",
          },

          tooltip: {
            mode: "index",
            intersect: false,

            callbacks: {
              label: (context) =>
                `${context.dataset.label}: ${context.formattedValue} hrs`,
            },
          },
        },

        interaction: {
          mode: "index",
          intersect: false,
        },

        scales: {
          x: {
            grid: {
              display: false,
            },
          },

          y: {
            beginAtZero: true,
          },
        },
      },
    });
  }

  // --------------------------------------------------
  // HOURLY
  // --------------------------------------------------

  function drawHourlyChart(ctx, type, data) {
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
          },
        ],
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,

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
          },

          tooltip: {
            callbacks: {
              label: (context) => `${context.formattedValue} hrs`,
            },
          },
        },

        scales: {
          x: {
            grid: {
              display: false,
            },

            ticks: {
              color: "#475569",
            },
          },

          y: {
            beginAtZero: true,

            grid: {
              color: "rgba(0,0,0,0.05)",
            },

            ticks: {
              color: "#475569",
            },
          },
        },
      },
    });
  }

  // --------------------------------------------------
  // MONTHLY COMPARISON
  // --------------------------------------------------

  function drawMonthlyComparisonChart(ctx, type, data) {
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
              "rgba(249, 115, 22, 0.8)",
              "rgba(249, 115, 22, 0.4)",
            ),
          },

          {
            label: "Current Year",
            data: current,

            backgroundColor: createGradient(
              ctx,
              "rgba(14, 165, 233, 0.8)",
              "rgba(14, 165, 233, 0.4)",
            ),
          },
        ],
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,

        plugins: {
          legend: {
            position: "top",
          },
        },

        interaction: {
          mode: "index",
          intersect: false,
        },

        scales: {
          x: {
            grid: {
              display: false,
            },
          },

          y: {
            beginAtZero: true,
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

    chartInstances[type] = new Chart(ctx, {
      type: "line",

      data: {
        labels,

        datasets: [
          {
            label: type === "monthly" ? "Monthly Data" : "Daily Data",
            data: values,

            borderColor: "#0ea5e9",

            backgroundColor: createGradient(
              ctx,
              "rgba(14, 165, 233, 0.5)",
              "rgba(231, 246, 254, 0.2)",
            ),

            fill: true,
            tension: 0.4,
            pointRadius: 0,
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
              display: false,
            },

            ticks: {
              display: false,
            },

            border: {
              display: false,
            },
          },

          y: {
            grid: {
              display: false,
            },

            ticks: {
              display: false,
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
            borderColor: "#0ea5e9",
            backgroundColor: "transparent",
            borderDash: [8, 4],
            borderWidth: 3,
            pointRadius: 0,
            tension: 0.4,
          },

          {
            label: "Dataset 2",
            data: [],
            borderColor: "#f97316",
            backgroundColor: "transparent",
            borderWidth: 3,
            pointRadius: 0,
            tension: 0.4,
          },
        ],
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,

        interaction: {
          intersect: false,
          mode: "nearest",
        },

        plugins: {
          legend: {
            display: false,
          },
        },

        scales: {
          x: {
            type: "linear",

            ticks: {
              display: false,
            },

            grid: {
              display: false,
            },
          },

          y: {
            beginAtZero: false,

            grid: {
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
          dataset.data = dataset.data.filter((point) => point.x >= cutoff);
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
