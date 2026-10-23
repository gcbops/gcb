import {
  getAuthArgs,
  handleInvalidSessionError,
} from "../auth/auth-error-handler.js";
import { HourSummary } from "../hours/hour-summary.js";
import { RequestManager } from "./request-manager.js";
import { AppUtils } from "../utils/utils.js";
import { ReportGenerator } from "../reports/generator.js";

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

function confirmNewProjects(newProjects) {
  if (!newProjects.length) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const modalSelector = "#app-modal";
    const ns = ".newProjectConfirm";

    let settled = false;
    let confirmed = false;

    const finish = (result) => {
      if (settled) {return;}

      settled = true;
      confirmed = result;

      AppUtils.closeModal(modalSelector);
    };

    AppUtils.openModal(modalSelector, {
      size: "md",
      placement: "center",

      header: "<strong>New Project Detected</strong>",

      body: `
        <p>These projects are not currently listed:</p>

        <ul class="list-group mb-3 text-start">
          ${newProjects
            .map(
              (project) => `
                <li class="list-group-item">
                  ${AppUtils.escapeHtml(project)}
                </li>
              `,
            )
            .join("")}
        </ul>

        <p class="mb-0">
          Continue saving the hours and syncing the project list?
        </p>
      `,

      footer: `
        <button
          type="button"
          class="btn btn-secondary btn-cancel-project"
        >
          No / Cancel
        </button>

        <button
          type="button"
          class="btn btn-primary btn-confirm-project"
        >
          Yes, Continue
        </button>
      `,

      onOpen($modal) {
        $modal
          .off(ns)
          .on(`click${ns}`, ".btn-cancel-project", () => {
            finish(false);
          })
          .on(`click${ns}`, ".btn-confirm-project", () => {
            finish(true);
          });
      },

      onClose($modal) {
        $modal.off(ns);

        // Closing with the X or another dismiss action means cancel.
        if (!settled) {
          settled = true;
          confirmed = false;
        }

        resolve(confirmed);
      },
    });
  });
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

// Registration Handlers

// edit-today-hours — Hours
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

// record-hours — Hours
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

    let existingTasks;

    if (Array.isArray(cachedTasks) && cachedTasks.length > 0) {
      existingTasks = new Set(cachedTasks.map(normalizeProjectName));
    } else {
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
        console.error(
          "[RequestHandlers] Unable to check existing projects:",
          error,
        );

        throw new Error(
          "Unable to verify existing projects. No hours were saved. Please try again.",
          { cause: error },
        );
      }
    }

    const newProjects = [
      ...new Set(
        records
          .map((record) => String(record.task || "").trim())
          .filter((task) => !existingTasks.has(normalizeProjectName(task))),
      ),
    ];

    const needsProjectSync = newProjects.length > 0;

    if (needsProjectSync) {
      updateProgress("Waiting for project confirmation");

      const confirmed = await confirmNewProjects(newProjects);

      if (!confirmed) {
        return {
          client: clientName,
          requestId,
          cancelled: true,
          entries: 0,
          hours: 0,
          results: [],
        };
      }
    }

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

// generate-report — Reports
RequestManager.registerHandler(
  "generate-report",
  async (payload, { requestId, updateProgress }) => {
    if (!requestId) {
      throw new Error("Missing request ID for report generation.");
    }

    updateProgress("Preparing report request");

    return ReportGenerator.generateReportRequest(payload, {
      requestId,
      updateProgress,
    });
  },
);

// generate-billing-csv — Reports
RequestManager.registerHandler(
  "generate-billing-csv",
  async (payload, { requestId, updateProgress }) => {
    if (!requestId) {
      throw new Error("Missing request ID for CSV generation.");
    }

    const { startDate, endDate } = payload || {};

    if (
      typeof startDate !== "string" ||
      typeof endDate !== "string" ||
      !startDate ||
      !endDate ||
      startDate > endDate
    ) {
      throw new Error("A valid CSV date range is required.");
    }

    updateProgress("Authorizing billing CSV export");

    const [sessionId, signature] = await getAuthArgs();

    updateProgress("Checking for an existing CSV export");

    const existing = await callGScriptAsync("checkExistingBillingCSVExport", [
      sessionId,
      signature,
      startDate,
      endDate,
    ]);

    if (existing?.exists) {
      const choice = await ReportGenerator.confirmExistingReport(existing.report);

      if (choice?.cancelled) {
        return { cancelled: true };
      }

      if (choice?.downloaded) {
        return {
          success: true,
          downloaded: true,
          reportType: "csv",
          reportName: choice.reportName,
          reportUrl: existing.report.link,
          fileId: existing.report.fileId,
          recordCount: existing.report.recordCount,
          startDate,
          endDate,
        };
      }

      // Generate New: continue with the same requestId.
    }

    updateProgress("Generating Billing Records CSV");

    const result = await callGScriptAsync("saveBillingRecordsCSV", [
      sessionId,
      signature,
      startDate,
      endDate,
      requestId,
    ]);

    if (!result?.success || !result?.url) {
      throw new Error("The Billing Records CSV could not be generated.");
    }

    updateProgress("Billing Records CSV generated successfully");

    return {
      ...result,
      reportUrl: result.url,
      reportType: "csv",
    };
  },
);

// send-report-email — Reports
RequestManager.registerHandler(
  "send-report-email",
  async (payload, { requestId, updateProgress }) => {
    if (!requestId) {
      throw new Error("Missing request ID for email delivery.");
    }

    const reportId = String(payload?.reportId || "").trim();

    if (!reportId) {
      throw new Error("The report ID is missing.");
    }

    const serverFunction = payload.isDataExport
      ? "sendBillingRecordsCSVEmail"
      : "sendRequestedEmailReport";

    updateProgress("Authorizing email delivery");

    const [sessionId, signature] = await getAuthArgs();

    updateProgress("Sending report by email");

    const result = await callGScriptAsync(serverFunction, [
      sessionId,
      signature,
      reportId,
    ]);

    if (result?.success === false) {
      throw new Error(result.message || "Report email delivery failed.");
    }

    return {
      reportId,
      reportType: payload.reportType,
      channel: "email",
      ...(result && typeof result === "object" ? result : {}),
    };
  },
);

// send-report-discord — Reports
RequestManager.registerHandler(
  "send-report-discord",
  async (payload, { requestId, updateProgress }) => {
    if (!requestId) {
      throw new Error("Missing request ID for Discord delivery.");
    }

    const reportId = String(payload?.reportId || "").trim();

    if (!reportId) {
      throw new Error("The report ID is missing.");
    }

    const serverFunction = payload.isDataExport
      ? "sendBillingRecordsCSVDiscord"
      : "sendRequestedDiscordReport";

    updateProgress("Authorizing Discord delivery");

    const [sessionId, signature] = await getAuthArgs();

    updateProgress("Sending report to Discord");

    const result = await callGScriptAsync(serverFunction, [
      sessionId,
      signature,
      reportId,
    ]);

    if (result?.success === false) {
      throw new Error(result.message || "Report Discord delivery failed.");
    }

    return {
      reportId,
      reportType: payload.reportType,
      channel: "discord",
      ...(result && typeof result === "object" ? result : {}),
    };
  },
);

// create-client-sheet — Others
RequestManager.registerHandler(
  "create-client-sheet",
  async (payload, { requestId, updateProgress }) => {
    if (!requestId) {
      throw new Error("Missing request ID for client creation.");
    }

    const clientName = String(payload?.name || "").trim();

    if (!clientName) {
      throw new Error("A client name is required.");
    }

    updateProgress("Authorizing client creation");

    const [sessionId, signature] = await getAuthArgs();

    updateProgress("Creating client sheet");

    await callGScriptAsync("createClientSheet", [
      sessionId,
      signature,
      { name: clientName },
      requestId,
    ]);

    updateProgress("Client sheet created successfully");

    return { success: true, clientName };
  },
);

// create-external-sheet — Others
RequestManager.registerHandler(
  "create-external-sheet",
  async (payload, { requestId, updateProgress }) => {
    if (!requestId) {
      throw new Error("Missing request ID for external sheet creation.");
    }

    const clientName = String(payload?.clientName || "").trim();
    const projects = String(payload?.projects || "").trim();

    if (!clientName) {
      throw new Error("A client name is required.");
    }

    if (!projects) {
      throw new Error("At least one project is required.");
    }

    updateProgress("Authorizing external sheet creation");

    const [sessionId, signature] = await getAuthArgs();

    updateProgress("Creating external spreadsheet");

    const result = await callGScriptAsync("createExternalSheet", [
      sessionId,
      signature,
      {
        clientName,
        projects,
      },
      requestId,
    ]);

    updateProgress("External sheet created successfully");

    return result;
  },
);