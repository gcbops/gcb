import { AppUtils } from "../utils.js";
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

    $("#addtoSheet-upsell").off(".upsellOverview");
    $("#upsellForm").off(".upsellOverview");
  };

  const bindActions = () => {

    $("#addtoSheet-upsell")
      .off("click.upsellOverview")
      .on("click.upsellOverview", function () {
        AppUtils.showDashboardToast("Redirecting you to the sheet!", "info");

        google.script.run
          .withSuccessHandler(function (url) {
            window.open(url, "_blank");
          })
          .withFailureHandler((err) => {
            AppUtils.showError(err);
          })
          .getClientSheetUrl("Upsells");
      });

    $("#upsellForm")
      .off("submit.upsellOverview")
      .on("submit.upsellOverview", function (e) {
        e.preventDefault();

        const $submitBtn = $(this).find('button[type="submit"]');

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
          const $el = $("#" + id);
          data[id] = $el.length ? ($el.val() || "").trim() : "";
        });

        if (required.some((k) => data[k] === "")) {
          AppUtils.showError("Please fill out all required fields!");
          return;
        }

        AppUtils.showDashboardToast("Saving Record ...", "info");

        AppUtils.submitForm({
          gscriptFunc: "addUpsellEntry",
          data: data,
          $btn: $submitBtn,
          onSuccess: () => {
            AppUtils.showDashboardToast(
              "Record added successfully!",
              "success",
            );

            fields.forEach((id) => {
              const $el = $("#" + id);
              if ($el.length) {
                $el.val("");
              }
            });

            AppUtils.resetCacheKeys(["upsellRecords", "upsellSummary"]);

            setTimeout(() => {
              loadUpsellSummary(true);
              loadUpsellRecords(true);
            }, 600);
          },
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
    const $table = $("#upsellTable");
    const $tbody = $("#recordsBody");

    if (!$table.length || !$tbody.length) {
      return;
    }

    let html;

    if (!Array.isArray(tableData) || tableData.length === 0) {
      html = `
      <tr>
        <td colspan="3" style="text-align:center;color:#64748b">
          No records yet
        </td>
      </tr>
    `;
    } else {
      html = tableData
        .map(
          (row) => `
          <tr>
            <td>${escapeHtml(row[0] ?? "")}</td>
            <td style="text-align:center;">
              ${escapeHtml(row[1] ?? "")}
            </td>
            <td style="text-align:center;">
              ${escapeHtml(row[2] ?? "")}
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

  function escapeHtml(text) {
    if (text === null || text === undefined) {
      return "";
    }

    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  return { init, destroy };
})();

export { upsellOverviewPage };