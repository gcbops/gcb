import {
  AppUtils,
  TableModule,
} from "./modules.js";

const WidgetModule = (() => {
  function loadTopCardMetrics() {
    AppUtils.cachedGScriptCall("topCardMetrics", "getTopCardMetrics", [], (data) => {
      if (!data) {return AppUtils.showDashboardToast("No metrics found", "error");}

      const map = {
        "Total Hours": data.totalHours,
        "Paid Hours": data.totalPaid,
        "Owed Hours": data.owedHours,
        "Net Hours": data.netHours,
      };

      document.querySelectorAll("#top-card-metrics .card").forEach((card) => {
        const heading = card
          .querySelector(".widget-heading")
          ?.innerText.trim();
        const valueSpan = card.querySelector(".widget-numbers span");

        if (map[heading] !== undefined && valueSpan) {
          valueSpan.textContent = map[heading];
        }
      });
    }
    );
  }

  function loadTopCardMetricsBilling() {
    AppUtils.cachedGScriptCall("topCardMetrics", "getTopCardMetrics", [], (data) => {
      if (!data) {return AppUtils.showDashboardToast("No metrics found", "error");}

      const map = {
        "Total Hours": data.totalHours,
        "Paid Hours": data.totalPaid,
        "Owed Hours": data.owedHours,
        "Net Hours": data.netHours,
      };

      document.querySelectorAll("#top-card-metrics-v2 .widget-content").forEach((card) => {
        const heading = card
          .querySelector(".widget-heading")
          ?.innerText.trim();
        const valueSpan = card.querySelector(".widget-numbers span");

        if (map[heading] !== undefined && valueSpan) {
          valueSpan.textContent = map[heading];
        }
      });
    });
  }

  function loadTopPaidList() {
    const cacheKey = "cache_TopPaid";

    AppUtils.cachedGScriptCall(cacheKey, "getTopPaidAccounts", [], function (data) {
      if (!Array.isArray(data) || !data.length) {return;}

      const ul = document.querySelector("#top-notch-clients");
      if (!ul) {return;}
      ul.innerHTML = "";

      const sorted = [...data].sort((a, b) => (b[1] || 0) - (a[1] || 0)).slice(0, 10);

      sorted.forEach(function (item, index) {
        const [name, paid, owed] = item;
        const roleCacheKey = `role_${name}`;

        // fetch role using callback
        AppUtils.cachedGScriptCall(roleCacheKey, "getRoleFromSheet", [name], function (role) {
          role = role || "";

          const li = document.createElement("li");
          li.className = "list-group-item";

          let rightContent;
          if (owed === 0) {
            rightContent = `
            <div class="font-size-xs text-muted">
              <small class="opacity-5 pr-1">$</small>
              <span>${paid}</span>
              <small class="text-warning pl-2"><i class="fa fa-dot-circle"></i></small>
            </div>`;
          } else {
            rightContent = `
            <div class="font-size-xs text-muted">
              <span>${paid}</span>
              <small class="text-success pl-2"><i class="fa fa-angle-up"></i></small>
            </div>
            <div class="font-size-xs text-muted">
              <span>${owed}</span>
              <small class="text-danger pl-2"><i class="fa fa-angle-down"></i></small>
            </div>`;
          }

          li.innerHTML = `
          <div class="widget-content p-0">
            <div class="widget-content-wrapper">
              <div class="widget-content-left mr-3">
                <div class="avatar-circle swatch-holder swatch-holder-lg bg-malibu-beach text-white rounded-circle d-flex align-items-center justify-content-center"
                  style="width:42px; height:42px; font-weight:600;">
                  ${getInitials(name)}
                </div>
              </div>
              <div class="widget-content-left">
                <div class="widget-heading">${name}</div>
                <div class="widget-subheading">${role}</div>
              </div>
              <div class="widget-content-right font-weight-bold">
                ${rightContent}
              </div>
            </div>
          </div>
        `;

          ul.appendChild(li);
        });
      });
    });
  }

  function loadWorstPaidList() {
    const cacheKey = "cache_WorstPaid";

    AppUtils.cachedGScriptCall(cacheKey, "getTopPaidAccounts", [], function (data) {
      if (!Array.isArray(data) || !data.length) {return;}

      const ul = document.querySelector("#worst-paid-clients");
      if (!ul) {return;}
      ul.innerHTML = "";

      // Sort by lowest paid first, then highest owed
      const sorted = [...data]
        .sort((a, b) => {
          const paidDiff = (a[1] || 0) - (b[1] || 0);
          if (paidDiff !== 0) {return paidDiff;}
          return (b[2] || 0) - (a[2] || 0);
        })
        .slice(0, 10);

      sorted.forEach(function (item) {
        const [name, paid, owed] = item;
        const roleCacheKey = `role_${name}`;

        AppUtils.cachedGScriptCall(roleCacheKey, "getRoleFromSheet", [name], function (role) {
          role = role || "";

          const li = document.createElement("li");
          li.className = "list-group-item";

          let rightContent = `
            <div class="font-size-xs text-muted">
              <span>${paid}</span>
              <small class="text-danger pl-2">
                <i class="fa fa-angle-down"></i>
              </small>
            </div>
          `;

          if (owed > 0) {
            rightContent += `
              <div class="font-size-xs text-muted">
                <span>${owed}</span>
                <small class="text-warning pl-2">
                  <i class="fa fa-exclamation-circle"></i>
                </small>
              </div>
            `;
          }

          li.innerHTML = `
            <div class="widget-content p-0">
              <div class="widget-content-wrapper">
                <div class="widget-content-left mr-3">
                  <div class="avatar-circle swatch-holder swatch-holder-lg bg-love-kiss text-white rounded-circle d-flex align-items-center justify-content-center"
                    style="width:42px; height:42px; font-weight:600;">
                    ${getInitials(name)}
                  </div>
                </div>
                <div class="widget-content-left">
                  <div class="widget-heading">${name}</div>
                  <div class="widget-subheading">${role}</div>
                </div>
                <div class="widget-content-right font-weight-bold">
                  ${rightContent}
                </div>
              </div>
            </div>
          `;

          ul.appendChild(li);
        });
      });
    });
  }

  function loadAllAndActiveClientsInTable(dt) {
    const cached = AppUtils.cacheGet(dt);

    function getStatusColor(status) {
      if (!status) {return "btn-secondary";}
      status = status.toLowerCase();
      if (status.includes("online") || status === "active") {return "bg-grow-early";}
      if (status.includes("idle")) {return "bg-sunny-morning";}
      if (status.includes("offline") || status === "inactive") {return "bg-love-kiss";}
      return "btn-secondary";
    }

    function renderTable(data) {
      const tbody = document.getElementById("dataBody");
      if (!tbody) {return;}

      tbody.innerHTML = "";

      data.forEach((item, index) => {
        const initials = getInitials(item.name);

        const row = document.createElement("tr");
        row.innerHTML = `
        <td class="text-center text-muted font-weight-bold">${index + 1}</td>
        <td>
          <div class="widget-content p-0">
            <div class="widget-content-wrapper">
              <div class="widget-content-left mr-3">
                <div class="avatar-circle bg-malibu-beach text-white rounded-circle d-flex align-items-center justify-content-center" 
                    style="width:40px; height:40px; font-weight:600;">
                  ${initials}
                </div>
              </div>
              <div class="widget-content-left flex2">
                <div class="widget-heading">${item.name}</div>
                <div class="widget-subheading opacity-7">${item.role || ""}</div>
              </div>
            </div>
          </div>
        </td>
        <td class="text-center text-muted">${item.id || ""}</td>
        <td class="text-center text-muted">${item.city || ""}</td>
        <td class="text-center">
          <div class="badge text-white ${getStatusColor(item.status)}">${item.status || ""}</div>
        </td>
        <td class="text-center action-btn">
          <i class="pe-7s-note open-client-btn"></i>
        </td>
      `;

        tbody.appendChild(row);
      });

      // Attach click handler ONCE
      tbody.onclick = e => {
        const btn = e.target.closest(".open-client-btn");
        if (!btn) {return;}

        const row = btn.closest("tr");
        const clientName = row.querySelector(".widget-heading")?.textContent;

        AppUtils.showDashboardToast("Redirecting to sheet!", "info");

        google.script.run
          .withSuccessHandler(url => {
            if (url && url.startsWith("http")) {
              window.open(url, "_blank");
            } else {
              AppUtils.showError(url);
            }
          })
          .withFailureHandler(err => {
            AppUtils.showError(err);
            AppUtils.showDashboardToast("Something went wrong!", "error");
          })
          .goToPresentClient(clientName);
      };
    }

    if (cached && Array.isArray(cached) && cached.length) {
      renderTable(cached);

      AppUtils.cachedGScriptCall(dt, "getClientTableDataWithNickname", [dt], (fresh) => {
        if (Array.isArray(fresh) && JSON.stringify(fresh) !== JSON.stringify(cached)) {
          renderTable(fresh);
        }
      });

      return;
    }

    AppUtils.cachedGScriptCall(dt, "getClientTableDataWithNickname", [dt], (data) => {
      if (Array.isArray(data)) {
        renderTable(data);
      } else {
        AppUtils.showDashboardToast("Something went wrong!", "error");
      }
    });
  }

  function loadAllManualProjects(log = false) {
    const cacheKey = "cache_AllProjects";

    const logIt = (...args) => log && console.log("[loadAllManualProjects]", ...args);

    function renderTable(data) {
      const tbody = document.getElementById("dataBody");
      if (!tbody) {
        logIt("tbody not found");
        return;
      }

      tbody.innerHTML = "";

      data.forEach((row, index) => {
        const colA = row[0] || "";
        const colB = row[1] || "";
        const colC = row[2] || "";

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td class="text-center text-muted font-weight-bold">${index + 1}</td>
          <td>${colA}</td>
          <td class="text-center">${colB}</td>
          <td class="text-center">${colC}</td>
        `;

        tbody.appendChild(tr);
      });

      logIt("table rendered", data.length, "rows");
    }

    $(document).on("click", "#add-new-project", () => {
      AppUtils.openDrawer("#drawerManualAdd", { contentClass: "drawer-grid-5" });
      $("#taskForm .form-group").first().removeClass("element-hidden");
    });

    // ---------- try cache ----------
    const cached = AppUtils.cacheGet(cacheKey);
    if (Array.isArray(cached) && cached.length) {
      logIt("using cached data");
      renderTable(cached);

      // refresh in background
      AppUtils.cachedGScriptCall( cacheKey, "getProjects", [], (fresh) => {
          if (Array.isArray(fresh)) {
            if (JSON.stringify(fresh) !== JSON.stringify(cached)) {
              logIt("cache updated");
              renderTable(fresh);
            }
          }
        },
        log
      );

      return;
    }

    // ---------- no cache ----------
    logIt("no cache, fetching");
    AppUtils.cachedGScriptCall( cacheKey, "getProjects", [], (data) => {
        if (Array.isArray(data)) {
          renderTable(data);
        } else {
          AppUtils.showDashboardToast("Something went wrong!", "error");
        }
      },
      log
    );
  }

  function loadTopProjectList() {
    const cacheKey = "cache_TopProjects";
    const listContainer = document.querySelector("#top-notch-projects");
    if (!listContainer) {return;}

    const renderList = (data) => {
      listContainer.innerHTML = "";
      const sorted = [...data]
        .sort((a, b) => (b[1] || 0) - (a[1] || 0))
        .slice(0, 10);

      for (const item of sorted) {
        const [project, hours, client] = item;

        const li = `
        <li class="list-group-item">
          <div class="widget-content p-0">
            <div class="widget-content-wrapper">
              <div class="widget-content-left mr-3">
                <div class="avatar-circle swatch-holder swatch-holder-lg bg-malibu-beach text-white rounded-circle d-flex align-items-center justify-content-center"
                    style="width:42px; height:42px; font-weight:600;">
                  ${getInitials(client)}
                </div>
              </div>
              <div class="widget-content-left">
                <div class="widget-heading">${project}</div>
                <div class="widget-subheading">${client}</div>
              </div>
              <div class="widget-content-right font-weight-bold">
                <div class="font-size-xs text-muted">
                  <span>${hours}</span>
                  <small class="text-warning pl-2"><i class="fas fa-briefcase"></i></small>
                </div>
              </div>
            </div>
          </div>
        </li>`;

        listContainer.insertAdjacentHTML("beforeend", li);
      }
    };

    AppUtils.cachedGScriptCall(cacheKey, "getTopProjects", [], (data) => {
      if (!Array.isArray(data) || !data.length) {return;}
      renderList(data);
    });
  }

  function loadWorstProjectList() {
    const cacheKey = "cache_WorstProjects";
    const listContainer = document.querySelector("#low-performing-projects");
    if (!listContainer) {return;}

    const renderList = (data) => {
      listContainer.innerHTML = "";

      const sorted = [...data]
        // sort by lowest hours first
        .sort((a, b) => (a[1] || 0) - (b[1] || 0))
        .slice(0, 10);

      for (const item of sorted) {
        const [project, hours, client] = item;

        const li = `
          <li class="list-group-item">
            <div class="widget-content p-0">
              <div class="widget-content-wrapper">
                <div class="widget-content-left mr-3">
                  <div class="avatar-circle swatch-holder swatch-holder-lg bg-love-kiss text-white rounded-circle d-flex align-items-center justify-content-center"
                      style="width:42px; height:42px; font-weight:600;">
                    ${getInitials(client)}
                  </div>
                </div>
                <div class="widget-content-left">
                  <div class="widget-heading">${project}</div>
                  <div class="widget-subheading">${client}</div>
                </div>
                <div class="widget-content-right font-weight-bold">
                  <div class="font-size-xs text-muted">
                    <span>${hours}</span>
                    <small class="text-danger pl-2">
                      <i class="fas fa-exclamation-circle"></i>
                    </small>
                  </div>
                </div>
              </div>
            </div>
          </li>`;

        listContainer.insertAdjacentHTML("beforeend", li);
      }
    };

    AppUtils.cachedGScriptCall(cacheKey, "getTopProjects", [], (data) => {
      if (!Array.isArray(data) || !data.length) {return;}
      renderList(data);
    });
  }

  function loadPercentagesDataCards(containerId, growthId, yearType) {
    const container = document.getElementById(containerId);
    const growthEl = document.getElementById(growthId);
    if (!container) {return;}

    const suffix = containerId.split("-").pop();

    if (!container.querySelectorAll(".widget-numbers").length && !container.querySelectorAll(".progress-bar").length) {return;}
    if (growthEl) {growthEl.textContent = "Loading...";}
    Array.from(container.querySelectorAll(".widget-numbers")).forEach(el => el.textContent = "0%");
    Array.from(container.querySelectorAll(".progress-bar")).forEach(el => {
      el.style.width = "0%";
      el.setAttribute("aria-valuenow", "0");
    });

    google.script.run
      .withSuccessHandler((data) => {
        if (!data || !Array.isArray(data.percentages)) {
          container.querySelectorAll(".widget-numbers").forEach(el => el.textContent = "-");
          if (growthEl) {growthEl.textContent = "-";}
          return;
        }

        const { percentages, paidGrowth } = data;
        const colors =
          yearType === "current"
            ? ["bg-arielle-smile", "bg-sunny-morning", "bg-ripe-malin", "bg-grow-early"]
            : ["bg-deep-blue", "bg-tempting-azure", "bg-ripe-malin", "bg-grow-early"];

        percentages.forEach(([label, value], index) => {
          const percent = parseFloat(value || 0).toFixed(1);
          const color = colors[index % colors.length];

          const percentEl = document.getElementById(`percent-${index + 1}-${suffix}`);
          const labelEl = document.getElementById(`label-${index + 1}-${suffix}`);
          const progressEl = document.getElementById(`progress-${index + 1}-${suffix}`);

          if (percentEl) {percentEl.textContent = `${percent}%`;}
          if (labelEl) {labelEl.textContent = index >= 2 ? label.split(" ").slice(1).join(" ") : label;}
          if (progressEl) {
            progressEl.style.width = `${percent}%`;
            progressEl.setAttribute("aria-valuenow", percent);
            progressEl.className = `progress-bar ${color}`;
          }
        });

        if (growthEl) {
          const growthValue = parseFloat(paidGrowth || 0).toFixed(2);
          let growthClass, growthIcon;

          if (growthValue > 0) { growthClass = "text-success"; growthIcon = `<i class="fa fa-angle-up"></i>`; }
          else if (growthValue < 0) { growthClass = "text-danger"; growthIcon = `<i class="fa fa-angle-down"></i>`; }
          else { growthClass = "text-warning"; growthIcon = `<i class="fa fa-dot-circle"></i>`; }

          growthEl.classList.remove("text-success", "text-danger", "text-warning");
          growthEl.classList.add(growthClass);
          growthEl.innerHTML = `${growthIcon} ${growthValue}%`;
        }
      })
      .withFailureHandler((err) => {
        container.querySelectorAll(".widget-numbers").forEach(el => el.textContent = "-");
        if (growthEl) {growthEl.textContent = "Error";}
        AppUtils.showError(err);
        AppUtils.showDashboardToast("Something went wrong!", "error");
      })
      .getPercentagesOnLabSheet(yearType);
  }

  function loadGrindValues(isRefresh) {
    AppUtils.cachedGScriptCall("grindValues", "getGrindValues", [], (data) => {
      if (!data) {return;}

      document.getElementById("daily-grind-val").textContent = data.daily;
      document.getElementById("monthly-grind-val").textContent = data.monthly;
      document.getElementById("yearly-grind-val").textContent = data.yearly;
    }, false, isRefresh);
  }

  function loadTargetPercentsCards(cacheKey, functionName, idSuffix, useColors = false) {
    AppUtils.cachedGScriptCall(cacheKey, functionName, [], (data) => {
      if (!data) {return;}

      Object.entries(data).forEach(([id, val]) => {
        const box = document.querySelector(`#${id}-${idSuffix}`);
        if (!box || typeof val !== "number") {return;}

        box.querySelector(".widget-numbers").textContent = `${val.toFixed(2)}%`;

        const bar = box.querySelector(".progress-bar");
        if (!bar) {return;}

        bar.setAttribute("aria-valuenow", val);
        bar.style.width = `${val}%`;

        if (useColors) {
          bar.classList.remove("bg-success", "bg-info", "bg-warning", "bg-danger");

          if (val >= 100) {
            bar.classList.add("bg-success");
          } else if (val >= 75) {
            bar.classList.add("bg-info");
          } else if (val >= 50) {
            bar.classList.add("bg-warning");
          } else if (val >= 25) {
            bar.classList.add("bg-danger");
          }
        }
      });
    });
  }

  function loadClientsDataByCategory(sheetName, title, status, debug = false) {
    const log = (...args) => debug && console.log(...args);

    const cacheKey = "cache_" + status.replace(/\s+/g, "");

    log("[loadClientsDataByCategory] start", {
      sheetName,
      title,
      status,
      cacheKey
    });

    AppUtils.cachedGScriptCall(
      cacheKey,
      "getDialogTitle",
      [status, sheetName],
      (data) => {
        log("[loadClientsDataByCategory] callback data:", data);

        if (Array.isArray(data)) {
          log("[loadClientsDataByCategory] rendering table");
          TableModule.renderData(data, sheetName, title, status);
        } else {
          log("[loadClientsDataByCategory] invalid data", data);
          AppUtils.showError("⚠️ invalid dialog data");
        }
      }
    );
  }

  function loadUpsellSummary(forceRefresh = false) {
    AppUtils.cachedGScriptCall("upsellSummary", "getUpsellSummary", [], function (summary) {
      summary = summary || { total: 0, today: 0, month: 0 };
      const totalEl = document.getElementById('total');
      const todayEl = document.getElementById('today');
      const monthEl = document.getElementById('month');
      if (totalEl) {totalEl.textContent = summary.total;}
      if (todayEl) {todayEl.textContent = summary.today;}
      if (monthEl) {monthEl.textContent = summary.month;}
    });
  }

  function loadUpsellRecords(forceRefresh = false) {
    AppUtils.cachedGScriptCall( "upsellRecords", "getUpsellRecords", [], function (table) {
        TableModule.renderUpsellRecords(table);
      }
    );
  }

  function loadHourlyTotalCard() {
    google.script.run
      .withSuccessHandler(function (dt) {
        const ttlw = $("#total-hourly-hours");
        if(ttlw.length) {ttlw.children('span').text(dt);}
      })
      .withFailureHandler((err) => {
        AppUtils.showError(err);
        AppUtils.showDashboardToast("Sheet or cell value doesn't exist!", "error");
      })
      .getDirectCellValueSafe("Hourly History", "B8");
  }

  const loadReportsExportsPageData = () => {

    AppUtils.cachedGScriptCall( "reportsPageData", "getReportsPageData", [], (data) => {
        renderReportLogs(data.logs);
        renderReportStatus(data);
        renderReportCounts(data.counts);
      },
      false,
      true
    );

  };

  const loadReportsPageData = ( cacheKey, gasFunction, tableId, callback = null ) => {

    AppUtils.cachedGScriptCall(  cacheKey, gasFunction, [], (data) => {
        renderReportsTable(tableId, data.logs);
        if (typeof callback === "function") {
          callback(data);
        }
      },
      false,
      true
    );

  };

  const loadCustomMonthlyReportsPageData = (callback = null) =>
    loadReportsPageData(
      "monthlyReportsPageData",
      "getMonthlyReportsPageData",
      "monthlyReportsTable",
      callback
    );

  const loadCustomYearlyReportsPageData = (callback = null) =>
    loadReportsPageData(
      "yearlyReportsPageData",
      "getYearlyReportsPageData",
      "yearlyReportsTable",
      callback
    );

  const renderReportsTable = (tableId, logs) => {

    const tbody = $(`#${tableId}`);

    tbody.empty();

    if (!logs.length) {

      tbody.append(`
        <tr>
          <td colspan="4" class="text-center text-muted py-4">
            No reports generated yet.
          </td>
        </tr>
      `);

      return;

    }

    logs.forEach((log, index) => {

      tbody.append(`
        <tr>
          <<td class="text-center"><b>${index + 1}</b></td>
          <td>${log.date}</td>

          <td class="text-center">
            <span class="badge bg-light text-info">
              ${log.name}
            </span>
          </td>

          <td class="text-center">
              <div class="btn-group btn-group-sm">

                  <button
                      class="btn btn-report-action btn-view-report"
                      data-url="${log.link}"
                      title="View Report">

                      <i class="fa fa-eye"></i>

                  </button>

                  <button
                      class="btn btn-report-action btn-email-report"
                      data-id="${log.id}"
                      title="Send Email">

                      <i class="fa fa-envelope"></i>

                  </button>

                  <button
                      class="btn btn-report-action btn-discord-report"
                      data-id="${log.id}"
                      title="Send to Discord">

                      <i class="fab fa-discord"></i>

                  </button>

              </div>
          </td>
        </tr>
      `);

    });

  };

  const renderReportLogs = (logs) => {

    const tbody = $("#reportLogsTable");
    tbody.empty();

    logs.forEach((log, index) => {

      const badgeClass =
        log.type === "Monthly"
          ? "bg-primary"
          : "bg-success";

      tbody.append(`
        <tr>
          <td class="text-center"><b>${index + 1}</b></td>
          <td>${log.date}</td>
          <td class="text-center">
            <span class="badge bg-light text-info">
              ${log.name}
            </span>
          </td>
          <td class="text-center">
            <span class="badge text-white ${badgeClass}">
              ${log.type}
            </span>
          </td>
          <td class="text-center">
              <div class="btn-group btn-group-sm">

                  <button
                      class="btn btn-report-action btn-view-report"
                      data-url="${log.link}"
                      title="View Report">

                      <i class="fa fa-eye"></i>

                  </button>

                  <button
                      class="btn btn-report-action btn-email-report"
                      data-id="${log.id}"
                      title="Send Email">

                      <i class="fa fa-envelope"></i>

                  </button>

                  <button
                      class="btn btn-report-action btn-discord-report"
                      data-id="${log.id}"
                      title="Send to Discord">

                      <i class="fab fa-discord"></i>

                  </button>

              </div>
          </td>
        </tr>
      `);

    });

  };

  function renderReportStatus(data) {

    const monthly = data.logs.filter(x => x.type === "Monthly");
    const yearly = data.logs.filter(x => x.type === "Yearly");

    $("#last-monthly-report").text(
      monthly.length ? monthly[0].date : "-"
    );

    $("#last-yearly-report").text(
      yearly.length ? yearly[0].date : "-"
    );

    $("#next-scheduled-report").text(
      data.nextScheduled
    );

    $("#drive-storage-status")
      .text(data.driveStorage ? "Connected" : "Not Connected")
      .toggleClass("text-success", data.driveStorage)
      .toggleClass("text-danger", !data.driveStorage);

    $("#discord-status")
      .text(data.discord ? "Connected" : "Not Connected")
      .toggleClass("text-success", data.discord)
      .toggleClass("text-danger", !data.discord);

    $("#email-status")
      .text(data.email ? "Connected" : "Not Connected")
      .toggleClass("text-success", data.email)
      .toggleClass("text-danger", !data.email);

  }

  function renderReportCounts(counts) {
    $("#monthly-reports-count").text(counts.monthly);
    $("#yearly-reports-count").text(counts.yearly);
    $("#pdf-generated-count").text(counts.pdfGenerated);
    $("#automation-status")
      .text(counts.automation ? "Active" : "Warning")
      .toggleClass("text-success",counts.automation)
      .toggleClass("text-danger", !counts.automation);
  }

  // ---- EXTRA UTILS ----

  function getInitials(name) {
    if (!name) {return "";}
    return name.split(" ").filter(Boolean).map(w => w[0].toUpperCase()).join("").slice(0, 3);
  }

  return {
    loadTopCardMetrics,
    loadTopCardMetricsBilling,
    loadTopPaidList,
    loadWorstPaidList,
    loadTopProjectList,
    loadWorstProjectList,
    loadAllAndActiveClientsInTable,
    loadAllManualProjects,
    loadPercentagesDataCards,
    loadGrindValues,
    loadTargetPercentsCards,
    loadClientsDataByCategory,
    loadUpsellSummary,
    loadUpsellRecords,
    loadHourlyTotalCard,
    loadReportsExportsPageData,
    loadCustomMonthlyReportsPageData,
    loadCustomYearlyReportsPageData
  };
})();

export { WidgetModule };