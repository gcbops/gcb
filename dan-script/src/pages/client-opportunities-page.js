import { AppUtils } from "../utils.js";
import { DataTableModule } from "../tables/data-table.js";
import { ChartModule } from "../charts.js";
import { ValidationModule } from "../validations.js";

const clientOpportunitiesPage = (() => {
  let bound = false;

  const PAGE_ID = "#client-opportunities-page";

  const UPSELL_TABLE_ID = "#opportunitiesUpsellTable";
  const UPSELL_BODY_ID = "opportunitiesUpsellBody";

  const UPSELL_RECORDS_CACHE_KEY = "upsellRecords";
  const UPSELL_SUMMARY_CACHE_KEY = "upsellSummary";

  const MODAL_ID = "#app-modal";

  const UPSELL_MODAL_NS = ".clientOpportunitiesUpsell";

  const HOURLY_MODAL_NS = ".clientOpportunitiesHourly";

  const LEGACY_CLIENTS_CACHE_KEY = "legacyClients";

  function init() {
    if (bound) {
      return;
    }

    bound = true;

    bindActions();
    loadData();
  }

  function destroy() {
    if (!bound) {
      return;
    }

    bound = false;

    const $page = $(PAGE_ID);

    $page.off(".clientOpportunities");

    $(MODAL_ID).off(UPSELL_MODAL_NS);
    $(MODAL_ID).off(HOURLY_MODAL_NS);

    DataTableModule.destroy(UPSELL_TABLE_ID);
  }

  function bindActions() {
    const $page = $(PAGE_ID);

    if (!$page.length) {
      return;
    }

    $page
      .off(`click.clientOpportunities`, "#viewSheet-opportunities-upsell")
      .on(
        `click.clientOpportunities`,
        "#viewSheet-opportunities-upsell",
        () => {
          openSheet("Upsells", "Unable to open the Upsells sheet.");
        },
      );

    $page
      .off(`click.clientOpportunities`, "#viewSheet-opportunities-hourly")
      .on(
        `click.clientOpportunities`,
        "#viewSheet-opportunities-hourly",
        () => {
          openSheet(
            "Hourly History",
            "Unable to open the Hourly History sheet.",
          );
        },
      );

    $page
      .off(`click.clientOpportunities`, "#viewSheet-opportunities-legacy")
      .on(
        `click.clientOpportunities`,
        "#viewSheet-opportunities-legacy",
        () => {
          openSheet(
            "Legacy Clients",
            "Unable to open the Legacy Clients sheet.",
          );
        },
      );

    $page
      .off(`click.clientOpportunities`, "#add-opportunity-upsell")
      .on(`click.clientOpportunities`, "#add-opportunity-upsell", () => {
        openUpsellModal();
      });

    $page
      .off(`click.clientOpportunities`, "#add-opportunity-hourly")
      .on(`click.clientOpportunities`, "#add-opportunity-hourly", () => {
        openHourlyModal();
      });
  }

  function openSheet(sheetName, errorMessage) {
    const buttonId =
      sheetName === "Upsells"
        ? "#viewSheet-opportunities-upsell"
        : sheetName === "Hourly History"
          ? "#viewSheet-opportunities-hourly"
          : sheetName === "Legacy Clients"
            ? "#viewSheet-opportunities-legacy"
            : null;

    const btn = document.querySelector(buttonId);

    if (!btn) {
      return;
    }

    const loading = AppUtils.setButtonLoading(btn, "Redirecting");

    AppUtils.gScriptRun({
      gscriptFunc: "getClientSheetUrl",

      args: [sheetName],

      onSuccess: (url) => {
        loading.restore();

        if (url && String(url).startsWith("http")) {
          window.open(url, "_blank");
          return;
        }

        AppUtils.showError(errorMessage);
      },

      onError: (err) => {
        loading.restore();

        AppUtils.showError(err);
      },
    });
  }

  function loadData() {
    loadUpsellSummary();
    loadUpsellRecords();
    loadLegacyClients();
    loadTotalHourlyHours();
    loadHourlyChart();
  }

  // ----------------------------------------------------------
  // Upsell summary
  // ----------------------------------------------------------

  function loadUpsellSummary(forceRefresh = false) {
    AppUtils.cachedGScriptCall(
      UPSELL_SUMMARY_CACHE_KEY,
      "getUpsellSummary",
      [],
      (summary) => {
        renderUpsellSummary(summary);
      },
      false,
      forceRefresh,
    );
  }

  function renderUpsellSummary(summary) {
    const data = summary || {
      total: 0,
      today: 0,
      month: 0,
    };

    const totalEl = document.getElementById("opportunities-total-upsell");

    const todayEl = document.getElementById("opportunities-upsell-today");

    const monthEl = document.getElementById("opportunities-upsell-month");

    if (totalEl) {
      totalEl.textContent = AppUtils.formatHours(data.total ?? 0);
    }

    if (todayEl) {
      todayEl.textContent = AppUtils.formatHours(data.today ?? 0);
    }

    if (monthEl) {
      monthEl.textContent = AppUtils.formatHours(data.month ?? 0);
    }
  }

  // ----------------------------------------------------------
  // Upsell records
  // ----------------------------------------------------------

  function loadUpsellRecords(forceRefresh = false) {
    if (forceRefresh || !AppUtils.cacheGet(UPSELL_RECORDS_CACHE_KEY)) {
      DataTableModule.showLoader(UPSELL_TABLE_ID);
    }

    AppUtils.cachedGScriptCall(
      UPSELL_RECORDS_CACHE_KEY,
      "getUpsellRecords",
      [],
      (tableData) => {
        renderUpsellTable(tableData);
      },
      false,
      forceRefresh,
    );
  }

  function renderUpsellTable(tableData) {
    const tbody = document.getElementById(UPSELL_BODY_ID);

    if (!tbody) {
      return;
    }

    if (!Array.isArray(tableData) || tableData.length === 0) {
      DataTableModule.destroy(UPSELL_TABLE_ID);

      DataTableModule.showEmpty(UPSELL_TABLE_ID, "No upsell records yet.");

      return;
    }

    DataTableModule.destroy(UPSELL_TABLE_ID);

    tbody.innerHTML = "";

    tableData.forEach((row) => {
      tbody.appendChild(createUpsellRow(row));
    });

    DataTableModule.init("Upsell Opportunities", UPSELL_TABLE_ID);
  }

  function createUpsellRow(row) {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>
        ${AppUtils.escapeHtml(row?.[0] ?? "")}
      </td>

      <td class="text-center">
        ${AppUtils.escapeHtml(row?.[1] ?? "")}
      </td>

      <td class="text-center">
        ${AppUtils.escapeHtml(row?.[2] ?? "")}
      </td>
    `;

    return tr;
  }

  // ----------------------------------------------------------
  // Add Upsell modal
  // ----------------------------------------------------------

  function openUpsellModal() {
    AppUtils.openModal(MODAL_ID, {
      size: "lg",
      placement: "center",

      header: `
      <strong>Add Upsell Opportunity</strong>
    `,

      body: `
      <div id="upsell-form-body">
        <form id="upsellOpportunityForm">

          <div class="position-relative form-group">
            <label for="opportunity-clientName">
              Client Name
            </label>

            <input
              type="text"
              id="opportunity-clientName"
              class="form-control"
              required
            >
          </div>

          <div class="position-relative form-group">
            <label for="opportunity-screenshot">
              Screenshot
            </label>

            <input
              type="text"
              id="opportunity-screenshot"
              class="form-control"
            >
          </div>

          <div class="position-relative form-group">
            <label for="opportunity-upsellHours">
              Upsell Hours
            </label>

            <input
              type="number"
              id="opportunity-upsellHours"
              class="form-control"
              step="0.5"
              required
            >
          </div>

          <div class="position-relative form-group">
            <label for="opportunity-totalHours">
              Orasan Hours
            </label>

            <input
              type="number"
              id="opportunity-totalHours"
              class="form-control"
              step="0.5"
            >
          </div>

          <div class="position-relative form-group">
            <label for="opportunity-orasanDate">
              Orasan Date
            </label>

            <input
              type="text"
              id="opportunity-orasanDate"
              class="form-control"
            >
          </div>

          <div class="position-relative form-group">
            <label for="opportunity-reportedDate">
              Reported Date
            </label>

            <input
              type="text"
              id="opportunity-reportedDate"
              class="form-control"
              required
            >
          </div>

        </form>
      </div>

      <div id="upsell-review-body" class="d-none">
        <p class="mb-3">
          Please review the upsell entry before submitting.
        </p>

        <div class="mb-2">
          <strong>Client:</strong>
          <span id="upsell-review-client"></span>
        </div>

        <div class="mb-2">
          <strong>Upsell Hours:</strong>
          <span id="upsell-review-hours"></span>
        </div>

        <div class="mb-2">
          <strong>Orasan Hours:</strong>
          <span id="upsell-review-total-hours"></span>
        </div>

        <div class="mb-2">
          <strong>Orasan Date:</strong>
          <span id="upsell-review-orasan-date"></span>
        </div>

        <div class="mb-2">
          <strong>Reported Date:</strong>
          <span id="upsell-review-reported-date"></span>
        </div>

        <div class="mb-2">
          <strong>Screenshot:</strong>
          <span id="upsell-review-screenshot"></span>
        </div>
      </div>
    `,

      footer: `
      <div id="upsell-form-footer">
        <button
          type="button"
          class="btn btn-secondary btn-cancel"
        >
          Cancel
        </button>

        <button
          type="button"
          class="btn btn-primary btn-save"
        >
          Save Upsell
        </button>
      </div>

      <div id="upsell-review-footer" class="d-none">
        <button
          type="button"
          class="btn btn-secondary btn-back"
        >
          Back
        </button>

        <button
          type="button"
          class="btn btn-success btn-proceed"
        >
          Proceed
        </button>
      </div>
    `,

      onOpen($modal) {
        $modal
          .off(UPSELL_MODAL_NS)
          .on(`click${UPSELL_MODAL_NS}`, ".btn-cancel", () => {
            AppUtils.closeModal(MODAL_ID);
          })
          .on(`click${UPSELL_MODAL_NS}`, ".btn-save", () => {
            submitUpsell($modal);
          })
          .on(`click${UPSELL_MODAL_NS}`, ".btn-back", () => {
            $modal
              .find("#upsell-review-body, #upsell-review-footer")
              .addClass("d-none");

            $modal
              .find("#upsell-form-body, #upsell-form-footer")
              .removeClass("d-none");
          })
          .on(`click${UPSELL_MODAL_NS}`, ".btn-proceed", () => {
            const data = $modal.data("upsell-data");
            const $button = $modal.find(".btn-proceed");
            AppUtils.lockModal(MODAL_ID);

            submitUpsellToServer($modal, data, $button);
          });
      },

      onClose($modal) {
        $modal.off(UPSELL_MODAL_NS);
      },
    });
  }

  function submitUpsell($modal) {
    const $form = $modal.find("#upsellOpportunityForm");

    if (!$form.length) {
      return;
    }

    const clientNameResult = ValidationModule.requiredString(
      $form.find("#opportunity-clientName").val(),
      "Client name",
      { maxLength: 100 },
    );

    if (!clientNameResult.valid) {
      AppUtils.showError(clientNameResult.message);
      return;
    }

    const screenshot = String(
      $form.find("#opportunity-screenshot").val() || "",
    ).trim();

    const upsellHoursResult = ValidationModule.number(
      $form.find("#opportunity-upsellHours").val(),
      "Upsell hours",
      { min: Number.EPSILON },
    );

    if (!upsellHoursResult.valid) {
      AppUtils.showError(upsellHoursResult.message);
      return;
    }

    const totalHoursRaw = String(
      $form.find("#opportunity-totalHours").val() || "",
    ).trim();

    let totalHours = "";

    if (totalHoursRaw) {
      const result = ValidationModule.number(totalHoursRaw, "Orasan hours", {
        min: Number.EPSILON,
      });

      if (!result.valid) {
        AppUtils.showError(result.message);
        return;
      }

      totalHours = result.value;
    }

    const orasanDate = String(
      $form.find("#opportunity-orasanDate").val() || "",
    ).trim();

    const reportedDateResult = ValidationModule.requiredString(
      $form.find("#opportunity-reportedDate").val(),
      "Reported date",
      { maxLength: 100 },
    );

    if (!reportedDateResult.valid) {
      AppUtils.showError(reportedDateResult.message);
      return;
    }

    const data = {
      clientName: clientNameResult.value,
      screenshot,
      upsellHours: upsellHoursResult.value,
      totalHours,
      orasanDate,
      reportedDate: reportedDateResult.value,
    };

    // Populate review
    $modal.find("#upsell-review-client").text(data.clientName);
    $modal.find("#upsell-review-hours").text(`${data.upsellHours} hrs`);
    $modal.find("#upsell-review-total-hours").text(`${data.totalHours} hrs`);
    $modal.find("#upsell-review-orasan-date").text(data.orasanDate);
    $modal.find("#upsell-review-reported-date").text(data.reportedDate);
    $modal.find("#upsell-review-screenshot").text(data.screenshot);

    $modal.data("upsell-data", data);

    $modal.find("#upsell-form-body, #upsell-form-footer").addClass("d-none");

    $modal
      .find("#upsell-review-body, #upsell-review-footer")
      .removeClass("d-none");
  }

  function submitUpsellToServer($modal, data, $submitBtn) {
    AppUtils.submitForm({
      gscriptFunc: "addUpsellEntry",
      data,
      $btn: $submitBtn,
      loadingText: "Saving upsell",

      onSuccess: () => {
        handleUpsellSaveSuccess();
      },
    });
  }

  function handleUpsellSaveSuccess() {
    AppUtils.showDashboardToast("Record added successfully!", "success");

    AppUtils.closeModal(MODAL_ID);

    AppUtils.resetCacheKeys([
      UPSELL_RECORDS_CACHE_KEY,
      UPSELL_SUMMARY_CACHE_KEY,
    ]);

    loadUpsellSummary(true);
    loadUpsellRecords(true);
  }

  // ----------------------------------------------------------
  // Legacy Clients records
  // ----------------------------------------------------------

  function loadLegacyClients(forceRefresh = false) {
    AppUtils.cachedGScriptCall(
      LEGACY_CLIENTS_CACHE_KEY,
      "getLegacyClients",
      [],
      (data) => {
        data = data || {
          clients: [],
          total: 0,
          fixed: 0,
          hourly: 0,
        };

        renderLegacySummary(data);
        renderLegacyClientsTable(data.clients);
      },
      false,
      forceRefresh,
    );
  }

  function renderLegacySummary(data) {
    $("#opportunities-legacy-clients").text(data.total ?? 0);

    $("#opportunities-fixed-clients").text(data.fixed ?? 0);

    $("#opportunities-manual-clients").text(data.manual ?? 0);

    $("#opportunities-hourly-clients").text(data.hourly ?? 0);
  }

  function renderLegacyClientsTable(clients) {
    const tbody = document.getElementById("opportunitiesLegacyBody");

    if (!tbody) {
      return;
    }

    if (!Array.isArray(clients) || clients.length === 0) {
      DataTableModule.showEmpty(
        "#opportunitiesLegacyTable",
        "No legacy clients found",
      );
      return;
    }

    tbody.innerHTML = "";

    clients.forEach((client) => {
      const tr = document.createElement("tr");

      tr.innerHTML = `
      <td>
        ${AppUtils.escapeHtml(client.name)}
      </td>

      <td>
        ${AppUtils.escapeHtml(client.type)}
      </td>
    `;

      tbody.appendChild(tr);
    });

    DataTableModule.init("Legacy Clients", "#opportunitiesLegacyTable");
  }

  // ----------------------------------------------------------
  // Hourly
  // ----------------------------------------------------------

  function loadHourlyChart(forceRefresh = false) {
    ChartModule.loadChart("hourly", false, false, forceRefresh);
  }

  function loadTotalHourlyHours() {
    AppUtils.gScriptRun({
      gscriptFunc: "getDirectCellValueSafe",

      args: ["Hourly History", "B8"],

      onSuccess: (value) => {
        const $total = $("#opportunities-total-hourly-hours");

        if (!$total.length) {
          return;
        }

        $total.find("span").text(AppUtils.formatHours(Number(value) || 0));
      },

      onError: (err) => {
        AppUtils.showError(err);

        AppUtils.showDashboardToast("Unable to load hourly totals.", "error");
      },
    });
  }

  // ----------------------------------------------------------
  // Add hourly monthly total modal
  // ----------------------------------------------------------

  function openHourlyModal() {
    AppUtils.openModal(MODAL_ID, {
      size: "md",
      placement: "center",

      header: `
      <strong>Add Current Month Total</strong>
    `,

      body: `
      <div id="hourly-form-body">
        <form id="addOpportunityHourlyForm">

          <div class="position-relative form-group">
            <label for="opportunity-hourly-value">
              Current Month Total
            </label>

            <input
              type="number"
              step="0.01"
              id="opportunity-hourly-value"
              class="form-control"
              placeholder="Enter Current Month Total"
              required
            >
          </div>

        </form>
      </div>

      <div id="hourly-review-body" class="d-none">
        <p class="mb-2">
          Please review the current month total before submitting.
        </p>

        <div class="fw-semibold fs-5">
          <span id="hourly-review-value"></span> hrs
        </div>
      </div>
    `,

      footer: `
      <div id="hourly-form-footer">
        <button
          type="button"
          class="btn btn-secondary btn-cancel"
        >
          Cancel
        </button>

        <button
          type="button"
          class="btn btn-primary btn-save"
        >
          Save Total
        </button>
      </div>

      <div id="hourly-review-footer" class="d-none">
        <button
          type="button"
          class="btn btn-secondary btn-back"
        >
          Back
        </button>

        <button
          type="button"
          class="btn btn-success btn-proceed"
        >
          Proceed
        </button>
      </div>
    `,

      onOpen($modal) {
        $modal
          .off(HOURLY_MODAL_NS)
          .on(`click${HOURLY_MODAL_NS}`, ".btn-cancel", () => {
            AppUtils.closeModal(MODAL_ID);
          })
          .on(`click${HOURLY_MODAL_NS}`, ".btn-save", () => {
            submitHourlyTotal($modal);
          })
          .on(`click${HOURLY_MODAL_NS}`, ".btn-back", () => {
            $modal
              .find("#hourly-review-body, #hourly-review-footer")
              .addClass("d-none");

            $modal
              .find("#hourly-form-body, #hourly-form-footer")
              .removeClass("d-none");
          })
          .on(`click${HOURLY_MODAL_NS}`, ".btn-proceed", () => {
            const value = $modal.data("hourly-total-value");
            const $button = $modal.find(".btn-proceed");

            AppUtils.lockModal(MODAL_ID);

            submitHourlyTotalToServer($modal, value, $button);
          });
      },

      onClose($modal) {
        $modal.off(HOURLY_MODAL_NS);
      },
    });
  }

  function submitHourlyTotal($modal) {
    const $input = $modal.find("#opportunity-hourly-value");

    const result = ValidationModule.number(
      $input.val(),
      "Current month total",
      { min: Number.EPSILON },
    );

    if (!result.valid) {
      AppUtils.showError(result.message);
      return;
    }

    const numericValue = result.value;

    $modal.find("#hourly-review-value").text(numericValue.toFixed(2));

    $modal.data("hourly-total-value", numericValue);

    $modal.find("#hourly-form-body, #hourly-form-footer").addClass("d-none");

    $modal
      .find("#hourly-review-body, #hourly-review-footer")
      .removeClass("d-none");
  }

  function submitHourlyTotalToServer($modal, value, $submitBtn) {
    AppUtils.submitForm({
      gscriptFunc: "addCurrMthTotalHrly",
      data: value,
      $btn: $submitBtn,
      loadingText: "Saving",

      onSuccess: () => {
        AppUtils.showDashboardToast("Successfully added total!", "success");

        AppUtils.closeModal(MODAL_ID);

        loadHourlyChart(true);
        loadTotalHourlyHours();
      },
    });
  }

  return {
    init,
    destroy,
  };
})();

export { clientOpportunitiesPage };
