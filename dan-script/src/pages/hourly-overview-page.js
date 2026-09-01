import { AppUtils } from "../utils.js";
import { ChartModule } from "../charts.js";
import { ReportActions } from "../reports/actions.js";

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
      const btn = $(this);
      const loading = AppUtils.setButtonLoading(btn[0], "Redirecting...");

      google.script.run
        .withSuccessHandler(function (url) {
          loading.restore();
          window.open(url, "_blank");
        })
        .withFailureHandler((err) => {
          AppUtils.showError(err);
          loading.restore();
        })
        .getClientSheetUrl("Hourly History");
    });

    $("#addMonthTotalForm")
      .off("submit")
      .on("submit", function (e) {
        e.preventDefault();

        const $fValue = $("#fValue");
        const fValueVal = ($fValue.val() || "").trim();
        const $submitBtn = $(this).find('button[type="submit"]');

        if (!fValueVal) {
          AppUtils.showError("Please enter the number!");
          return;
        }

        // Intercept here with your generic confirmation logic before execution
        ReportActions.confirmAction(
          "addMonthTotal",
          "Submit Total Hours?",
          "Do you want to submit current month total hour for hourly projects?",
          () => {
            AppUtils.submitForm({
              gscriptFunc: "addCurrMthTotalHrly",
              data: fValueVal,
              $btn: $submitBtn,
              loadingText: "Saving ...",
              onSuccess: () => {
                AppUtils.showDashboardToast(
                  "Successfully added Total!",
                  "success",
                );
                $fValue.val("");
                
                ChartModule.loadChart("hourly", false, false, true);
                loadTotalHourlyHours();
              },
            });
          },
        );
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