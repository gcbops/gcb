import { AppUtils } from "../utils.js";
import { DataTableModule } from "../tables/data-table.js";
import { ChartModule } from "../charts.js";

const clientOpportunitiesPage = (() => {
  let bound = false;

  const PAGE_ID = "#client-opportunities-page";

  const UPSELL_TABLE_ID = "#opportunitiesUpsellTable";
  const UPSELL_BODY_ID = "opportunitiesUpsellBody";

  const UPSELL_RECORDS_CACHE_KEY = "upsellRecords";
  const UPSELL_SUMMARY_CACHE_KEY = "upsellSummary";

  const UPSELL_MODAL_ID = "#app-modal";
  const UPSELL_MODAL_NS = ".clientOpportunitiesUpsell";

  const HOURLY_MODAL_ID = "#app-modal";
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

    $(UPSELL_MODAL_ID).off(UPSELL_MODAL_NS);
    $(HOURLY_MODAL_ID).off(HOURLY_MODAL_NS);

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

    google.script.run
      .withSuccessHandler((url) => {
        loading.restore();

        if (url && String(url).startsWith("http")) {
          window.open(url, "_blank");
          return;
        }

        AppUtils.showError(errorMessage);
      })
      .withFailureHandler((err) => {
        loading.restore();
        AppUtils.showError(err);
      })
      .getClientSheetUrl(sheetName);
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
    AppUtils.openModal(UPSELL_MODAL_ID, {
      size: "lg",
      placement: "center",

      header: `
        <strong>Add Upsell Opportunity</strong>
      `,

      body: `
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
      `,

      footer: `
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
      `,

      onOpen($modal) {
        $modal
          .off(UPSELL_MODAL_NS)
          .on(`click${UPSELL_MODAL_NS}`, ".btn-cancel", () => {
            AppUtils.closeModal(UPSELL_MODAL_ID);
          })
          .on(`click${UPSELL_MODAL_NS}`, ".btn-save", () => {
            submitUpsell($modal);
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

    const $submitBtn = $modal.find(".btn-save");

    const data = {
      clientName: String(
        $form.find("#opportunity-clientName").val() || "",
      ).trim(),

      screenshot: String(
        $form.find("#opportunity-screenshot").val() || "",
      ).trim(),

      upsellHours: String(
        $form.find("#opportunity-upsellHours").val() || "",
      ).trim(),

      totalHours: String(
        $form.find("#opportunity-totalHours").val() || "",
      ).trim(),

      orasanDate: String(
        $form.find("#opportunity-orasanDate").val() || "",
      ).trim(),

      reportedDate: String(
        $form.find("#opportunity-reportedDate").val() || "",
      ).trim(),
    };

    if (!data.clientName || !data.upsellHours || !data.reportedDate) {
      AppUtils.showError("Please fill out all required fields!");
      return;
    }

    AppUtils.confirmAction(
      "submitUpsellForm",
      "Submit Upsell Entry?",
      `
        Are you sure you want to log an upsell entry
        of ${AppUtils.escapeHtml(data.upsellHours)}
        hours for ${AppUtils.escapeHtml(data.clientName)}?
      `,
      () => {
        AppUtils.submitForm({
          gscriptFunc: "addUpsellEntry",
          data,
          $btn: $submitBtn,
          loadingText: "Saving upsell",

          onSuccess: () => {
            handleUpsellSaveSuccess();
          },
        });
      },
    );
  }

  function handleUpsellSaveSuccess() {
    AppUtils.showDashboardToast("Record added successfully!", "success");

    AppUtils.closeModal(UPSELL_MODAL_ID);

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
    google.script.run
      .withSuccessHandler((value) => {
        const $total = $("#opportunities-total-hourly-hours");

        if (!$total.length) {
          return;
        }

        $total.find("span").text(AppUtils.formatHours(Number(value) || 0));
      })
      .withFailureHandler((err) => {
        AppUtils.showError(err);

        AppUtils.showDashboardToast("Unable to load hourly totals.", "error");
      })
      .getDirectCellValueSafe("Hourly History", "B8");
  }

  // ----------------------------------------------------------
  // Add hourly monthly total modal
  // ----------------------------------------------------------

  function openHourlyModal() {
    AppUtils.openModal(HOURLY_MODAL_ID, {
      size: "md",
      placement: "center",

      header: `
        <strong>Add Current Month Total</strong>
      `,

      body: `
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
      `,

      footer: `
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
      `,

      onOpen($modal) {
        $modal
          .off(HOURLY_MODAL_NS)
          .on(`click${HOURLY_MODAL_NS}`, ".btn-cancel", () => {
            AppUtils.closeModal(HOURLY_MODAL_ID);
          })
          .on(`click${HOURLY_MODAL_NS}`, ".btn-save", () => {
            submitHourlyTotal($modal);
          });
      },

      onClose($modal) {
        $modal.off(HOURLY_MODAL_NS);
      },
    });
  }

  function submitHourlyTotal($modal) {
    const $input = $modal.find("#opportunity-hourly-value");

    const value = String($input.val() || "").trim();

    const $submitBtn = $modal.find(".btn-save");

    if (!value) {
      AppUtils.showError("Please enter the current month total.");
      return;
    }

    AppUtils.confirmAction(
      "addMonthTotal",
      "Submit Total Hours?",
      "Do you want to submit the current month total hour for hourly projects?",
      () => {
        AppUtils.submitForm({
          gscriptFunc: "addCurrMthTotalHrly",
          data: value,
          $btn: $submitBtn,
          loadingText: "Saving",

          onSuccess: () => {
            AppUtils.showDashboardToast("Successfully added total!", "success");

            AppUtils.closeModal(HOURLY_MODAL_ID);

            loadHourlyChart(true);
            loadTotalHourlyHours();
          },
        });
      },
    );
  }

  return {
    init,
    destroy,
  };
})();

export { clientOpportunitiesPage };
