import { AppUtils } from "../utils.js";
import { DataTableModule } from "../tables/data-table.js";
import { ReportsOverview } from "../reports/overview.js";
import { ReportActions } from "../reports/actions.js";
import { TableFilterService } from "../tables/table-filter-service.js";

const reportsDataExportPage = (() => {
  let bound = false;
  let datePicker = null;

  const DATE_RANGE_CACHE_KEY = "billingRecordsExportDateRange";

  const BILLING_TABLE_ID = "#billing-records-export-table";
  const BILLING_TABLE_BODY_ID = "billing-records-export-table-body";
  const BILLING_TABLE_TITLE = "Billing Records Export";

  const init = () => {
    if (bound) {
      return;
    }

    bound = true;

    initDateRangePicker();
    bindActions();
    loadData();
    loadBillingCSVExportCount();
  };

  const destroy = () => {
    if (!bound) {
      return;
    }

    bound = false;

    if (datePicker) {
      datePicker.destroy();
      datePicker = null;
    }

    DataTableModule.destroy(BILLING_TABLE_ID);

    TableFilterService.destroy("reportHistoryTypeFilter");

    $(document).off(".reports");
  };

  const bindActions = () => {
    $(document)
      .off(".reports")

      // Report History actions
      .on("click.reports", ".btn-view-report", (e) => {
        const url = $(e.currentTarget).data("url");

        if (url) {
          window.open(url, "_blank");
        }
      })

      .on("click.reports", ".btn-email-report", function () {
        const $btn = $(this);

        AppUtils.confirmAction(
          "emailReport",
          "Send Email Report?",
          "Are you sure you want to dispatch this custom report via email?",
          () => ReportActions.handleEmailReport($btn),
        );
      })

      .on("click.reports", ".btn-discord-report", function () {
        const $btn = $(this);

        AppUtils.confirmAction(
          "discordReport",
          "Send Discord Notification?",
          "This will broadcast an active notification stream to the designated channel. Proceed?",
          () => ReportActions.handleDiscordReport($btn),
        );
      })

      // Billing Records export
      .on(
        "click.reports",
        "#billingRecordsFilterSubmit",
        applyBillingRecordsDateRange,
      )

      .on("click.reports", "#btn-generate-billing-records-csv", () => {
        AppUtils.confirmAction(
          "generateBillingRecordsCsv",
          "Generate Billing Records?",
          "This will generate billing records for the selected date range. Do you want to continue?",
          () => {
            handleGenerateBillingRecordsCSV();
          },
        );
      });
  };

  const loadData = () => {
    ReportsOverview.loadReportsOverview();

    const cachedRange = AppUtils.cacheGet(DATE_RANGE_CACHE_KEY);

    if (cachedRange?.startDate && cachedRange?.endDate) {
      updateSelectedRange(cachedRange.startDate, cachedRange.endDate);

      $("#btn-generate-billing-records-csv").prop("disabled", false);

      loadBillingRecords(cachedRange.startDate, cachedRange.endDate);

      return;
    }

    const today = formatDate(new Date());

    updateSelectedRange(today, today);
    loadBillingRecords(today, today);

    $("#btn-generate-billing-records-csv").prop("disabled", false);
  };

  const initDateRangePicker = () => {
    const $input = $("#billingRecordsDateRange");

    if (!$input.length || typeof window.flatpickr !== "function") {
      console.warn("[ReportsDataExport] Flatpickr is not available.");
      return;
    }

    const today = new Date();
    const todayString = formatDate(today);

    const cachedRange = AppUtils.cacheGet(DATE_RANGE_CACHE_KEY);

    const startDate = cachedRange?.startDate || todayString;

    const endDate = cachedRange?.endDate || todayString;

    datePicker = window.flatpickr($input[0], {
      mode: "range",
      showMonths: window.innerWidth <= 767 ? 1 : 2,
      dateFormat: "M d, Y",
      defaultDate: [parseLocalDate(startDate), parseLocalDate(endDate)],
      maxDate: "today",
      disableMobile: true,

      onOpen: function (selectedDates, dateStr, instance) {
        instance.set("minDate", null);
      },

      onChange: function (selectedDates, dateStr, instance) {
        if (selectedDates.length === 1) {
          instance.set("minDate", selectedDates[0]);
        }
      },
    });
  };

  const applyBillingRecordsDateRange = () => {
    const dates = datePicker?.selectedDates || [];

    if (!dates.length) {
      AppUtils.showError("Please select a date range.");
      return;
    }

    const startDate = formatDate(dates[0]);

    const endDate = formatDate(dates[1] || dates[0]);

    saveDateRange(startDate, endDate);

    updateSelectedRange(startDate, endDate);

    $("#btn-generate-billing-records-csv").prop("disabled", false);

    loadBillingRecords(startDate, endDate);
  };

  const loadBillingRecords = (startDate, endDate) => {
    DataTableModule.showLoader(BILLING_TABLE_ID);

    google.script.run
      .withSuccessHandler((data) => {
        renderBillingRecords(data);
      })
      .withFailureHandler((error) => {
        DataTableModule.showError(
          BILLING_TABLE_ID,
          error?.message || "Failed to load Billing Records.",
        );
      })
      .getBillingRecordsForExport(startDate, endDate);
  };

  function normalizeBillingStatus(value) {
    const status = String(value || "").toUpperCase();

    if (status.includes("DISPUTED")) {
      return "DISPUTED";
    }

    if (status.includes("OUTSTANDING")) {
      return "OUTSTANDING";
    }

    if (status.includes("UNPAID")) {
      return "UNPAID";
    }

    if (status.includes("INVOICED")) {
      return "INVOICED";
    }

    if (status.includes("PAID")) {
      return "PAID";
    }

    return status;
  }

  const renderBillingRecords = (records) => {
    const tbody = document.getElementById(BILLING_TABLE_BODY_ID);

    if (!tbody) {
      return;
    }

    DataTableModule.destroy(BILLING_TABLE_ID);

    tbody.innerHTML = "";

    if (!Array.isArray(records) || !records.length) {
      DataTableModule.showEmpty(
        BILLING_TABLE_ID,
        "No Billing Records found for the selected date range.",
      );
      return;
    }

    records.forEach((record, index) => {
      const tr = document.createElement("tr");

      const status = normalizeBillingStatus(record?.paymentStatus);

      const badgeClass =
        {
          PAID: "bg-success",
          UNPAID: "bg-danger",
          INVOICED: "bg-warning",
          OUTSTANDING: "bg-alternate",
          DISPUTED: "bg-dark",
        }[status] || "bg-secondary";

      tr.innerHTML = `
      <td class="text-center">
        <b>${index + 1}</b>
      </td>

      <td>
        ${AppUtils.escapeHtml(record?.client || "")}
      </td>

      <td>
        ${AppUtils.escapeHtml(record?.type || "")}
      </td>

      <td>
        ${AppUtils.escapeHtml(record?.project || "")}
      </td>

      <td class="text-end">
        ${AppUtils.formatHours(Number(record?.hours || 0))}
      </td>

      <td>
        ${AppUtils.escapeHtml(formatDisplayDate(record?.date))}
      </td>

      <td class="text-center">
        <span class="badge ${badgeClass}">
          ${AppUtils.escapeHtml(status)}
        </span>
      </td>
    `;

      tbody.appendChild(tr);
    });

    DataTableModule.init(BILLING_TABLE_TITLE, BILLING_TABLE_ID, false);
  };

  const handleGenerateBillingRecordsCSV = () => {
    const dates = datePicker?.selectedDates || [];

    if (!dates.length) {
      AppUtils.showError("Please select a date range.");
      return;
    }

    const startDate = formatDate(dates[0]);

    const endDate = formatDate(dates[1] || dates[0]);

    if (startDate > endDate) {
      AppUtils.showError("The start date cannot be later than the end date.");
      return;
    }

    const button = document.getElementById("btn-generate-billing-records-csv");

    const loading = AppUtils.setButtonLoading(button, "Generating");

    google.script.run
      .withSuccessHandler((result) => {
        if (loading) {
          loading.restore();
        }

        if (!result?.success || !result?.url) {
          AppUtils.showError("The Billing Records CSV could not be generated.");
          return;
        }

        AppUtils.showDashboardToast(
          `CSV generated successfully (${result.recordCount} records).`,
        );

        loadBillingRecords(startDate, endDate);

        ReportsOverview.loadReportsOverview();

        window.open(result.url, "_blank");

        loadBillingCSVExportCount();
      })
      .withFailureHandler((error) => {
        if (loading) {
          loading.restore();
        }

        AppUtils.showError(
          error?.message || "Failed to generate the Billing Records CSV.",
        );
      })
      .saveBillingRecordsCSV(startDate, endDate);
  };

  const loadBillingCSVExportCount = () => {
    google.script.run
      .withSuccessHandler((count) => {
        $("#csv-generated-count").text(Number(count || 0));
      })
      .withFailureHandler((error) => {
        console.warn(
          "[ReportsDataExport] Failed to load CSV export count:",
          error,
        );
      })
      .getBillingRecordsCSVExportCount();
  };

  const updateSelectedRange = (startDate, endDate) => {
    const start = parseLocalDate(startDate);
    const end = parseLocalDate(endDate);

    const startText = formatDisplayDate(start);
    const endText = formatDisplayDate(end);

    $("#billingRecordsSelectedRange").text(
      startText === endText ? startText : `${startText} – ${endText}`,
    );
  };

  const saveDateRange = (startDate, endDate) => {
    AppUtils.cacheSet(DATE_RANGE_CACHE_KEY, {
      startDate,
      endDate,
    });
  };

  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  };

  const parseLocalDate = (value) => {
    if (!value) {
      return new Date();
    }

    const [year, month, day] = value.split("-").map(Number);

    return new Date(year, month - 1, day);
  };

  const formatDisplayDate = (value) => {
    if (!value) {
      return "";
    }

    if (value instanceof Date) {
      return value.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }

    const dateString = String(value);

    const date = new Date(`${dateString}T00:00:00`);

    if (Number.isNaN(date.getTime())) {
      return dateString;
    }

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return {
    init,
    destroy,
  };
})();

export { reportsDataExportPage };
