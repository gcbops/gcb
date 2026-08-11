import { AppUtils } from "../utils.js";
import { TableModule } from "../tables/tables.js";
import { DataTableModule } from "../tables/data-table.js";

const upsellOverviewPage = (() => {
  let bound = false;

  const init = () => {
    if (bound) {return;}
    bound = true;

    bindActions();
    loadData();
  };

  const destroy = () => {
    if (!bound) {return;}
    bound = false;

    $("#addtoSheet-upsell").off("click");
    $("#upsellForm").off("submit");
  };

  const bindActions = () => {

    $("#addtoSheet-upsell").on("click", function () {
      AppUtils.showDashboardToast("Redirecting you to the sheet!", "info");

      google.script.run
        .withSuccessHandler(function (url) {
          window.open(url, "_blank");
        })
        .withFailureHandler((err) => {
          AppUtils.showError(err);
          AppUtils.showDashboardToast("Sheet doesn't exist!", "error");
        })
        .getClientSheetUrl("Upsells");
    });

    $("#upsellForm").off("submit").on("submit", function(e) {
      e.preventDefault();

      const $submitBtn = $(this).find('button[type="submit"]');

      const fields = [
        "clientName",
        "screenshot",
        "upsellHours",
        "totalHours",
        "orasanDate",
        "reportedDate"
      ];

      const required = ["clientName", "upsellHours", "reportedDate"];
      const data = {};

      fields.forEach(id => {
        const $el = $("#" + id);
        data[id] = $el.length ? ($el.val() || "").trim() : "";
      });

      if (required.some(k => data[k] === "")) {
        AppUtils.showDashboardToast("Please fill out all required fields!", "error");
        return;
      }

      AppUtils.showDashboardToast("Saving Record ...", "info");

      AppUtils.submitForm({
        gscriptFunc: "addUpsellEntry",
        data: data,
        $btn: $submitBtn,
        onSuccess: () => {
          AppUtils.showDashboardToast("Record added successfully!", "success");

          fields.forEach(id => {
            const $el = $("#" + id);
            if ($el.length) {$el.val("");}
          });

          AppUtils.cacheClear("upsellRecords");
          AppUtils.cacheClear("upsellRecords_time");
          AppUtils.cacheClear("upsellSummary");
          AppUtils.cacheClear("upsellSummary_time");

          setTimeout(() => {
            loadUpsellSummary(true);
            loadUpsellRecords(true);
          }, 600);
        }
      });
    });

  };

  const loadData = () => {
    loadUpsellSummary();
    loadUpsellRecords();
  };

  function loadUpsellSummary(forceRefresh = false) {
    AppUtils.cachedGScriptCall(
      "upsellSummary",
      "getUpsellSummary",
      [],
      function (summary) {
        summary = summary || { total: 0, today: 0, month: 0 };
        const totalEl = document.getElementById("total");
        const todayEl = document.getElementById("today");
        const monthEl = document.getElementById("month");
        if (totalEl) {
          totalEl.textContent = summary.total;
        }
        if (todayEl) {
          todayEl.textContent = summary.today;
        }
        if (monthEl) {
          monthEl.textContent = summary.month;
        }
      },
    );
  }

  function loadUpsellRecords(forceRefresh = false) {
    AppUtils.cachedGScriptCall(
      "upsellRecords",
      "getUpsellRecords",
      [],
      function (table) {
        renderUpsellTables(table);
      },
    );
  }

  function renderUpsellTables(tableData) {
    const $container = $("#upsellTable").parent();

    if (!$container.length) {
      return;
    }

    $container.html(
      `
      <table
        id="upsellTable"
        class="display table nowrap">

        <thead>
          <tr>
            <th>Client Name</th>
            <th>Upsell Hours</th>
            <th>Orasan Date</th>
          </tr>
        </thead>

        <tbody id="recordsBody"></tbody>

      </table>
      `,
    );

    const $tbody = $("#recordsBody");

    let html;

    if (!Array.isArray(tableData) || tableData.length === 0) {
      html = `
        <tr>
          <td colspan="3"
              style="text-align:center;color:#64748b">
            No records yet
          </td>
        </tr>
        `;
    } else {
      html = tableData
        .map(
          (row) =>
            `
            <tr>
              <td>
                ${TableModule.escapeHtml(row[0] ?? "")}
              </td>

              <td style="text-align:center;">
                ${TableModule.escapeHtml(row[1] ?? "")}
              </td>

              <td style="text-align:center;">
                ${TableModule.escapeHtml(row[2] ?? "")}
              </td>
            </tr>
            `,
        )
        .join("");
    }

    $tbody.html(html);

    if (Array.isArray(tableData) && tableData.length > 0) {
      DataTableModule.init("Upsell", "#upsellTable");
    }
  }

  return { init, destroy };
})();

export { upsellOverviewPage };