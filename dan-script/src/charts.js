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

    client_paid_owed_history: {
      serverFunction: "getClientPaidOwedHistoryChart",
      cacheKey: "chartData_client_paid_owed_history",
    },

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

        const hasChartData =
          chartType === "monthly_hours_by_year"
            ? data && typeof data === "object" && Object.keys(data).length > 0
            : Array.isArray(data) && data.length > 0;

        if (!hasChartData) {
          logMessage("No chart data found.");

          chartDiv.innerText = "No data found.";

          if (typeof onComplete === "function") {
            onComplete();
          }

          return;
        }

        logMessage("Drawing chart:", {
          chartType,
          rows: data.length,
        });

        drawChart(chartType, data, false, animated, chartOpts);

        if (typeof onComplete === "function") {
          onComplete();
        }
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

  function drawChart(
    type,
    data,
    debug = false,
    animated = false,
    chartOpts = {},
  ) {
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

      case "current_month_log":
      case "yearly_monthly_hours":
      case "daily":
      case "monthly":
        return drawLineChart(ctx, type, data, animated, chartOpts);

      case "monthly_hours_by_year":
        return drawMonthlyHoursByYearChart(ctx, type, data, animated);

      case "daily_overview":
        return drawDailyOverviewChart(ctx, type, data, animated);

      case "client_paid_owed_history":
        return drawClientPaidOwedHistoryChart(
          ctx,
          type,
          data,
          animated,
          chartOpts,
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

  function drawYearlyChart(ctx, type, data, animated = false) {
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
    const prevPeakIndex = getPeakIndex(prev);
    const currentPeakIndex = getPeakIndex(current);

    chartInstances[type] = new Chart(ctx, {
      type: "bar",

      data: {
        labels: REPORT_MONTHS,

        datasets: [
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

  function drawMonthlyHoursByYearChart(ctx, type, data, animated = false) {
    const datasets = Object.entries(data || {}).map(([year, rows]) => {
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

      return {
        label: year,
        data: monthlyData,

        backgroundColor: monthlyData.map((value, index) =>
          index === peakIndex
            ? "rgba(14, 165, 233, 1)"
            : createGradient(
                ctx,
                "rgba(14, 165, 233, 0.85)",
                "rgba(14, 165, 233, 0.45)",
              ),
        ),

        borderColor: "#0ea5e9",
        borderWidth: monthlyData.map((value, index) =>
          index === peakIndex ? 2 : 1,
        ),

        borderRadius: 6,
        borderSkipped: false,

        barPercentage: 0.8,
        categoryPercentage: 0.75,

        hoverBackgroundColor: "rgba(14, 165, 233, 1)",
        hoverBorderColor: "#0284c7",
        hoverBorderWidth: 1,
      };
    });

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

  function drawDailyOverviewChart(ctx, type, data, animated = false) {
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
              color: "rgba(0, 0, 0, 0.04)",
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

  function drawLineChart(ctx, type, data, animated = false, chartOpts = {}) {
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
              color: "rgba(0, 0, 0, 0.04)",
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
              color: "rgba(0, 0, 0, 0.04)",
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
  }

  function drawClientPaidOwedHistoryChart(
    ctx,
    type,
    yearlyData,
    animated = false,
    chartOpts = {},
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
              color: "rgba(0, 0, 0, 0.04)",
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
              color: "rgba(0, 0, 0, 0.04)",
            },
          },
        },
      },
    });
  }

  function drawMonthlyTargetChart(ctx, chartId, data) {
    const existing = Chart.getChart(ctx);

    if (existing) {
      existing.destroy();
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
    drawClientPaidOwedHistoryChart,
    drawMonthlyTargetChart,

    drawChart,
    resizeAllCharts,
    animateChart,

    destroyAllCharts,
  };
})();

export { ChartModule };
