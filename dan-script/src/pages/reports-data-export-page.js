import { AppUtils } from "../utils/utils.js";
import { DataTableModule } from "../components/data-table.js";
import { ReportsOverview } from "../reports/overview.js";
import { ReportActions } from "../reports/actions.js";
import { TableFilterService } from "../tables/table-filter-service.js";
import {
  getAuthArgs,
  handleInvalidSessionError,
} from "../auth/auth-error-handler.js";
import { ReportService } from "../reports/service.js";
import { RequestManager } from "../requests/request-manager.js";

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

        const reportUrl = ReportService.getSafeReportUrl(url);

        if (!reportUrl) {
          AppUtils.showError("Report link is invalid or unavailable.");
          return;
        }

        window.open(reportUrl, "_blank", "noopener,noreferrer");
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
        const tbody = document.querySelector(
          "#billing-records-export-table-body",
        );
        const text = tbody.textContent.trim();

        if (text.includes("No Billing Records found")) {
          AppUtils.confirmAction(
            "syncBillingRecords",
            "No Billing Records Found",
            "The billing records have not been updated yet for the selected date range. Would you like to update and sync the billing records now?",
            () => {
              const button = $("#btn-generate-billing-records-csv");
              syncBillingRecords(button);
            },
          );
        } else {
          AppUtils.confirmAction(
            "generateBillingRecordsCsv",
            "Generate Billing Records?",
            "This will generate billing records for the selected date range. Do you want to continue?",
            () => {
              handleGenerateBillingRecordsCSV();
            },
          );
        }
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

  const loadBillingRecords = async (startDate, endDate) => {
    DataTableModule.showLoader(BILLING_TABLE_ID);

    try {
      const [sessionId, signature] = await getAuthArgs();

      AppUtils.gScriptRun({
        gscriptFunc: "getBillingRecordsForExport",

        args: [sessionId, signature, startDate, endDate],

        onSuccess: (data) => {
          renderBillingRecords(data);
        },

        onError: (error) => {
          DataTableModule.showError(
            BILLING_TABLE_ID,
            error?.message || "Failed to load Billing Records.",
          );
        },
      });
    } catch (error) {
      if (handleInvalidSessionError(error)) {
        return;
      }

      DataTableModule.showError(
        BILLING_TABLE_ID,
        error?.message || "Failed to load Billing Records.",
      );
    }
  };

  async function syncBillingRecords(button) {
    const loading = AppUtils.setButtonLoading(button, "Syncing Records");

    try {
      const [sessionId, signature] = await getAuthArgs();

      AppUtils.gScriptRun({
        gscriptFunc: "syncBillingRecords",
        args: [sessionId, signature],

        onSuccess: (response) => {
          loading.restore();

          if (!response?.success) {
            AppUtils.showError("Unable to sync Billing Records.");
            return;
          }

          $("#billingRecordsFilterSubmit").trigger("click");

          AppUtils.showDashboardToast(
            `Billing Records synced: ${response.records} record(s).`,
            "success",
          );
        },

        onError: (error) => {
          loading.restore();

          AppUtils.showError(
            error?.message || "Failed to sync Billing Records.",
          );
        },
      });
    } catch (error) {
      loading.restore();

      if (handleInvalidSessionError(error)) {
        return;
      }

      AppUtils.showError(error?.message || "Failed to sync Billing Records.");
    }
  }

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

    DataTableModule.hideTableOverlay(BILLING_TABLE_ID);

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

    DataTableModule.init(BILLING_TABLE_TITLE, BILLING_TABLE_ID, false, {
      paging: false,
      scrollY: "420px",
      layout: {
        topStart: null,
        topEnd: null,
        bottomStart: ["info"],
        bottomEnd: ["search"],
      },
    });
  };

  const handleGenerateBillingRecordsCSV = async () => {
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
    
    const requestId = RequestManager.enqueue(
      "generate-billing-csv",
      { startDate, endDate },
      `Generate Billing Records CSV — ${startDate} to ${endDate}`,
    );

    if (!requestId) {
      return;
    }

    AppUtils.showDashboardToast(
      "Billing Records CSV added to the request queue.",
    );

    let unsubscribeCompletion = () => {};

    unsubscribeCompletion = RequestManager.subscribe((state) => {
      const finishedRequest = state.history.find(
        (request) => request.id === requestId,
      );

      if (!finishedRequest) {
        return;
      }

      unsubscribeCompletion();

      if (finishedRequest.status !== "completed") {
        return;
      }

      const result = finishedRequest.result;

      loadBillingRecords(startDate, endDate);
      ReportsOverview.loadReportsOverview();
      loadBillingCSVExportCount();

      if (result?.downloaded) {
        AppUtils.showDashboardToast(
          `Existing CSV downloaded (${result.recordCount} records).`,
          "success",
        );
        return;
      }

      AppUtils.showDashboardToast(
        result?.reusedExisting
          ? `Existing CSV reused (${result.recordCount} records).`
          : `CSV generated successfully (${result.recordCount} records).`,
        "success",
      );
    });

  };

  const loadBillingCSVExportCount = async () => {
    try {
      const [sessionId, signature] = await getAuthArgs();

      AppUtils.gScriptRun({
        gscriptFunc: "getBillingRecordsCSVExportCount",
        args: [sessionId, signature],

        onSuccess: (count) => {
          $("#csv-generated-count").text(Number(count || 0));
        },

        onError: (error) => {
          console.warn(
            "[ReportsDataExport] Failed to load CSV export count:",
            error,
          );
        },
      });
    } catch (error) {
      if (handleInvalidSessionError(error)) {
        return;
      }

      AppUtils.showError(
        error?.message || "Failed to load CSV export count.",
      );
    }
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
