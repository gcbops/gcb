import {
  getAuthArgs,
  handleInvalidSessionError,
} from "../auth/auth-error-handler.js";
import { HourSummary } from "../hours/hour-summary.js";
import { RequestManager } from "./request-manager.js";
import { AppUtils } from "../utils.js";

function callGScriptAsync(gscriptFunc, args) {
  return new Promise((resolve, reject) => {
    AppUtils.gScriptRun({
      gscriptFunc,
      args,
      staleCheck: false,
      onSuccess: resolve,
      onError: reject,
    });
  });
}

function syncClientProjectsInBackground(cacheKey) {
  (async () => {
    try {
      const [sessionId, signature] = await getAuthArgs();

      await callGScriptAsync("syncClientProjects", [sessionId, signature]);

      AppUtils.cacheClear(cacheKey);
    } catch (error) {
      if (!handleInvalidSessionError(error)) {
        console.warn(
          "[RequestHandlers] Failed to sync client projects:",
          error,
        );
      }
    }
  })();
}

function invalidateClientHoursCaches(clientName, clearTaskOptions = true) {
  AppUtils.cacheClear(`todayManualHours_${clientName}`);
  AppUtils.cacheClear(`getClientHourLogData_${clientName}`);
  AppUtils.cacheClear(`getClientHours_${clientName}`);

  if (clearTaskOptions) {
    AppUtils.cacheClear(`gcb_getTaskOptions_${clientName}`);
  }
}

function refreshConfirmedHours() {
  try {
    HourSummary.loadTodayChargedHours();
  } catch (error) {
    console.warn(
      "[RequestHandlers] Unable to refresh today's charged hours:",
      error,
    );
  }
}

function notifyHoursRecorded(formData) {
  document.dispatchEvent(
    new CustomEvent("gcb:hours-recorded", {
      detail: formData,
    }),
  );
}

// RequestManager.registerHandler(
//   "edit-today-hours",
//   async (formData, { updateProgress }) => {
//     const [sessionId, signature] = await getAuthArgs();

//     updateProgress("Saving today's changes");

//     const response = await callGScriptAsync("saveEditedTodayClientHours", [
//       sessionId,
//       signature,
//       formData,
//     ]);

//     if (!response?.success) {
//       throw new Error(response?.message || "Unable to update today's hours.");
//     }

//     const clientName = formData.client;

//     invalidateClientHoursCaches(clientName);
//     refreshConfirmedHours();
//     notifyHoursRecorded({
//       ...formData,
//       action: "edit",
//     });

//     AppUtils.showDashboardToast(
//       response.message || "Today's hours updated successfully!",
//       "success",
//     );

//     return {
//       client: clientName,
//       updatedRecords: Array.isArray(formData.records)
//         ? formData.records.length
//         : 0,
//     };
//   },
// );

RequestManager.registerHandler(
  "edit-today-hours",
  async (formData, { requestId, updateProgress }) => {
    if (!requestId) {
      throw new Error(
        "Missing request ID. Cannot safely retry today's changes.",
      );
    }

    const [sessionId, signature] = await getAuthArgs();

    updateProgress("Saving today's changes");

    try {
      const response = await callGScriptAsync("saveEditedTodayClientHours", [
        sessionId,
        signature,
        {
          ...formData,
          requestId,
        },
      ]);

      if (!response?.success) {
        throw new Error(response?.message || "Unable to update today's hours.");
      }

      const clientName = formData.client;

      invalidateClientHoursCaches(clientName);
      refreshConfirmedHours();

      notifyHoursRecorded({
        ...formData,
        action: "edit",
      });

      AppUtils.showDashboardToast(
        response.message || "Today's hours updated successfully!",
        "success",
      );

      return {
        client: clientName,
        requestId,
        updatedRecords: Array.isArray(formData.records)
          ? formData.records.length
          : 0,
        duplicatePrevented: response.duplicatePrevented === true,
      };
    } catch (error) {
      const message = String(
        error?.message || "Unable to update today's hours.",
      );

      if (
        /HOURS_CONFLICT:|has changed since it was loaded|no longer a record|no longer exists|no longer valid/i.test(
          message,
        )
      ) {
        AppUtils.showDashboardToast(
          message.replace(/^.*?HOURS_CONFLICT:\s*/i, ""),
          "error",
        );
      }

      throw error;
    }
  },
);

RequestManager.registerHandler(
  "record-hours",
  async (formData, { requestId, updateProgress }) => {
    const clientName = String(formData.client || "").trim();

    // Support older persisted requests that used a single-entry payload.
    const records = Array.isArray(formData.records)
      ? formData.records
      : [
          {
            type: formData.type,
            task: formData.task,
            hour: formData.hour,
          },
        ];

    if (!requestId) {
      throw new Error("Missing request ID. Cannot safely submit hours.");
    }

    const batchPayload = {
      client: clientName,
      requestId,
      records,
    };

    const cacheKey = `gcb_getTaskOptions_${clientName}`;
    const cachedTasks = AppUtils.cacheGet(cacheKey) || [];

    const normalizeProjectName = (value) =>
      String(value || "")
        .split(" - ")[0]
        .trim()
        .toLowerCase();

    const [sessionId, signature] = await getAuthArgs();

    let existingTasks = null;

    if (Array.isArray(cachedTasks) && cachedTasks.length > 0) {
      // Use the existing client task-options cache.
      existingTasks = new Set(cachedTasks.map(normalizeProjectName));
    } else {
      // Cache is missing or empty: check the Projects sheet.
      try {
        const projects = await callGScriptAsync("getProjects", [
          sessionId,
          signature,
        ]);

        existingTasks = new Set(
          (Array.isArray(projects) ? projects : []).map((project) =>
            normalizeProjectName(project[0]),
          ),
        );
      } catch (error) {
        // Don't block hour recording if the lookup fails.
        console.warn(
          "[RequestHandlers] Unable to check existing projects:",
          error,
        );
      }
    }

    const needsProjectSync =
      existingTasks === null ||
      records.some(
        (record) => !existingTasks.has(normalizeProjectName(record.task)),
      );

    updateProgress("Checking client type");

    const isExternal = await callGScriptAsync("isExternalClient", [
      sessionId,
      signature,
      clientName,
    ]);

    updateProgress(
      `Saving ${records.length} hour entr${records.length === 1 ? "y" : "ies"}`,
    );

    const gscriptFunc = isExternal
      ? "recordExternalClientHoursBatchFromForm"
      : "recordManualClientHoursBatchFromForm";

    const response = await callGScriptAsync(gscriptFunc, [
      sessionId,
      signature,
      batchPayload,
    ]);

    if (!response?.success) {
      throw new Error(response?.message || "Unable to record the hours.");
    }

    invalidateClientHoursCaches(clientName, false);
    refreshConfirmedHours();

    if (needsProjectSync) {
      updateProgress("Hours saved; updating projects in background");
      syncClientProjectsInBackground(cacheKey);
    }

    notifyHoursRecorded({
      client: clientName,
      records,
      action: "record",
    });

    const totalHours = records.reduce(
      (sum, record) => sum + Number(record.hour || 0),
      0,
    );

    AppUtils.showDashboardToast(
      `${records.length} hour entr${records.length === 1 ? "y" : "ies"} successfully recorded!`,
      "success",
    );

    return {
      client: clientName,
      requestId,
      entries: records.length,
      hours: totalHours,
      results: response.results || [],
    };
  },
);
