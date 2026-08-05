import { AppUtils } from "./utils.js";

const ChartModule = (() => {
  let chartInstances = {};
  let animationFrames = {};

  function loadChart(type, animated = false, year = "all") {
    const chartDiv = document.getElementById("chart_div_" + type);
    if (!chartDiv) {return AppUtils.showError(`chart_div_${type} not found`);}

    chartDiv.innerText = "Loading chart...";

    const funcMap = {
      daily: "getDailyChartData",
      monthly: "getMonthlyChartData",
      yearly: "getYearlyChartData",
      monthly_prev: "getMonthlyChartData",
      monthly_prev_combined: "getPrevYearMonthlyChartData",
      hourly: "getHourlyChartData",
    };

    const func = funcMap[type];
    if (!func) {return AppUtils.showError(`No Apps Script function mapped for type ${type}`);}

    const cacheKey =
      func === "getYearlyChartData"
        ? `chartData_${type}_${year}`
        : `chartData_${type}`;

    const args = func === "getYearlyChartData" ? [year] : [];

    AppUtils.cachedGScriptCall(cacheKey, func, args, (data) => {
      if (!Array.isArray(data) || !data.length) {
        chartDiv.innerText = "No data found.";
        return;
      }

      drawChart(type, data, false, animated);
    });
  }

  function loadPrevYearCombinedChart() {
    const chartId = "monthly_prev_merged";
    const prevCacheKey = "chartData_monthly_prev";
    const currentCacheKey = "chartData_monthly";

    let prevData = AppUtils.cacheGet(prevCacheKey);
    let currentData = AppUtils.cacheGet(currentCacheKey);

    if (prevData && currentData) {
      drawChart(chartId, { prevYear: prevData, currentYear: currentData });
    }

    if (!prevData) {fetchData("monthly_prev", prevCacheKey, (data) => {
      prevData = data;
      if (currentData) {drawChart(chartId, { prevYear: prevData, currentYear: currentData });}
    });}

    if (!currentData) {fetchData("monthly", currentCacheKey, (data) => {
      currentData = data;
      if (prevData) {drawChart(chartId, { prevYear: prevData, currentYear: currentData });}
    });}

    function fetchData(type, cacheKey, cb) {
      // console.log(`Fetching data for ${type}...`);
      const funcName = type === "monthly_prev" ? "getPrevYearMonthlyChartData" : "getMonthlyChartData";

      google.script.run
        .withSuccessHandler((data) => {
          if (!Array.isArray(data) || !data.length) {return AppUtils.showError(`${type} returned empty or invalid data`);}
          AppUtils.cacheSet(cacheKey, data);
          cb(data);
        })
        .withFailureHandler((err) => AppUtils.showError(`Failed to fetch ${type}: ${err}`))[funcName]();
    }
  }

  function drawChart(type, dataArray, debug = false, animated = false) {
    const log = (...args) => debug && console.log(...args);
    const warn = (...args) => debug && console.warn(...args);
    const error = (...args) => debug && console.error(...args);

    log("drawChart called 👉", { type, dataArray });

    const chartDiv = document.getElementById("chart_div_" + type);

    if (!chartDiv) {
      error(`chart_div_${type} not found`);
      return AppUtils.showError(`chart_div_${type} not found`);
    }

    if (!dataArray || (Array.isArray(dataArray) && !dataArray.length)) {
      warn("No data found for chart:", type);
      chartDiv.innerText = "No data found.";
      return;
    }

    chartDiv.innerHTML = `<canvas id="chartCanvas_${type}"></canvas>`;
    const canvas = document.getElementById(`chartCanvas_${type}`);
    const ctx = canvas.getContext("2d");

    if (chartInstances[type]) {
      log("Destroying existing chart instance:", type);
      chartInstances[type].destroy();
      delete chartInstances[type];
    }

    // ---------- Yearly bar chart ----------
    if (type === "yearly") {
      log("Rendering yearly bar chart");

      const labels = dataArray.map(r => r[0]);
      const paid = dataArray.map(r => Number(r?.[2]) || 0);
      const owed = dataArray.map(r => Number(r?.[3]) || 0);
      const net  = dataArray.map(r => Number(r?.[4]) || 0);

      log("Yearly data parsed:", { labels, paid, owed, net });

      const paidGradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
      paidGradient.addColorStop(0, "rgba(14, 165, 233, 0.8)");
      paidGradient.addColorStop(1, "rgba(14, 165, 233, 0.4)");

      const owedGradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
      owedGradient.addColorStop(0, "rgba(249, 115, 22, 0.8)");
      owedGradient.addColorStop(1, "rgba(249, 115, 22, 0.4)");

      const netGradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
      netGradient.addColorStop(0, "rgba(16, 185, 129, 0.8)");
      netGradient.addColorStop(1, "rgba(16, 185, 129, 0.4)");

      chartInstances[type] = new Chart(ctx, {
        type: "bar",
        data: {
          labels,
          datasets: [
            { label: "Net Paid", data: paid, backgroundColor: paidGradient },
            { label: "Net Owed", data: owed, backgroundColor: owedGradient },
            { label: "Net Hrs", data: net, backgroundColor: netGradient },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: "top" },
            tooltip: {
              mode: "index",
              intersect: false,
              callbacks: {
                label: (ctx) =>
                  `${ctx.dataset.label}: ${ctx.formattedValue} hrs`,
              },
            },
          },
          interaction: { mode: "index", intersect: false },
          scales: {
            x: { grid: { display: false } },
            y: { beginAtZero: true },
          },
        },
      });
      return;
    }

    // ---------- Hourly bar chart ----------
    if (type === "hourly") {
      log("Rendering hourly bar chart");

      const labels = dataArray.map(r => String(r[0] || ""));
      const values = dataArray.map(r => Number(r[1]) || 0);

      const barGradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
      barGradient.addColorStop(0, "rgba(14,165,233,0.8)");
      barGradient.addColorStop(1, "rgba(14,165,233,0.3)");

      chartInstances[type] = new Chart(ctx, {
        type: "bar",
        data: {
          labels,
          datasets: [{
            label: "Total",
            data: values,
            backgroundColor: barGradient,
            borderColor: "#0ea5e9",
            borderWidth: 2,
            borderRadius: 6,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            title: {
              display: true,
              text: "Hourly History by Year",
              color: "#334155",
              font: { size: 18, weight: "600" },
            },
            tooltip: {
              callbacks: {
                label: ctx => `${ctx.formattedValue} hrs`,
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: "#475569" },
            },
            y: {
              beginAtZero: true,
              grid: { color: "rgba(0,0,0,0.05)" },
              ticks: { color: "#475569" },
            },
          },
        },
      });

      return;
    }

    // ---------- Merged prev/current year monthly chart ----------
    if (type === "monthly_prev_merged") {
      log("Rendering merged monthly chart");

      const months = Array.from({ length: 12 }, (_, i) => i + 1);
      const monthMap = {
        January: 1, February: 2, March: 3, April: 4,
        May: 5, June: 6, July: 7, August: 8,
        September: 9, October: 10, November: 11, December: 12,
      };

      function fillMonthlyData(data) {
        return months.map(m => {
          const entry = data.find(d => {
            if (!d || d.length < 2) {return false;}
            const monthName = d[0]?.split(" ")[0];
            return monthMap[monthName] === m;
          });
          return entry ? Number(entry[1]) : 0;
        });
      }

      const prev = fillMonthlyData(dataArray.prevYear || []);
      const current = fillMonthlyData(dataArray.currentYear || []);

      log("Monthly data parsed:", { prev, current });

      const prevGradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
      prevGradient.addColorStop(0, "rgba(249, 115, 22, 0.8)");
      prevGradient.addColorStop(1, "rgba(249, 115, 22, 0.4)");

      const currentGradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
      currentGradient.addColorStop(0, "rgba(14, 165, 233, 0.8)");
      currentGradient.addColorStop(1, "rgba(14, 165, 233, 0.4)");

      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

      chartInstances[type] = new Chart(ctx, {
        type: "bar",
        data: {
          labels: monthNames,
          datasets: [
            { label: "Previous Year", data: prev, backgroundColor: prevGradient },
            { label: "Current Year", data: current, backgroundColor: currentGradient },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "top" } },
          interaction: { mode: "index", intersect: false },
          scales: {
            x: { grid: { display: false } },
            y: { beginAtZero: true },
          },
        },
      });
      return;
    }

    // ---------- Daily / Monthly line chart ----------
    log("Rendering line chart");

    const labels = dataArray.map(r => r[0]);
    const values = dataArray.map(r => Number(r[1] || 0));

    log("Line chart data:", { labels, values });

    const gradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
    gradient.addColorStop(0, "rgba(14, 165, 233, 0.5)");
    gradient.addColorStop(1, "rgba(231, 246, 254, 0.2)");

    chartInstances[type] = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: type === "monthly" ? "Monthly Data" : "Daily Data",
          data: values,
          borderColor: "#0ea5e9",
          backgroundColor: gradient,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,

        ...(animated && {
          animations: {
            tension: {
              duration: 1500,
              easing: "easeInOutQuart",
              from: 1,
              to: 0.4,
              loop: true
            }
          }
        }),

        scales: {
          x: { grid: { display: false }, ticks: { display: false }, border: { display: false } },
          y: { grid: { display: false }, ticks: { display: false }, border: { display: false } },
        },

        plugins: { legend: { display: false } },
      },
    });

    log("✅ Chart rendered:", type);
  }

  function drawRealtimeAnimatedChart() {
    const type = "sample_realtime_animated";
    const chartDiv = document.getElementById("chart_div_" + type);

    if (!chartDiv) {return;}

    chartDiv.innerHTML = `<canvas id="chartCanvas_${type}"></canvas>`;

    const ctx = document
      .getElementById(`chartCanvas_${type}`)
      .getContext("2d");


    if (chartInstances[type]) {
      chartInstances[type].destroy();
      delete chartInstances[type];
    }

    const realtimeData = {
      datasets: [
        {
          label: "Dataset 1",
          data: [],
          borderColor: "#0ea5e9",
          backgroundColor: "transparent",
          borderDash: [8,4],
          borderWidth: 3,
          pointRadius: 0,
          tension: 0.4
        },
        {
          label: "Dataset 2",
          data: [],
          borderColor: "#f97316",
          backgroundColor: "transparent",
          borderWidth: 3,
          pointRadius: 0,
          tension: 0.4
        }
      ]
    };

    chartInstances[type] = new Chart(ctx, {
      type: "line",
      data: realtimeData,

      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: {
          intersect: false,
          mode: "nearest"
        },
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          x: {
            type: "linear",
            ticks: {
              display: false
            },
            grid: {
              display:false
            }
          },
          y: {
            beginAtZero:false,
            grid:{
              display:false
            }
          }
        }
      }
    });

    let lastTime = 0;
    let value1 = 20;
    let value2 = 60;
    let target1 = 20;
    let target2 = 60;

    function animate(time) {

      if (!chartInstances[type]) {return;}

      // around 80fps
      if (time - lastTime > 80) {

        const now = Date.now();
        value1 += (target1 - value1) * 0.03;
        value2 += (target2 - value2) * 0.03;
        // occasionally pick new targets
        if (Math.abs(value1 - target1) < 2) {
          target1 = Math.random() * 100;
        }

        if (Math.abs(value2 - target2) < 2) {
          target2 = Math.random() * 100;
        }

        chartInstances[type].data.datasets[0].data.push({
          x: now,
          y: value1
        });

        chartInstances[type].data.datasets[1].data.push({
          x: now,
          y: value2
        });

        // keep only last 30 seconds
        const cutoff = now - 30000;

        chartInstances[type].data.datasets.forEach(ds => {
          ds.data = ds.data.filter(p => p.x >= cutoff);
        });

        chartInstances[type].options.scales.x.min = cutoff;
        chartInstances[type].options.scales.x.max = now;
        chartInstances[type].update("none");

        lastTime = time;
      }
      animationFrames[type] = requestAnimationFrame(animate);;
    }
    animationFrames[type] = requestAnimationFrame(animate);;
  }

  function destroyRealtimeChart() {

      Object.keys(animationFrames).forEach(type => {
          cancelAnimationFrame(animationFrames[type]);
      });

      animationFrames = {};

      Object.keys(chartInstances).forEach(type => {
          chartInstances[type].destroy();
          delete chartInstances[type];
      });

      chartInstances = {};

  }

  return {
    loadChart,
    drawRealtimeAnimatedChart,
    loadPrevYearCombinedChart,
    destroyRealtimeChart,
  };
})();

export { ChartModule };