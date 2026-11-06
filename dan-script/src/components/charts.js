import {
  getAuthArgs,
  handleInvalidSessionError,
} from "../auth/auth-error-handler.js";
import { AppUtils } from "../utils/utils.js";

const ChartModule = (() => {
  Chart.defaults.font.family = "Inter";

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

    // client_paid_owed_history: {
    //   serverFunction: "getClientPaidOwedHistoryChart",
    //   cacheKey: "chartData_client_paid_owed_history",
    // },

    current_month_log: {
      serverFunction: "getCurrentMonthLogChartData",
      cacheKey: (month, year) => `chartData_current_month_log_${year}_${month}`,
    },

    yearly_monthly_hours: {
      serverFunction: "getYearlyMonthlyHoursChartData",
      cacheKey: (year) => `chartData_yearly_monthly_hours_${year}`,
    },

    monthly_hours_by_year: {
      serverFunction: "getMonthlyHoursByYears",
      cacheKey: (years) => `chartData_monthly_hours_by_year_${years.join("_")}`,
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

  const adminChartState = {
    managers: [],

    charts: {},
  };

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

  async function loadChart(
    chartType,
    animated = false,
    year = "all",
    refresh = false,
    log = false,
    chartOpts = {},
    month = new Date().getMonth() + 1,
    onComplete = null,
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
        ? chartType === "current_month_log"
          ? config.cacheKey(month, year)
          : config.cacheKey(year)
        : config.cacheKey;

    const args =
      chartType === "yearly"
        ? [year]
        : chartType === "monthly_hours_by_year" ||
            chartType === "yearly_monthly_hours"
          ? [year]
          : chartType === "current_month_log"
            ? [month, year]
            : [];

    logMessage("Loading chart:", {
      chartType,
      year,
      cacheKey,
      args,
      refresh,
      animated,
    });

    try {
      const [sessionId, signature] = await getAuthArgs();

      AppUtils.cachedGScriptCall(
        cacheKey,
        config.serverFunction,
        [sessionId, signature, ...args],
        (data) => {
          logMessage("Chart data received:", data);

          if (!document.body.contains(chartDiv)) {
            logMessage("Chart container no longer exists.");
            return;
          }

          const hasChartData =
            chartType === "monthly_hours_by_year"
              ? data && typeof data === "object" && Object.keys(data).length > 0
              : Array.isArray(data) && data.length > 0;

          if (!hasChartData) {
            logMessage("No chart data found.");

            if (chartType === "daily") {
              showEmptyState(chartDiv, {
                icon: "",
                message: "",
              });
            } else {
              showEmptyState(chartDiv);
            }

            if (typeof onComplete === "function") {
              onComplete();
            }

            return;
          }

          logMessage("Drawing chart:", {
            chartType,
            rows: data.length,
          });

          drawChart(chartType, data, false, animated, chartOpts, onComplete);
        },
        log,
        refresh,
      );
    } catch (error) {
      logMessage("Chart loading failed:", error);

      if (handleInvalidSessionError(error)) {
        return;
      }

      AppUtils.showError(error?.message || "Failed to load chart data.");
    }
  }

  async function loadChartData(chartType, callback) {
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

    try {
      const [sessionId, signature] = await getAuthArgs();

      AppUtils.cachedGScriptCall(
        cacheKey,
        config.serverFunction,
        [sessionId, signature, ...args],
        callback,
      );
    } catch (error) {
      if (handleInvalidSessionError(error)) {
        return;
      }

      AppUtils.showError(error?.message || "Failed to load chart data.");
    }
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

  function drawChart(
    type,
    data,
    debug = false,
    animated = false,
    chartOpts = {},
    onComplete,
  ) {
    const chartDiv = document.getElementById(`chart-${type}`);

    if (!chartDiv) {
      return AppUtils.showError(`chart-${type} not found`);
    }

    if (debug) {
      console.log(`[ChartModule] Drawing ${type}`, data);
    }

    clearEmptyState(chartDiv);

    destroyChart(type);

    const canvas = createChartCanvas(chartDiv, type);
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return AppUtils.showError(`Unable to create chart context for ${type}`);
    }

    switch (type) {
      case "yearly":
        return drawYearlyChart(ctx, type, data, true, onComplete);

      case "hourly":
        return drawHourlyChart(ctx, type, data, true, onComplete);

      case "monthly-prev-merged":
        return drawMonthlyComparisonChart(ctx, type, data, true, onComplete);

      case "current_month_log":
      case "yearly_monthly_hours":
      case "daily":
      case "monthly":
        return drawLineChart(ctx, type, data, animated, chartOpts, onComplete);

      case "monthly_hours_by_year":
        return drawMonthlyHoursByYearChart(
          ctx,
          type,
          data,
          animated,
          onComplete,
        );

      case "daily_overview":
        return drawDailyOverviewChart(ctx, type, data, animated, onComplete);

      case "client_hours_month":
        return drawClientMonthlyHoursChart(
          ctx,
          type,
          data,
          animated,
          onComplete,
        );

      case "client_daily_hours":
        return drawClientDailyHoursChart(ctx, type, data, animated, onComplete);

      case "client_paid_owed":
        return drawClientPaidOwedHistoryChart(
          ctx,
          type,
          data,
          animated,
          onComplete,
        );

      default:
        return AppUtils.showError(`Unknown chart type: ${type}`);
    }
  }

  function resizeAllCharts() {
    Object.values(chartInstances).forEach((chart) => {
      chart.resize();
    });
  }

  function animateChart(type, enabled = true, duration = 1800) {
    const chart = chartInstances[type];

    if (!chart) {
      return;
    }

    // Stop animation
    if (!enabled) {
      chart.options.animation = false;
      chart.options.animations = {};

      if (chart._waveAnimation) {
        cancelAnimationFrame(chart._waveAnimation);
        chart._waveAnimation = null;
      }

      if (chart._waveOriginalData) {
        chart.data.datasets[0].data = [...chart._waveOriginalData];
        chart._waveOriginalData = null;
      }

      chart.update("none");
      return;
    }

    // Prevent multiple wave animations
    if (chart._waveAnimation) {
      return;
    }

    const dataset = chart.data.datasets[0];

    // Preserve original values
    chart._waveOriginalData = [...dataset.data];

    const originalData = chart._waveOriginalData;
    const startTime = performance.now();

    function wave(time) {
      if (!chartInstances[type]) {
        return;
      }

      const elapsed = time - startTime;
      const progress = (elapsed % duration) / duration;

      dataset.data = originalData.map((value, index) => {
        const wave = Math.sin(index * 0.7 + progress * Math.PI * 2) * 0.025;

        return value * (1 + wave);
      });

      chart.update("none");

      chart._waveAnimation = requestAnimationFrame(wave);
    }

    chart._waveAnimation = requestAnimationFrame(wave);
  }

  // --------------------------------------------------
  // YEARLY
  // --------------------------------------------------

  function drawYearlyChart(ctx, type, data, animated = false, onComplete) {
    const labels = data.map((row) => row?.[0] ?? "");

    const paid = data.map((row) => Number(row?.[2]) || 0);
    const owed = data.map((row) => Number(row?.[3]) || 0);
    const net = data.map((row) => Number(row?.[4]) || 0);

    const paidPeakIndex = getPeakIndex(paid);
    const owedPeakIndex = getPeakIndex(owed);
    const netPeakIndex = getPeakIndex(net);

    chartInstances[type] = new Chart(ctx, {
      type: "bar",

      data: {
        labels,

        datasets: [
          {
            label: "Net Paid",
            data: paid,

            backgroundColor: paid.map((value, index) =>
              index === paidPeakIndex
                ? "rgba(14, 165, 233, 1)"
                : createGradient(
                    ctx,
                    "rgba(14, 165, 233, 0.8)",
                    "rgba(14, 165, 233, 0.4)",
                  ),
            ),

            borderColor: "#0ea5e9",

            borderWidth: paid.map((value, index) =>
              index === paidPeakIndex ? 2 : 1,
            ),

            borderRadius: 6,
            borderSkipped: false,

            barPercentage: 0.8,
            categoryPercentage: 0.75,
          },

          {
            label: "Net Owed",
            data: owed,

            backgroundColor: owed.map((value, index) =>
              index === owedPeakIndex
                ? "rgba(249, 115, 22, 1)"
                : createGradient(
                    ctx,
                    "rgba(249, 115, 22, 0.8)",
                    "rgba(249, 115, 22, 0.4)",
                  ),
            ),

            borderColor: "#f97316",

            borderWidth: owed.map((value, index) =>
              index === owedPeakIndex ? 2 : 1,
            ),

            borderRadius: 6,
            borderSkipped: false,

            barPercentage: 0.8,
            categoryPercentage: 0.75,
          },

          {
            label: "Net Hrs",
            data: net,

            backgroundColor: net.map((value, index) =>
              index === netPeakIndex
                ? "rgba(16, 185, 129, 1)"
                : createGradient(
                    ctx,
                    "rgba(16, 185, 129, 0.8)",
                    "rgba(16, 185, 129, 0.4)",
                  ),
            ),

            borderColor: "#10b981",

            borderWidth: net.map((value, index) =>
              index === netPeakIndex ? 2 : 1,
            ),

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
              color: gridColor,
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
              color: gridColor,
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

    if (typeof onComplete === "function") {
      onComplete();
    }
  }

  // --------------------------------------------------
  // HOURLY
  // --------------------------------------------------

  function drawHourlyChart(ctx, type, data, animated = false, onComplete) {
    const labels = data.map((row) => String(row?.[0] || ""));
    const values = data.map((row) => Number(row?.[1]) || 0);
    const peakIndex = getPeakIndex(values);

    chartInstances[type] = new Chart(ctx, {
      type: "bar",

      data: {
        labels,

        datasets: [
          {
            label: "Total",

            data: values,

            backgroundColor: values.map((value, index) =>
              index === peakIndex
                ? "rgba(14, 165, 233, 1)"
                : createGradient(
                    ctx,
                    "rgba(14, 165, 233, 0.8)",
                    "rgba(14, 165, 233, 0.4)",
                  ),
            ),

            borderColor: "#0ea5e9",

            borderWidth: values.map((value, index) =>
              index === peakIndex ? 3 : 2,
            ),

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
              color: gridColor,
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
              color: gridColor,
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

    if (typeof onComplete === "function") {
      onComplete();
    }
  }

  // --------------------------------------------------
  // MONTHLY COMPARISON
  // --------------------------------------------------

  function drawMonthlyComparisonChart(
    ctx,
    type,
    data,
    animated = false,
    onComplete,
  ) {
    const prev = fillMonthlyData(data?.prevYear || []);
    const current = fillMonthlyData(data?.currentYear || []);
    const prevPeakIndex = getPeakIndex(prev);
    const currentPeakIndex = getPeakIndex(current);

    chartInstances[type] = new Chart(ctx, {
      type: "bar",

      data: {
        labels: REPORT_MONTHS,

        datasets: Array.isArray(data?.datasets)
          ? data.datasets
          : [
              {
                label: "Previous Year",
                data: prev,

                backgroundColor: prev.map((value, index) =>
                  index === prevPeakIndex
                    ? "rgba(249, 115, 22, 1)"
                    : createGradient(
                        ctx,
                        "rgba(249, 115, 22, 0.9)",
                        "rgba(249, 115, 22, 0.5)",
                      ),
                ),

                borderColor: "#f97316",
                borderWidth: prev.map((value, index) =>
                  index === prevPeakIndex ? 2 : 1,
                ),

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
                backgroundColor: current.map((value, index) =>
                  index === currentPeakIndex
                    ? "rgba(251, 146, 60, 1)"
                    : createGradient(
                        ctx,
                        "rgba(251, 146, 60, 0.9)",
                        "rgba(251, 146, 60, 0.5)",
                      ),
                ),

                borderColor: "#fb923c",
                borderWidth: current.map((value, index) =>
                  index === currentPeakIndex ? 2 : 1,
                ),

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
              color: gridColor,
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
              color: gridColor,
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

    if (typeof onComplete === "function") {
      onComplete();
    }
  }

  function drawMonthlyHoursByYearChart(
    ctx,
    type,
    data,
    animated = false,
    onComplete,
  ) {
    const yearColors = [
      {
        base: "rgba(14, 165, 233, 0.85)",
        light: "rgba(14, 165, 233, 0.45)",
        peak: "rgba(14, 165, 233, 1)",
        border: "#0284c7",
      },
      {
        base: "rgba(139, 92, 246, 0.85)",
        light: "rgba(139, 92, 246, 0.45)",
        peak: "rgba(139, 92, 246, 1)",
        border: "#7c3aed",
      },
      {
        base: "rgba(16, 185, 129, 0.85)",
        light: "rgba(16, 185, 129, 0.45)",
        peak: "rgba(16, 185, 129, 1)",
        border: "#059669",
      },
      {
        base: "rgba(245, 158, 11, 0.85)",
        light: "rgba(245, 158, 11, 0.45)",
        peak: "rgba(245, 158, 11, 1)",
        border: "#d97706",
      },
      {
        base: "rgba(236, 72, 153, 0.85)",
        light: "rgba(236, 72, 153, 0.45)",
        peak: "rgba(236, 72, 153, 1)",
        border: "#db2777",
      },
    ];

    const datasets = Object.entries(data || {}).map(
      ([year, rows], yearIndex) => {
        const monthlyData = Array(12).fill(0);

        (rows || []).forEach(([monthIndex, hours]) => {
          if (
            Number.isInteger(monthIndex) &&
            monthIndex >= 0 &&
            monthIndex < 12
          ) {
            monthlyData[monthIndex] = Number(hours) || 0;
          }
        });

        const peakIndex = getPeakIndex(monthlyData);

        const colors = yearColors[yearIndex % yearColors.length];

        return {
          label: year,
          data: monthlyData,

          backgroundColor: monthlyData.map((value, index) =>
            index === peakIndex
              ? colors.peak
              : createGradient(ctx, colors.base, colors.light),
          ),

          borderColor: colors.border,

          borderWidth: monthlyData.map((value, index) =>
            index === peakIndex ? 2 : 1,
          ),

          borderRadius: 6,
          borderSkipped: false,

          barPercentage: 0.8,
          categoryPercentage: 0.75,

          hoverBackgroundColor: colors.peak,
          hoverBorderColor: colors.border,
          hoverBorderWidth: 1,
        };
      },
    );

    chartInstances[type] = new Chart(ctx, {
      type: "bar",

      data: {
        labels: REPORT_MONTHS,
        datasets,
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,

        animation: animated
          ? {
              duration: 1200,
              easing: "easeOutQuart",
            }
          : false,

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
              color: gridColor,
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
              color: gridColor,
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

    if (typeof onComplete === "function") {
      onComplete();
    }
  }

  function drawDailyOverviewChart(
    ctx,
    type,
    data,
    animated = false,
    onComplete,
  ) {
    const labels = data.map(([client]) => client);

    const values = data.map(([, hours]) => Number(hours) || 0);

    const peakIndex = getPeakIndex(values);

    chartInstances[type] = new Chart(ctx, {
      type: "bar",

      data: {
        labels,

        datasets: [
          {
            label: "Hours",
            data: values,

            backgroundColor: values.map((value, index) =>
              index === peakIndex
                ? "rgba(14, 165, 233, 1)"
                : createGradient(
                    ctx,
                    "rgba(14, 165, 233, 0.85)",
                    "rgba(14, 165, 233, 0.45)",
                  ),
            ),

            borderColor: "#0ea5e9",
            borderWidth: values.map((value, index) =>
              index === peakIndex ? 2 : 1,
            ),

            borderRadius: 6,
            borderSkipped: false,

            barPercentage: 0.8,
            categoryPercentage: 0.75,

            hoverBackgroundColor: "rgba(14, 165, 233, 1)",

            hoverBorderColor: "#0284c7",
            hoverBorderWidth: 1,
          },
        ],
      },

      options: {
        indexAxis: "y",

        responsive: true,
        maintainAspectRatio: false,

        animation: animated
          ? {
              duration: 1200,
              easing: "easeOutQuart",
            }
          : false,

        interaction: {
          mode: "index",
          axis: "y",
          intersect: false,
        },

        plugins: {
          legend: {
            display: false,
          },

          tooltip: {
            backgroundColor: "rgba(255, 255, 255, 0.95)",

            titleColor: "#111827",
            bodyColor: "#374151",

            borderColor: "#e5e7eb",
            borderWidth: 1,

            padding: 12,
            cornerRadius: 8,

            callbacks: {
              label: function (context) {
                const value = Number(context.parsed.x) || 0;

                return `Hours: ${value.toLocaleString()}`;
              },
            },
          },
        },

        scales: {
          x: {
            beginAtZero: true,

            grid: {
              color: gridColor,
            },

            ticks: {
              font: {
                size: 10,
              },

              callback: (value) => Number(value).toLocaleString(),
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

    if (typeof onComplete === "function") {
      onComplete();
    }
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

  function drawLineChart(
    ctx,
    type,
    data,
    animated = false,
    chartOpts = {},
    onComplete,
  ) {
    const {
      showLabel = true,
      showPoints = true,
      showTooltip = true,
      showLegend = false,
      showAxes = true,
      showXAxis,
      showYAxis,
      showGrid = true,
    } = chartOpts || {};

    const displayX = showXAxis ?? showAxes;
    const displayY = showYAxis ?? showAxes;

    const labels = data.map((row) => row?.[0] ?? "");
    const values = data.map((row) => Number(row?.[1]) || 0);

    const isMonthly = type === "monthly" || type === "yearly_monthly_hours";

    const isCurrentMonthLog = type === "current_month_log";

    const lineColor = isCurrentMonthLog
      ? "#8b5cf6"
      : isMonthly
        ? "#22c55e"
        : "#0ea5e9";

    const gradientTopColor = isCurrentMonthLog
      ? "rgba(139, 92, 246, 0.5)"
      : isMonthly
        ? "rgba(34, 197, 94, 0.5)"
        : "rgba(14, 165, 233, 0.5)";

    const gradientBottomColor = isCurrentMonthLog
      ? "rgba(237, 233, 254, 0.2)"
      : isMonthly
        ? "rgba(220, 252, 231, 0.2)"
        : "rgba(231, 246, 254, 0.2)";

    const peakIndex = getPeakIndex(values);

    const pointRadius = showPoints
      ? values.map((value, index) => (index === peakIndex ? 7 : 2))
      : 0;

    const pointHoverRadius = showPoints
      ? values.map((value, index) => (index === peakIndex ? 9 : 5))
      : 0;

    chartInstances[type] = new Chart(ctx, {
      type: "line",

      data: {
        labels,

        datasets: [
          {
            label:
              showLabel || showLegend || showTooltip
                ? isMonthly
                  ? "Monthly Data"
                  : "Daily Data"
                : "",

            data: values,

            borderColor: lineColor,

            backgroundColor: createGradient(
              ctx,
              gradientTopColor,
              gradientBottomColor,
            ),

            fill: true,
            tension: 0.4,

            pointRadius,
            pointHoverRadius,

            pointBackgroundColor: values.map((value, index) =>
              index === peakIndex ? lineColor : "#ffffff",
            ),

            pointBorderColor: lineColor,

            pointBorderWidth: values.map((value, index) =>
              index === peakIndex ? 3 : 2,
            ),

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
            display: displayX,

            ticks: {
              font: {
                size: 10,
              },
            },

            border: {
              display: false,
            },

            grid: {
              display: showGrid,
              color: gridColor,
            },
          },

          y: {
            display: displayY,

            beginAtZero: true,

            ticks: {
              font: {
                size: 10,
              },
            },

            border: {
              display: false,
            },

            grid: {
              display: showGrid,
              color: gridColor,
            },
          },
        },

        plugins: {
          legend: {
            display: !!showLegend,
          },

          tooltip: {
            enabled: !!showTooltip,

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
                if (!showLabel && !showLegend) {
                  return `${Number(context.parsed.y).toLocaleString()}`;
                }

                const value = Number(context.parsed.y) || 0;

                return `${context.dataset.label}: ${value.toLocaleString()}`;
              },
            },
          },
        },

        interaction: {
          mode: showTooltip ? "index" : "none",
          axis: "x",
          intersect: false,
        },
      },
    });

    if (showTooltip && peakIndex >= 0) {
      setTimeout(
        () => {
          if (!chartInstances[type]) {
            return;
          }

          chartInstances[type].setActiveElements([
            {
              datasetIndex: 0,
              index: peakIndex,
            },
          ]);

          chartInstances[type].tooltip.setActiveElements(
            [
              {
                datasetIndex: 0,
                index: peakIndex,
              },
            ],
            {
              x: 0,
              y: 0,
            },
          );

          chartInstances[type].update();
        },
        animated ? 1200 : 0,
      );
    }

    if (typeof onComplete === "function") {
      onComplete();
    }
  }

  function drawClientPaidOwedHistoryChart(
    ctx,
    type,
    yearlyData,
    animated = false,
    chartOpts = {},
    onComplete,
  ) {
    const {
      showLabel = true,
      showTooltip = true,
      showLegend = false,
      showAxes = true,
      showXAxis,
      showYAxis,
      showGrid = true,
    } = chartOpts || {};

    const labels = yearlyData.map((item) => String(item?.year ?? ""));

    const paidHours = yearlyData.map((item) => Number(item?.hoursPaid) || 0);

    const owedHours = yearlyData.map((item) => Number(item?.hoursOwed) || 0);

    const paidPeakIndex = getPeakIndex(paidHours);
    const owedPeakIndex = getPeakIndex(owedHours);

    chartInstances[type] = new Chart(ctx, {
      type: "bar",

      data: {
        labels,

        datasets: [
          {
            label: showLabel ? "Paid Hours" : "",
            data: paidHours,

            backgroundColor: paidHours.map((value, index) =>
              index === paidPeakIndex
                ? "rgba(14, 165, 233, 1)"
                : createGradient(
                    ctx,
                    "rgba(14, 165, 233, 0.9)",
                    "rgba(14, 165, 233, 0.5)",
                  ),
            ),

            borderColor: "#0ea5e9",
            borderWidth: paidHours.map((value, index) =>
              index === paidPeakIndex ? 2 : 1,
            ),

            borderRadius: 6,
            borderSkipped: false,

            barPercentage: 0.8,
            categoryPercentage: 0.75,

            hoverBackgroundColor: "rgba(14, 165, 233, 1)",
            hoverBorderColor: "#0284c7",
            hoverBorderWidth: 1,
          },

          {
            label: showLabel ? "Owed Hours" : "",
            data: owedHours,

            backgroundColor: owedHours.map((value, index) =>
              index === owedPeakIndex
                ? "rgba(249, 115, 22, 1)"
                : createGradient(
                    ctx,
                    "rgba(249, 115, 22, 0.9)",
                    "rgba(249, 115, 22, 0.5)",
                  ),
            ),

            borderColor: "#f97316",
            borderWidth: owedHours.map((value, index) =>
              index === owedPeakIndex ? 2 : 1,
            ),

            borderRadius: 6,
            borderSkipped: false,

            barPercentage: 0.8,
            categoryPercentage: 0.75,

            hoverBackgroundColor: "rgba(249, 115, 22, 1)",
            hoverBorderColor: "#ea580c",
            hoverBorderWidth: 1,
          },
        ],
      },

      options: {
        indexAxis: "y", // <-- makes it horizontal

        responsive: true,
        maintainAspectRatio: true,

        animation: animated ? undefined : false,

        ...(animated && {
          animations: {
            x: {
              duration: 1200,
              easing: "easeOutQuart",
              from: 0,
            },
          },
        }),

        interaction: {
          mode: "index",
          axis: "y", // match indexAxis
          intersect: false,
        },

        plugins: {
          legend: {
            display: !!showLegend,
          },

          tooltip: {
            enabled: !!showTooltip,

            mode: "index",
            axis: "y",

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
              title: (items) => `Year: ${items[0]?.label || ""}`,

              label: (item) => {
                const value = Number(item.parsed.x) || 0;

                return `${item.dataset.label}: ${value.toLocaleString()} hrs`;
              },
            },
          },
        },

        scales: {
          x: {
            display: showXAxis ?? showAxes,

            beginAtZero: true,

            ticks: {
              font: {
                size: 10,
              },

              callback: (value) => `${value} hrs`,
            },

            border: {
              display: false,
            },

            grid: {
              display: showGrid,
              color: gridColor,
            },
          },

          y: {
            display: showYAxis ?? showAxes,

            ticks: {
              font: {
                size: 10,
              },
            },

            border: {
              display: false,
            },

            grid: {
              display: showGrid,
              color: gridColor,
            },
          },
        },
      },
    });

    if (typeof onComplete === "function") {
      onComplete();
    }
  }

  function drawMonthlyTargetChart(ctx, chartId, data, onComplete) {
    const existing = Chart.getChart(ctx);

    if (existing) {
      existing.destroy();
    }

    if (typeof onComplete === "function") {
      onComplete();
    }

    return new Chart(ctx, {
      type: "bar",

      data: {
        labels: data.map((item) => item.month),

        datasets: [
          {
            label: "Actual Hours",

            data: data.map((item) => item.actual),

            borderWidth: 1,
          },

          {
            label: "Monthly Target",

            data: data.map((item) => item.target),

            type: "line",

            borderWidth: 2,

            pointRadius: 3,

            fill: false,
          },
        ],
      },

      options: {
        responsive: true,

        maintainAspectRatio: false,

        interaction: {
          mode: "index",
          intersect: false,
        },

        plugins: {
          legend: {
            display: true,
          },

          tooltip: {
            callbacks: {
              label(context) {
                return `${context.dataset.label}: ${context.parsed.y.toFixed(2)} hrs`;
              },
            },
          },
        },

        scales: {
          x: {
            title: {
              display: true,
              text: "Month",
            },
          },

          y: {
            beginAtZero: true,

            title: {
              display: true,
              text: "Hours",
            },

            ticks: {
              callback(value) {
                return `${value} hrs`;
              },
            },
          },
        },
      },
    });
  }

  function drawClientMonthlyHoursChart(
    ctx,
    type,
    data,
    animated = false,
    onComplete,
  ) {
    const years = Object.keys(data || {});

    const year = years[0];

    const rows = data?.[year] || [];

    const labels = Array.from({ length: 12 }, (_, index) =>
      new Date(2000, index, 1).toLocaleString("en-US", { month: "short" }),
    );

    const values = Array(12).fill(0);

    rows.forEach(([monthIndex, hours]) => {
      const index = Number(monthIndex) - 1;

      if (index >= 0 && index < 12) {
        values[index] = Number(hours) || 0;
      }
    });

    destroyChart(type);

    chartInstances[type] = new Chart(ctx, {
      type: "bar",

      data: {
        labels,

        datasets: [
          {
            label: `${year} Hours`,
            data: values,
            borderWidth: 1,
          },
        ],
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,

        animation: animated ? undefined : false,

        scales: {
          y: {
            beginAtZero: true,
          },
        },

        plugins: {
          legend: {
            display: false,
          },
        },
      },
    });

    if (typeof onComplete === "function") {
      onComplete();
    }
  }

  function drawClientDailyHoursChart(
    ctx,
    type,
    data,
    animated = false,
    onComplete,
  ) {
    const labels = data.map((row) => String(row[0]));
    const values = data.map((row) => Number(row[1]) || 0);

    destroyChart(type);

    chartInstances[type] = new Chart(ctx, {
      type: "bar",

      data: {
        labels,

        datasets: [
          {
            label: "Hours",
            data: values,
            borderWidth: 1,
          },
        ],
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,

        animation: animated ? undefined : false,

        scales: {
          y: {
            beginAtZero: true,
          },

          x: {
            ticks: {
              autoSkip: true,
              maxTicksLimit: 15,
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

    if (typeof onComplete === "function") {
      onComplete();
    }
  }

  // --------------------------------------------------
  // HELPERS
  // --------------------------------------------------

  function getPeakIndex(values) {
    if (!values?.length) {
      return -1;
    }

    return values.reduce(
      (maxIndex, value, index, array) =>
        value > array[maxIndex] ? index : maxIndex,
      0,
    );
  }

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

  const gridColor = (context) => {
    const tickCount = context.scale?.ticks?.length || 1;
    const index = context.index || 0;

    const ratio = tickCount > 1 ? index / (tickCount - 1) : 0;

    const alpha = 0.04 - ratio * 0.025;

    return `rgba(0, 0, 0, ${alpha})`;
  };

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

  // --------------------------------------------------
  // EMPTY STATE
  // --------------------------------------------------

  function showEmptyState(
    chartType,
    {
      title = "Nothing to visualize yet",
      message = "There isn't enough recorded data to generate this chart. Once activity is recorded, your analytics will appear here.",
      icon = "pe-7s-graph",
      footer = "Chart data will appear automatically",
    } = {},
  ) {
    const chartDiv =
      typeof chartType === "string"
        ? document.getElementById(
            chartType.startsWith("chart-") ? chartType : `chart-${chartType}`,
          )
        : chartType;

    if (!chartDiv) {
      return;
    }

    // Destroy any existing chart.
    const chartId = chartDiv.id.replace(/^chart-/, "");

    destroyChart(chartId);

    chartDiv.innerHTML = `
      <div class="chart-empty-state">

        ${
          icon
            ? `
              <div class="chart-empty-icon">
                <i class="${icon}"></i>
              </div>
            `
            : ""
        }

        ${title ? `<div class="chart-empty-title">${title}</div>` : ""}

        ${message ? `<div class="chart-empty-message">${message}</div>` : ""}

        ${
          footer
            ? `
              <div class="chart-empty-footer">
                <i class="pe-7s-info"></i>
                <span>${footer}</span>
              </div>
            `
            : ""
        }

      </div>
    `;

    chartDiv.classList.add("chart-empty-container");
  }

  function clearEmptyState(chartType) {
    const chartDiv =
      typeof chartType === "string"
        ? document.getElementById(
            chartType.startsWith("chart-") ? chartType : `chart-${chartType}`,
          )
        : chartType;

    if (!chartDiv) {
      return;
    }

    chartDiv.classList.remove("chart-empty-container");
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

  // admin

  function getAdminChartState(chartType) {
    if (!adminChartState.charts[chartType]) {
      adminChartState.charts[chartType] = {
        mode: "overall",
        managerId: "",
        data: null,
      };
    }

    return adminChartState.charts[chartType];
  }

  function updateAdminManagers(managers) {
    if (!Array.isArray(managers)) {return;}

    const current = JSON.stringify(adminChartState.managers);
    const incoming = JSON.stringify(managers);

    if (current === incoming) {return;}

    adminChartState.managers = managers;

    // Update manager options in every admin chart filter.
    document.querySelectorAll(".admin-chart-filters").forEach((container) => {
      populateAdminChartFilters(container.dataset.adminChart);
    });
  }

  async function loadAdminChartData(chartType, serverFunction, cacheKey) {
    const cached = AppUtils.cacheGet(cacheKey);

    // Cache available: render immediately, then refresh in background.
    if (cached && isValidAdminChartData(chartType, cached)) {
      updateAdminChartData(chartType, cached);

      refreshAdminChartDataInBackground(
        chartType,
        serverFunction,
        cacheKey,
        cached,
      );

      return;
    }

    // No cache: show loader and fetch initial data.
    showAdminChartLoading(chartType);

    fetchAdminChartData(chartType, serverFunction, cacheKey);
  }

  async function fetchAdminChartData(chartType, serverFunction, cacheKey) {
    try {
      const [sessionId, signature] = await getAuthArgs();

      AppUtils.cachedGScriptCall(
        cacheKey,
        serverFunction,
        [sessionId, signature],
        (data) => {
          if (!isValidAdminChartData(chartType, data)) {
            console.error(
              `[Admin Chart] Invalid ${chartType} chart data.`,
              data,
            );

            hideAdminChartLoading(chartType);
            return;
          }

          updateAdminChartData(chartType, data);
          hideAdminChartLoading(chartType);
        },
      );
    } catch (error) {
      hideAdminChartLoading(chartType);

      if (handleInvalidSessionError(error)) {return;}

      console.error(`[Admin Chart] Failed to load ${chartType}:`, error);

      AppUtils.showError(
        error?.message || `Failed to load admin ${chartType} chart.`,
      );
    }
  }

  async function refreshAdminChartDataInBackground(
    chartType,
    serverFunction,
    cacheKey,
    cached,
  ) {
    try {
      const [sessionId, signature] = await getAuthArgs();

      AppUtils.cachedGScriptCall(
        cacheKey,
        serverFunction,
        [sessionId, signature],
        (data) => {
          if (!isValidAdminChartData(chartType, data)) {
            return;
          }

          const previousChartData = {
            labels: cached.labels,
            managers: cached.managers,
            overall: cached.overall,
          };

          const freshChartData = {
            labels: data.labels,
            managers: data.managers,
            overall: data.overall,
          };

          if (
            JSON.stringify(previousChartData) === JSON.stringify(freshChartData)
          ) {
            return;
          }

          updateAdminChartData(chartType, data);
        },
        false,
        true,
      );
    } catch (error) {
      if (handleInvalidSessionError(error)) {return;}

      console.error(
        `[Admin Chart] Background refresh failed for ${chartType}:`,
        error,
      );
    }
  }

  function updateAdminChartData(chartType, data) {
    const state = getAdminChartState(chartType);

    state.data = data;

    updateAdminManagers(data.managers || []);

    bindAdminChartEvents();
    populateAdminChartFilters(chartType);

    renderAdminChart(chartType);
  }

  function loadAdminMonthlyChart() {
    loadAdminChartData(
      "monthly",
      "getAdminMonthlyChartData",
      "adminChartData_monthly",
    );
  }

  function loadAdminMonthlyComparisonChart() {
    loadAdminChartData(
      "monthly-prev-merged",
      "getAdminMonthlyComparisonChartData",
      "adminChartData_monthly_prev_merged",
    );
  }

  function populateAdminChartFilters(chartType) {
    const container = document.querySelector(
      `.admin-chart-filters[data-admin-chart="${chartType}"]`,
    );

    if (!container) {return;}

    const state = getAdminChartState(chartType);

    const modeSelect = container.querySelector(".admin-chart-mode");
    const managerSelect = container.querySelector(".admin-chart-manager");

    if (!modeSelect || !managerSelect) {return;}

    const managers = adminChartState.managers;

    const previousManagerId = state.managerId;

    managerSelect.replaceChildren(new Option("Select Manager", ""));

    managers.forEach((manager) => {
      managerSelect.add(new Option(manager.managerName, manager.managerId));
    });

    state.managerId = managers.some(
      (manager) => manager.managerId === previousManagerId,
    )
      ? previousManagerId
      : "";

    modeSelect.value = state.mode;
    managerSelect.value = state.managerId;

    // Refresh existing Select2 displays.
    $(modeSelect).trigger("change.select2");
    $(managerSelect).trigger("change.select2");

    updateAdminChartFilterVisibility(container, state);
  }

  function bindAdminChartEvents() {
    document.querySelectorAll(".admin-chart-filters").forEach((container) => {
      if (container.dataset.eventsBound === "true") {return;}

      const chartType = container.dataset.adminChart;

      if (!chartType) {return;}

      const modeSelect = container.querySelector(".admin-chart-mode");
      const managerSelect = container.querySelector(".admin-chart-manager");

      if (!modeSelect || !managerSelect) {return;}

      // Select2-compatible change handler.
      $(modeSelect)
        .off("change.adminChart")
        .on("change.adminChart", function () {
          const state = getAdminChartState(chartType);

          state.mode = this.value;

          updateAdminChartFilterVisibility(container, state);
          renderAdminChart(chartType);
        });

      // Manager selection handler.
      $(managerSelect)
        .off("change.adminChart")
        .on("change.adminChart", function () {
          const state = getAdminChartState(chartType);

          state.managerId = this.value;

          renderAdminChart(chartType);
        });

      container.dataset.eventsBound = "true";
    });
  }

  function updateAdminChartFilterVisibility(container, state) {
    const managerSelect = container.querySelector(".admin-chart-manager");

    if (!managerSelect) {
      return;
    }

    const isVisible = state.mode === "manager";

    // Original select
    managerSelect.classList.toggle("d-none", !isVisible);

    // Select2 generated element
    const select2Container = $(managerSelect).next(".select2-container");

    select2Container.toggleClass("d-none", !isVisible);
  }

  function renderAdminMonthlyChart() {
    const state = getAdminChartState("monthly");
    const data = state.data;

    if (!data) {
      return;
    }

    const chartDiv = document.getElementById("chart-monthly");

    if (!chartDiv) {
      return;
    }

    const { labels, managers, overall } = data;

    destroyChart("adminMonthly");

    if (!labels?.length) {
      showEmptyState(chartDiv, {
        title: "No monthly data available",
        message:
          "Monthly hours will appear here when managers have recorded activity.",
      });
      return;
    }

    let datasets = [];

    const canvas = createChartCanvas(chartDiv, "adminMonthly");

    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");

    if (state.mode === "overall") {
      datasets = [
        {
          label: "Combined Hours",
          data: overall || [],
          borderColor: "#22c55e",
          backgroundColor: "rgba(34, 197, 94, 0.12)",
          pointBackgroundColor: "#22c55e",
          pointBorderColor: "#ffffff",
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 7,
          borderWidth: 2.5,
          tension: 0.35,
          fill: true,
        },
      ];
    } else if (state.mode === "manager") {
      const manager = managers.find(
        (item) => item.managerId === state.managerId,
      );

      if (!manager) {
        showEmptyState(chartDiv, {
          title: "Select a manager",
          message: "Choose a manager to view their monthly hours.",
        });
        return;
      }

      datasets = [createAdminMonthlyDataset(manager, 0, ctx)];
    } else if (state.mode === "comparison") {
      datasets = managers.map((manager, index) =>
        createAdminMonthlyDataset(manager, index, ctx),
      );
    }

    if (!datasets.length) {
      showEmptyState(chartDiv, {
        title: "No manager data available",
        message: "There are no manager datasets to display.",
      });
      return;
    }

    clearEmptyState(chartDiv);

    chartInstances.adminMonthly = new Chart(ctx, {
      type: "line",

      data: {
        labels,
        datasets,
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,

        animation: false,

        interaction: {
          mode: "index",
          axis: "x",
          intersect: false,
        },

        plugins: {
          legend: {
            display: datasets.length > 1,
            position: "top",
          },

          tooltip: {
            enabled: true,
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

            callbacks: {
              label(context) {
                const value = Number(context.parsed.y) || 0;

                return `${context.dataset.label}: ${value.toLocaleString()} hrs`;
              },
            },
          },
        },

        scales: {
          x: {
            grid: {
              color: gridColor,
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
              color: gridColor,
            },

            ticks: {
              font: {
                size: 10,
              },

              callback: (value) => Number(value).toLocaleString(),
            },

            border: {
              display: false,
            },
          },
        },
      },
    });
  }

  function renderAdminMonthlyComparisonChart() {
    const state = getAdminChartState("monthly-prev-merged");
    const data = state.data;

    if (!data) {return;}

    const chartDiv = document.getElementById("chart-monthly-prev-merged");

    if (!chartDiv) {return;}

    const { managers, overall } = data;

    if (state.mode === "overall") {
      if (!overall) {return;}

      destroyChart("monthly-prev-merged");

      drawChart(
        "monthly-prev-merged",
        {
          prevYear: overall.prevYear || [],
          currentYear: overall.currentYear || [],
        },
        false,
        false,
      );

      return;
    }

    if (state.mode === "manager") {
      const manager = managers.find(
        (item) => item.managerId === state.managerId,
      );

      if (!manager) {
        destroyChart("monthly-prev-merged");

        showEmptyState(chartDiv, {
          title: "Select a manager",
          message: "Choose a manager to view their yearly comparison.",
        });

        return;
      }

      clearEmptyState(chartDiv);

      drawChart(
        "monthly-prev-merged",
        {
          prevYear: manager.prevYear || [],
          currentYear: manager.currentYear || [],
        },
        false,
        false,
      );

      return;
    }

    if (state.mode === "comparison") {
      destroyChart("monthly-prev-merged");

      clearEmptyState(chartDiv);

      const canvas = createChartCanvas(chartDiv, "monthly-prev-merged");

      if (!canvas) {
        return;
      }

      const ctx = canvas.getContext("2d");

      const datasets = [];

      managers.forEach((manager, index) => {
        datasets.push(
          ...createAdminYearComparisonDatasets(manager, index, ctx),
        );
      });

      if (!datasets.length) {
        destroyChart("monthly-prev-merged");

        showEmptyState(chartDiv, {
          title: "No manager data available",
          message: "There are no manager datasets to compare.",
        });

        return;
      }

      drawMonthlyComparisonChart(
        ctx,
        "monthly-prev-merged",
        { datasets },
        false,
      );
    }
  }

  function createAdminMonthlyDataset(manager, index, ctx) {
    const colors = [
      "#0ea5e9",
      "#8b5cf6",
      "#10b981",
      "#f59e0b",
      "#ec4899",
      "#ef4444",
      "#64748b",
      "#14b8a6",
    ];

    const color = colors[index % colors.length];

    const rgb = color
      .match(/\w\w/g)
      .slice(0, 3)
      .map((value) => parseInt(value, 16));

    const gradient = createGradient(
      ctx,
      `rgba(${rgb.join(", ")}, 0.30)`,
      `rgba(${rgb.join(", ")}, 0.02)`,
    );

    return {
      label: manager.managerName,
      data: manager.data || [],

      borderColor: color,
      backgroundColor: gradient,

      pointBackgroundColor: color,
      pointBorderColor: "#ffffff",
      pointBorderWidth: 2,

      pointRadius: 3,
      pointHoverRadius: 6,

      borderWidth: 2,
      tension: 0.35,
      fill: true,
    };
  }

  function createAdminYearComparisonDatasets(manager, index, ctx) {
    const colors = [
      {
        previous: "#0ea5e9",
        current: "#38bdf8",
      },
      {
        previous: "#8b5cf6",
        current: "#a78bfa",
      },
      {
        previous: "#10b981",
        current: "#34d399",
      },
      {
        previous: "#f59e0b",
        current: "#fbbf24",
      },
      {
        previous: "#ec4899",
        current: "#f472b6",
      },
      {
        previous: "#ef4444",
        current: "#f87171",
      },
      {
        previous: "#64748b",
        current: "#94a3b8",
      },
      {
        previous: "#14b8a6",
        current: "#2dd4bf",
      },
    ];

    const palette = colors[index % colors.length];

    const previous = fillMonthlyData(manager.prevYear || []);
    const current = fillMonthlyData(manager.currentYear || []);

    const previousPeak = getPeakIndex(previous);
    const currentPeak = getPeakIndex(current);

    function makeDataset(label, values, color, peakIndex) {
      const rgba = color
        .match(/\w\w/g)
        .slice(0, 3)
        .map((value) => parseInt(value, 16));

      return {
        label,
        data: values,

        backgroundColor: values.map((value, i) =>
          i === peakIndex
            ? color
            : createGradient(
                ctx,
                `rgba(${rgba.join(", ")}, 0.9)`,
                `rgba(${rgba.join(", ")}, 0.5)`,
              ),
        ),

        borderColor: color,

        borderWidth: values.map((value, i) => (i === peakIndex ? 2 : 1)),

        borderRadius: 6,
        borderSkipped: false,

        barPercentage: 0.8,
        categoryPercentage: 0.75,

        hoverBackgroundColor: color,
        hoverBorderColor: color,
        hoverBorderWidth: 1,
      };
    }

    return [
      makeDataset(
        `${manager.managerName} — Previous Year`,
        previous,
        palette.previous,
        previousPeak,
      ),

      makeDataset(
        `${manager.managerName} — Current Year`,
        current,
        palette.current,
        currentPeak,
      ),
    ];
  }

  function renderAdminChart(chartType) {
    switch (chartType) {
      case "monthly":
        renderAdminMonthlyChart();
        break;

      case "monthly-prev-merged":
        renderAdminMonthlyComparisonChart();
        break;

      case "daily":
        // renderAdminDailyChart();
        break;
    }
  }

  function showAdminChartLoading(chartType) {
    animateChart(chartType, true, 1800);

    $(`#chart-${chartType}-loading`).removeClass("d-none");

    const filters = document.querySelector(
      `.admin-chart-filters[data-admin-chart="${chartType}"]`,
    );

    if (filters) {
      $(filters).find("select").prop("disabled", true);
      $(filters).find("select").trigger("change.select2");
    }
  }

  function hideAdminChartLoading(chartType) {
    animateChart(chartType, false);

    $(`#chart-${chartType}-loading`).addClass("d-none");

    const filters = document.querySelector(
      `.admin-chart-filters[data-admin-chart="${chartType}"]`,
    );

    if (filters) {
      $(filters).find("select").prop("disabled", false);
      $(filters).find("select").trigger("change.select2");
    }
  }

  function isValidAdminChartData(chartType, data) {
    if (!data || typeof data !== "object") {
      return false;
    }

    if (chartType === "monthly") {
      return Array.isArray(data.labels);
    }

    if (chartType === "monthly-prev-merged") {
      return (
        data.overall &&
        Array.isArray(data.overall.prevYear) &&
        Array.isArray(data.overall.currentYear) &&
        Array.isArray(data.managers)
      );
    }

    return false;
  }

  return {
    loadChart,
    loadPrevYearCombinedChart,
    drawClientPaidOwedHistoryChart,
    drawMonthlyTargetChart,

    drawChart,
    resizeAllCharts,
    animateChart,
    showEmptyState,

    destroyAllCharts,

    // admin

    loadAdminMonthlyChart,
    loadAdminMonthlyComparisonChart,
  };
})();

export { ChartModule };
