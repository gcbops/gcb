import { AppUtils } from "../utils.js";
import { DataTableModule } from "../tables/data-table.js";

const upsellOverviewPage = (() => {
  let bound = false;

  const TABLE_ID = "#upsellTable";
  const TABLE_TITLE = "Upsell";
  const TABLE_BODY_ID = "recordsBody";

  const UPSell_RECORDS_CACHE_KEY = "upsellRecords";
  const UPSELL_SUMMARY_CACHE_KEY = "upsellSummary";

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

    /*
     * Remove page-specific event handlers.
     */
    $("#addtoSheet-upsell").off(".upsellOverview");
    $("#upsellForm").off(".upsellOverview");

    /*
     * Destroy the DataTable instance.
     *
     * DataTableModule.destroy() keeps the actual
     * table element in the DOM.
     */
    DataTableModule.destroy(TABLE_ID);
  }

  function bindActions() {
    bindSheetButton();
    bindUpsellForm();
  }

  function bindSheetButton() {
    $("#addtoSheet-upsell")
      .off("click.upsellOverview")
      .on("click.upsellOverview", function () {
        const btn = $(this);

        const loading = AppUtils.setButtonLoading(
          btn[0],
          "Redirecting to the sheet...",
        );

        google.script.run
          .withSuccessHandler((url) => {
            loading.restore();

            if (url && String(url).startsWith("http")) {
              window.open(url, "_blank");
            } else {
              AppUtils.showError("Unable to open the Upsells sheet.");
            }
          })
          .withFailureHandler((err) => {
            loading.restore();

            AppUtils.showError(err);
          })
          .getClientSheetUrl("Upsells");
      });
  }

  function bindUpsellForm() {
    $("#upsellForm")
      .off("submit.upsellOverview")
      .on("submit.upsellOverview", function (e) {
        e.preventDefault();

        const $form = $(this);

        const $submitBtn = $form.find('button[type="submit"]');

        const fields = [
          "clientName",
          "screenshot",
          "upsellHours",
          "totalHours",
          "orasanDate",
          "reportedDate",
        ];

        const required = ["clientName", "upsellHours", "reportedDate"];

        const data = {};

        fields.forEach((id) => {
          const $el = $form.find(`#${id}`);

          data[id] = $el.length ? String($el.val() || "").trim() : "";
        });

        if (required.some((field) => !data[field])) {
          AppUtils.showError("Please fill out all required fields!");

          return;
        }

        AppUtils.submitForm({
          gscriptFunc: "addUpsellEntry",
          data,
          $btn: $submitBtn,
          loadingText: "Saving upsell...",

          onSuccess: handleUpsellSaveSuccess,
        });
      });
  }

  function handleUpsellSaveSuccess() {
    AppUtils.showDashboardToast("Record added successfully!", "success");

    resetUpsellForm();

    AppUtils.resetCacheKeys([
      UPSell_RECORDS_CACHE_KEY,
      UPSELL_SUMMARY_CACHE_KEY,
    ]);

    /*
     * Refresh both the summary and table.
     */
    loadUpsellSummary(true);
    loadUpsellRecords(true);
  }

  function resetUpsellForm() {
    const $form = $("#upsellForm");

    if (!$form.length) {
      return;
    }

    $form[0].reset();
  }

  function loadData() {
    loadUpsellSummary();
    loadUpsellRecords();
  }

  function loadUpsellSummary(forceRefresh = false) {
    AppUtils.cachedGScriptCall(
      UPSELL_SUMMARY_CACHE_KEY,
      "getUpsellSummary",
      [],
      (summary) => {
        summary = summary || {
          total: 0,
          today: 0,
          month: 0,
        };

        const totalEl = document.getElementById("total");

        const todayEl = document.getElementById("today");

        const monthEl = document.getElementById("month");

        if (totalEl) {
          totalEl.textContent = summary.total ?? 0;
        }

        if (todayEl) {
          todayEl.textContent = summary.today ?? 0;
        }

        if (monthEl) {
          monthEl.textContent = summary.month ?? 0;
        }
      },
      false,
      forceRefresh,
    );
  }

  function loadUpsellRecords(forceRefresh = false) {
    /*
     * Show the loader only when there isn't
     * usable cached data.
     */
    if (forceRefresh || !AppUtils.cacheGet(UPSell_RECORDS_CACHE_KEY)) {
      DataTableModule.showLoader(TABLE_ID);
    }

    AppUtils.cachedGScriptCall(
      UPSell_RECORDS_CACHE_KEY,
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
    const tbody = document.getElementById(TABLE_BODY_ID);

    if (!tbody) {
      return;
    }

    if (!Array.isArray(tableData) || tableData.length === 0) {
      DataTableModule.showEmpty(TABLE_ID, "No records yet");

      return;
    }

    tbody.innerHTML = "";

    tableData.forEach((row) => {
      tbody.appendChild(createUpsellRow(row));
    });

    /*
     * Initialize DataTable after rows exist.
     */
    DataTableModule.init(TABLE_TITLE, TABLE_ID);
  }

  function createUpsellRow(row) {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>
        ${AppUtils.escapeHtml(row[0] ?? "")}
      </td>

      <td class="text-center">
        ${AppUtils.escapeHtml(row[1] ?? "")}
      </td>

      <td class="text-center">
        ${AppUtils.escapeHtml(row[2] ?? "")}
      </td>
    `;

    return tr;
  }

  return {
    init,
    destroy,
  };
})();

export { upsellOverviewPage };
