import { AppUtils } from "../utils.js";
import { ChartModule } from "../charts.js";

const hourlyOverviewPage = (() => {
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
        })
        .getClientSheetUrl("Hourly History");
    });

    $("#addMonthTotalForm").off("submit").on("submit", function(e) {
      e.preventDefault();

      const $fValue = $("#fValue");
      const fValueVal = ($fValue.val() || "").trim();
      const $submitBtn = $(this).find('button[type="submit"]');

      if (!fValueVal) {
        AppUtils.showError("Please enter the number!");
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

  function loadTotalHourlyHours() {
    google.script.run
      .withSuccessHandler(function (dt) {
        const ttlw = $("#total-hourly-hours");
        if (ttlw.length) {
          ttlw.children("span").text(dt);
        }
      })
      .withFailureHandler((err) => {
        AppUtils.showError(err);
        AppUtils.showDashboardToast(
          "Sheet or cell value doesn't exist!",
          "error",
        );
      })
      .getDirectCellValueSafe("Hourly History", "B8");
  }

  const loadData = () => {
    ChartModule.loadChart("hourly");
    loadTotalHourlyHours();
  };

  return { init, destroy };
})();

export { hourlyOverviewPage };