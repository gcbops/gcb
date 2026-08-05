import {
  AppUtils,
  ChartModule,
  WidgetModule,
} from "../modules.js";

const hourlyOverviewPageModule = (() => {
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

    $("#addtoSheet-hourly").off("click");
    $("#addMonthTotalForm").off("submit");
  };

  const bindActions = () => {

    $("#addtoSheet-hourly").on("click", function () {
      AppUtils.showDashboardToast("Redirecting you to the sheet!", "info");

      google.script.run
        .withSuccessHandler(function (url) {
          window.open(url, "_blank");
        })
        .withFailureHandler((err) => {
          AppUtils.showError(err);
          AppUtils.showDashboardToast("Sheet doesn't exist!", "error");
        })
        .getClientSheetUrl("Hourly History");
    });

    $("#addMonthTotalForm").off("submit").on("submit", function(e) {
      e.preventDefault();

      const $fValue = $("#fValue");
      const fValueVal = ($fValue.val() || "").trim();
      const $submitBtn = $(this).find('button[type="submit"]');

      if (!fValueVal) {
        AppUtils.showDashboardToast("Please enter the number!", "error");
        return;
      }

      AppUtils.showDashboardToast("Saving Currrent Month Total ...", "info");

      AppUtils.submitForm({
        gscriptFunc: "addCurrMthTotalHrly",
        data: { fValue: fValueVal },
        $btn: $submitBtn,
        onSuccess: () => {
          AppUtils.showDashboardToast("Successfully added Total!", "success");
          $fValue.val("");
        }
      });
    });

  };

  const loadData = () => {
    ChartModule.loadChart("hourly");
    WidgetModule.loadHourlyTotalCard();
  };

  return { init, destroy };
})();

export { hourlyOverviewPageModule };