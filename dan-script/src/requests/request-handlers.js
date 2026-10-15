import {
  getAuthArgs,
  handleInvalidSessionError,
} from "../auth/auth-error-handler.js";
import { HourSummary } from "../hours/hour-summary.js";
import { RequestManager } from "./request-manager.js";
import { AppUtils } from "../utils.js";

const TODAY_HOURS_CACHE_PREFIX = "todayManualHours_";

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

function invalidateClientHoursCaches(clientName) {
  AppUtils.cacheClear(`${TODAY_HOURS_CACHE_PREFIX}${clientName}`);
  AppUtils.cacheClear(`getClientHourLogData_${clientName}`);
  AppUtils.cacheClear(`getClientHours_${clientName}`);
  AppUtils.cacheClear(`gcb_getTaskOptions_${clientName}`);
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

RequestManager.registerHandler(
  "edit-today-hours",
  async (formData, { updateProgress }) => {
    const [sessionId, signature] = await getAuthArgs();

    updateProgress("Saving today's changes");

    const response = await callGScriptAsync("saveEditedTodayClientHours", [
      sessionId,
      signature,
      formData,
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
      updatedRecords: Array.isArray(formData.records)
        ? formData.records.length
        : 0,
    };
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

    const needsProjectSync = records.some(
      (record) => !cachedTasks.includes(record.task),
    );

    const [sessionId, signature] = await getAuthArgs();

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

    invalidateClientHoursCaches(clientName);
    refreshConfirmedHours();

    if (needsProjectSync) {
      try {
        const [syncSessionId, syncSignature] = await getAuthArgs();

        await callGScriptAsync("syncClientProjects", [
          syncSessionId,
          syncSignature,
        ]);
      } catch (error) {
        if (!handleInvalidSessionError(error)) {
          console.warn(
            "[RequestHandlers] Failed to sync client projects:",
            error,
          );
        }
      }
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
