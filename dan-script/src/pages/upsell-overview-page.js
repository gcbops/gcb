import {
  AppUtils,
  WidgetModule,
} from "../modules.js";

const upsellOverviewPageModule = (() => {
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
            WidgetModule.loadUpsellSummary(true);
            WidgetModule.loadUpsellRecords(true);
          }, 600);
        }
      });
    });

  };

  const loadData = () => {
    WidgetModule.loadUpsellSummary();
    WidgetModule.loadUpsellRecords();
  };

  return { init, destroy };
})();

export { upsellOverviewPageModule };