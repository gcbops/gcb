import { ChartModule } from "../charts.js";
import { RouterModule } from "../routers.js";
import { DataTableModule } from "../tables/data-table.js";
import { AppUtils } from "../utils.js";

const clientDetailsPage = (() => {
  let bound = false;
  let clientName = "";

  const CACHE_KEY_PREFIX = "clientDetails_";

  let clientDetailsData = null;
  let selectedHoursYear = null;

  function init() {
    if (bound) {
      return;
    }

    bound = true;

    clientName = String(
      sessionStorage.getItem("clientDetailsName") || "",
    ).trim();

    if (!clientName) {
      RouterModule.go("home");
      console.error("No client selected.");
      return;
    }

    $("#client-details-name").html(`
      <span>${AppUtils.escapeHtml(clientName)}</span>
      <span class="client-details-loading ms-2">
        <i class="fa-solid fa-spinner fa-spin"></i>
        <span>Loading details<span class="loading-dots"></span></span>
      </span>
    `);

    bindEvents();
    load();
  }

  function destroy() {
    if (!bound) {return;}

    bound = false;

    ChartModule.destroyChart?.("client-hours-month");
    ChartModule.destroyChart?.("client-daily-hours");
    ChartModule.destroyChart?.("client-paid-owed");

    DataTableModule.destroy?.("#client-paid-owed-history");
    DataTableModule.destroy?.("#client-projects");
    DataTableModule.destroy?.("#client-activity");

    $(document).off("change.clientDetails", "#client-hours-year", "[data-client-action]", ".edit-info");

    clientDetailsData = null;
    selectedHoursYear = null;
    clientName = "";
  }

  function load(reset = false) {
    const cacheKey = `${CACHE_KEY_PREFIX}${clientName}`;

    AppUtils.cachedGScriptCall(
      cacheKey,
      "getClientDetails",
      [clientName],
      render,
      false,
      reset,
    );
  }

  function render(data) {
    if (!data) {
      showError("No client data found.");
      return;
    }

    clientDetailsData = data;

    renderProfile(data.profile);
    renderSummary(data.summary);
    renderTasks(data.tasks);
    renderCurrentActivity(data.currentActivity);

    renderYearOptions(data.hoursByMonth);

    renderHoursByMonthChart();
    renderDailyHoursChart();
    renderPaidOwedChart();

    renderPaidOwedHistory(data.yearlyBilling);
    renderProjects(data.projects);
    renderActivity(data.activity);
  }

  function renderProfile(profile = {}) {
    setText("#client-details-name", profile.name);
    setText("#client-details-role", profile.role || "—");

    setText("#client-details-email .edit-info-value", profile.email || "—");
    setText(
      "#client-details-owner .edit-info-value",
      profile.accountOwner || "—",
    );
    setText(
      "#client-details-payment .edit-info-value",
      profile.paymentDetails || "—",
    );
  }

  function renderSummary(summary = {}) {
    setMetric("client-projects", summary.projects);
    setMetric("client-hours", summary.totalRenderedTime);

    setMetric("client-paid", summary.totalPaid);
    setMetric("client-owed", summary.totalOwed);

    setMetric("total-balance-owed", summary.totalBalanceOwed);
    setMetric("current-month-owed", summary.currentMonthBalanceOwed);

    setMetric("project-count", summary.projects);
  }

  function renderTasks(tasks = {}) {
    setMetric("dev-tasks", tasks.dev);
    setMetric("design-tasks", tasks.design);
    setMetric("seo-tasks", tasks.seo);
  }

  function renderCurrentActivity(activity = {}) {
    setMetric("current-week-hours", activity.week);
    setMetric("current-month-hours", activity.month);
    setMetric("current-year-hours", activity.year);
  }

  function renderYearOptions(data) {
    const select = document.getElementById("client-hours-year");

    if (!select) {return;}

    const years = [
      ...new Set((data || []).map((item) => Number(item.year)).filter(Boolean)),
    ].sort((a, b) => b - a);

    if (!years.length) {
      select.innerHTML = "";
      selectedHoursYear = null;
      return;
    }

    if (!selectedHoursYear || !years.includes(selectedHoursYear)) {
      selectedHoursYear = years[0];
    }

    select.innerHTML = years
      .map(
        (year) =>
          `<option value="${year}" ${
            year === selectedHoursYear ? "selected" : ""
          }>${year}</option>`,
      )
      .join("");

    AppUtils.initSelect2(".chart-filters");
  }

  function renderProjects(data) {
    const table = document.querySelector("#client-projects tbody");

    if (!table) {return;}

    table.innerHTML = (data || [])
      .map(
        (project) => `
        <tr>
          <td>${AppUtils.escapeHtml(project.name)}</td>
          <td>${formatHours(project.totalHours)}</td>
          <td>${AppUtils.escapeHtml(String(project.activeYear || ""))}</td>
          <td>${AppUtils.escapeHtml(String(project.activeMonth || ""))}</td>
          <td>${AppUtils.escapeHtml(String(project.startDate || ""))}</td>
        </tr>
      `,
      )
      .join("");

    DataTableModule.init("Projects", "#client-projects", false);
    
  }

  function renderPaidOwedHistory(data) {
    const table = document.querySelector("#client-paid-owed-history tbody");

    if (!table) {return;}

    table.innerHTML = (data || [])
      .map(
        (item) => `
        <tr>
          <td>${item.year}</td>
          <td>${formatHours(item.hoursPaid)}</td>
          <td>${formatHours(item.hoursOwed)}</td>
          <td>${formatHours(item.netHours)}</td>
        </tr>
      `,
      )
      .join("");

    DataTableModule.init(
      "Billing History",
      "#client-paid-owed-history",
      false,
      null,
      true,
    );
  }

  function renderActivity(data) {
    const table = document.querySelector("#client-activity tbody");

    if (!table) {return;}

    table.innerHTML = (data || [])
      .map(
        (item) => `
        <tr>
          <td>${AppUtils.escapeHtml(item.type)}</td>

          <td>${AppUtils.escapeHtml(item.project)}</td>

          <td>${formatHours(item.hours)}</td>

          <td>${AppUtils.escapeHtml(item.date)}</td>

          <td>${AppUtils.escapeHtml(item.paymentStatus)}</td>
        </tr>
      `,
      )
      .join("");

    DataTableModule.init("Activity", "#client-activity", false);
  }

  function renderHoursByMonthChart() {
    if (!clientDetailsData?.hoursByMonth || !selectedHoursYear) {
      return;
    }

    const data = clientDetailsData.hoursByMonth
      .filter((item) => item.year === selectedHoursYear)
      .sort((a, b) => a.monthIndex - b.monthIndex)
      .map((item) => [item.monthIndex, item.hours]);

    ChartModule.drawChart(
      "client_hours_month",
      {
        [selectedHoursYear]: data,
      },
      false,
      false,
    );
  }

  function renderDailyHoursChart() {
    if (!clientDetailsData?.dailyHours) {
      return;
    }

    const data = clientDetailsData.dailyHours.map((item) => [
      item.day,
      item.hours,
    ]);

    ChartModule.drawChart("client_daily_hours", data, false, false);
  }

  function renderPaidOwedChart() {
    if (!clientDetailsData?.yearlyBilling) {
      return;
    }

    ChartModule.drawChart(
      "client_paid_owed",
      clientDetailsData.yearlyBilling,
      false,
      false,
    );
  }

  function bindEvents() {
    document.addEventListener("click", handleClick);

    const yearSelect = document.getElementById("client-hours-year");

    if (yearSelect) {
      $(yearSelect).on("change", function () {
        selectedHoursYear = Number($(this).val()) || null;
        renderHoursByMonthChart();
      });
    }
  }

  function handleClick(event) {
    const action = event.target.closest("[data-client-action], .edit-info");

    if (!action) {
      return;
    }

    const type = action.dataset.clientAction || action.id;

    switch (type) {
      case "open-sheet":
        event.preventDefault();

        openClientSheet();
        break;

      case "edit-email":
      case "edit-account-owner":
      case "edit-payment-details": {
        const field = getEditableField(type);

        if (!field || !clientName) {
          return;
        }

        openEditableInfo(action, clientName, field);
        break;
      }
    }
  }

  function openClientSheet() {
    google.script.run
      .withSuccessHandler((url) => {
        if (url) {
          window.open(url, "_blank");
        }
      })
      .withFailureHandler((error) => {
        AppUtils.showError(error?.message || "Unable to open client sheet.");
      })
      .getClientSheetUrl(clientName);
  }

  function getEditableField(buttonId) {
    const fields = {
      "edit-email": {
        key: "email",
        label: "Email",
      },

      "edit-account-owner": {
        key: "accountOwner",
        label: "Account Owner",
      },

      "edit-payment-details": {
        key: "paymentDetails",
        label: "Payment Details",
      },
    };

    return fields[buttonId] || null;
  }

  function openEditableInfo(button, clientName, field) {
    const container = button.closest(".text-dark");

    if (!container) {
      return;
    }

    const valueElement = container.querySelector(".edit-info-value");

    if (!valueElement) {
      return;
    }

    const currentValue = valueElement.textContent.trim();

    const input = document.createElement("input");

    input.type = "text";
    input.className = "form-control form-control-sm";
    input.value = currentValue === "—" ? "" : currentValue;

    const saveButton = document.createElement("button");

    saveButton.type = "button";
    saveButton.className = "btn btn-sm btn-gc ms-2";
    saveButton.innerHTML = '<i class="fa-solid fa-check"></i>';

    const cancelButton = document.createElement("button");

    cancelButton.type = "button";
    cancelButton.className = "btn btn-sm btn-light ms-1";
    cancelButton.innerHTML = '<i class="fa-solid fa-xmark"></i>';

    const editor = document.createElement("div");

    editor.className = "d-flex align-items-center w-100";
    editor.append(input, saveButton, cancelButton);

    container.replaceChildren(editor);

    input.focus();
    input.select();

    const cancel = () => {
      restoreEditButton(container.id, currentValue === "—" ? "" : currentValue);
    };

    cancelButton.addEventListener("click", cancel);

    saveButton.addEventListener("click", () => {
      saveEditableInfo(
        clientName,
        field,
        input.value.trim(),
        container.id,
        saveButton,
      );
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        saveButton.click();
      }

      if (event.key === "Escape") {
        cancel();
      }
    });
  }

  function restoreEditButton(containerId, value) {
    const config = {
      "client-details-email": {
        buttonId: "edit-email",
        title: "Edit email",
      },

      "client-details-owner": {
        buttonId: "edit-account-owner",
        title: "Edit account owner",
      },

      "client-details-payment": {
        buttonId: "edit-payment-details",
        title: "Edit payment details",
      },
    };

    const item = config[containerId];

    if (!item) {
      return;
    }

    const container = document.getElementById(containerId);

    if (!container) {
      return;
    }

    value = value || "—";

    container.innerHTML = `
      <span class="edit-info-value">
        ${AppUtils.escapeHtml(value)}
      </span>

      <button
        type="button"
        class="btn btn-sm btn-link edit-info text-secondary p-1 ms-1"
        id="${item.buttonId}"
        title="${item.title}"
        aria-label="${item.title}"
      >
        <i class="fa-solid fa-pencil"></i>
      </button>
    `;
  }

  function saveEditableInfo(clientName, field, value, containerId, saveButton) {
    if (saveButton.disabled) {
      return;
    }

    AppUtils.confirmAction(
      `updateClientInformation-${field.key}`,
      `Update ${field.label}?`,
      `This will update the client's ${field.label.toLowerCase()} to "${
        value || "blank"
      }". Proceed?`,
      () => {
        submitEditableInfo(
          clientName,
          field.key,
          value,
          containerId,
          saveButton,
        );
      },
    );
  }

  function submitEditableInfo(
    clientName,
    field,
    value,
    containerId,
    saveButton,
  ) {
    if (saveButton.disabled) {
      return;
    }

    saveButton.disabled = true;
    saveButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    const input = saveButton.closest(".d-flex")?.querySelector("input");

    if (input) {
      input.disabled = true;
    }

    google.script.run
      .withSuccessHandler(() => {
        restoreEditButton(containerId, value);

        AppUtils.showDashboardToast("Client information updated.", "success");

        AppUtils.cacheClear(`${CACHE_KEY_PREFIX}${clientName}`);
      })
      .withFailureHandler((error) => {
        saveButton.disabled = false;

        if (input) {
          input.disabled = false;
        }

        saveButton.innerHTML = '<i class="fa-solid fa-check"></i>';

        AppUtils.showError(
          error?.message || "Unable to update client information.",
        );
      })
      .updateClientInformation(clientName, field, value);
  }

  function setText(selector, value) {
    const element = document.querySelector(selector);

    if (element) {
      element.textContent = value ?? "—";
    }
  }

  function setMetric(name, value) {
    const element = document.querySelector(`[data-metric="${name}"]`);

    if (element) {
      element.textContent = formatNumber(value);
    }
  }

  function formatNumber(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "0.0";
    }

    return number.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }

  function formatHours(value) {
    return Number(value || 0).toLocaleString(undefined, {
      maximumFractionDigits: 2,
    });
  }

  function showError(message) {
    AppUtils.showError(message);
  }

  return {
    init,
    destroy,
    load,
  };
})();

export { clientDetailsPage };
