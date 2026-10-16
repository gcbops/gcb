const STORAGE_KEY = "gcb_request_manager_v1";
const MAX_HISTORY = 50;
const HOURS_BATCH_DELAY = 400;

const RequestManager = (() => {
  const handlers = new Map();
  const listeners = new Set();

  let processing = false;
  let processTimer = null;

  const state = loadState();

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));

      if (!saved || !Array.isArray(saved.queue)) {
        return { queue: [], history: [] };
      }

      const queue = saved.queue.map((request) => {
        if (request.status === "running") {
          return {
            ...request,
            status: "interrupted",
            message:
              "The browser session ended while this request was running. Verify its result before resubmitting.",
          };
        }

        return request;
      });

      return {
        queue,
        history: Array.isArray(saved.history) ? saved.history : [],
      };
    } catch (error) {
      console.warn("[RequestManager] Unable to restore requests:", error);

      return { queue: [], history: [] };
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn("[RequestManager] Unable to persist requests:", error);
    }
  }

  function notify() {
    persist();

    const snapshot = getState();

    listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        console.error("[RequestManager] Listener failed:", error);
      }
    });
  }

  function getState() {
    return {
      queue: state.queue.map((item) => ({
        ...item,
        payload: item.payload
          ? {
              ...item.payload,
              ...(Array.isArray(item.payload.records)
                ? {
                    records: item.payload.records.map((record) => ({
                      ...record,
                    })),
                  }
                : {}),
            }
          : item.payload,
      })),
      history: state.history.map((item) => ({ ...item })),
    };
  }

  function normalizeText(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase();
  }

  function normalizeHoursPayload(payload) {
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid hours request payload.");
    }

    const client = String(payload.client ?? "").trim();

    if (!client) {
      throw new Error("Client is required.");
    }

    // Backward compatibility with the original single-entry payload.
    const sourceRecords = Array.isArray(payload.records)
      ? payload.records
      : [payload];

    const records = sourceRecords.map((record) => ({
      type: String(record.type ?? "").trim(),
      task: String(record.task ?? "").trim(),
      hour: Number(record.hour ?? record.hours),
    }));

    if (
      !records.length ||
      records.some(
        (record) =>
          !record.type ||
          !record.task ||
          !Number.isFinite(record.hour) ||
          record.hour <= 0,
      )
    ) {
      throw new Error("One or more hour entries are invalid.");
    }

    return { client, records };
  }

  function mergeHoursPayload(existingPayload, incomingPayload) {
    const existing = normalizeHoursPayload(existingPayload);
    const incoming = normalizeHoursPayload(incomingPayload);

    if (normalizeText(existing.client) !== normalizeText(incoming.client)) {
      return null;
    }

    const records = existing.records.map((record) => ({ ...record }));

    incoming.records.forEach((incomingRecord) => {
      const match = records.find(
        (record) =>
          normalizeText(record.type) === normalizeText(incomingRecord.type) &&
          normalizeText(record.task) === normalizeText(incomingRecord.task) &&
          record.hour + incomingRecord.hour <= 24,
      );

      if (match) {
        match.hour += incomingRecord.hour;
      } else {
        records.push({ ...incomingRecord });
      }
    });

    return {
      client: existing.client,
      records,
    };
  }

  function scheduleProcessQueue(delay = 0) {
    if (processTimer !== null) {
      clearTimeout(processTimer);
    }

    processTimer = setTimeout(() => {
      processTimer = null;
      processQueue();
    }, delay);
  }

  function registerHandler(type, handler) {
    if (typeof handler !== "function") {
      throw new TypeError(`Handler for "${type}" must be a function.`);
    }

    handlers.set(type, handler);
    processQueue();
  }

  function subscribe(listener) {
    listeners.add(listener);
    listener(getState());

    return () => listeners.delete(listener);
  }

  function enqueue(type, payload, title) {
    if (!handlers.has(type)) {
      throw new Error(`No request handler registered for "${type}".`);
    }

    if (type === "record-hours") {
      const normalizedPayload = normalizeHoursPayload(payload);
      const normalizedClient = normalizeText(normalizedPayload.client);

      // Only merge into a compatible request that is still pending.
      const existing = state.queue.find(
        (request) =>
          request.type === "record-hours" &&
          ["pending", "paused"].includes(request.status) &&
          normalizeText(request.payload?.client) === normalizedClient,
      );

      if (existing) {
        existing.payload = mergeHoursPayload(
          existing.payload,
          normalizedPayload,
        );

        const entryCount = existing.payload.records.length;

        existing.title = `Record hours — ${existing.payload.client} (${entryCount} entries)`;
        existing.message = "Additional hours added to this pending request";
        existing.updatedAt = Date.now();

        notify();
        scheduleProcessQueue(HOURS_BATCH_DELAY);

        return existing.id;
      }

      payload = normalizedPayload;
    }

    const request = {
      id: crypto.randomUUID(),
      type,
      title:
        title ||
        (type === "record-hours" ? `Record hours — ${payload.client}` : type),
      payload,
      status: "pending",
      message: "Waiting to start",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    state.queue.push(request);
    notify();

    // Give consecutive hour submissions a chance to merge.
    // Other request types retain immediate processing.
    scheduleProcessQueue(type === "record-hours" ? HOURS_BATCH_DELAY : 0);

    return request.id;
  }

  function updateRequest(id, updates) {
    const request = state.queue.find((item) => item.id === id);

    if (!request) {
      return;
    }

    Object.assign(request, updates, { updatedAt: Date.now() });
    notify();
  }

  async function processQueue() {
    if (processing) {
      return;
    }

    processing = true;

    try {
      while (true) {
        const request = state.queue.find((item) => item.status === "pending");

        if (!request) {
          break;
        }

        const handler = handlers.get(request.type);

        if (!handler) {
          break;
        }

        if (request.type === "record-hours") {
          const remainingDelay =
            HOURS_BATCH_DELAY - (Date.now() - request.updatedAt);

          if (remainingDelay > 0) {
            scheduleProcessQueue(remainingDelay);
            break;
          }
        }

        updateRequest(request.id, {
          status: "running",
          message: "Processing request",
        });

        try {
          const result = await handler(request.payload, {
            requestId: request.id,
            updateProgress: (message) => {
              updateRequest(request.id, {
                message: String(message || "Processing request"),
              });
            },
          });

          finishRequest(request, "completed", "Completed successfully", result);
        } catch (error) {
          finishRequest(request, "failed", error?.message || "Request failed");
        }
      }
    } finally {
      processing = false;
    }
  }

  function finishRequest(request, status, message, result = null) {
    const index = state.queue.findIndex((item) => item.id === request.id);

    if (index === -1) {
      return;
    }

    const [finished] = state.queue.splice(index, 1);

    state.history.unshift({
      ...finished,
      status,
      message,
      result: result ?? null,
      updatedAt: Date.now(),
    });

    state.history = state.history.slice(0, MAX_HISTORY);

    notify();
  }

  function getProjectedHours() {
    const byClient = {};
    let total = 0;

    state.queue.forEach((request) => {
      if (
        request.type !== "record-hours" ||
        !["pending", "paused", "running"].includes(request.status)
      ) {
        return;
      }

      let records;

      try {
        records = normalizeHoursPayload(request.payload).records;
      } catch {
        return;
      }

      const client = String(request.payload?.client || "").trim();

      if (!client) {
        return;
      }

      records.forEach((record) => {
        byClient[client] = (byClient[client] || 0) + record.hour;
        total += record.hour;
      });
    });

    return { total, byClient };
  }

  function retryRequest(id) {
    let request = state.queue.find((item) => item.id === id);

    if (request && !handlers.has(request.type)) {
      return false;
    }

    if (request) {
      if (!["interrupted", "failed"].includes(request.status)) {
        return false;
      }
    } else {
      const historyIndex = state.history.findIndex((item) => item.id === id);

      if (historyIndex === -1) {
        return false;
      }

      const historyRequest = state.history[historyIndex];

      if (
        !["interrupted", "failed"].includes(historyRequest.status) ||
        !handlers.has(historyRequest.type)
      ) {
        return false;
      }

      request = {
        ...historyRequest,
        status: "pending",
        message: "Retry requested. Checking previously applied entries.",
        updatedAt: Date.now(),
      };

      state.history.splice(historyIndex, 1);
      state.queue.push(request);
      notify();
    }

    if (!handlers.has(request.type)) {
      return false;
    }

    updateRequest(request.id, {
      status: "pending",
      message: "Retry requested. Checking previously applied entries.",
    });

    processQueue();

    return true;
  }

  function getRetryableRequests() {
    return [...state.queue, ...state.history].filter(
      (request) =>
        ["interrupted", "failed"].includes(request.status) &&
        handlers.has(request.type),
    );
  }

  function retryRequests(ids) {
    const idsToRetry = [...new Set(ids)];
    let retriedCount = 0;

    idsToRetry.forEach((id) => {
      if (retryRequest(id)) {
        retriedCount++;
      }
    });

    return retriedCount;
  }

  function dismissRequest(id) {
    const index = state.queue.findIndex((item) => item.id === id);

    if (index === -1) {
      return false;
    }

    const request = state.queue[index];

    if (request.status === "running" || request.status === "pending") {
      return false;
    }

    state.queue.splice(index, 1);
    notify();

    return true;
  }

  function cancelRequest(id) {
    const index = state.queue.findIndex((item) => item.id === id);

    if (index === -1) {
      return false;
    }

    const request = state.queue[index];

    // Only pending requests can be cancelled.
    if (!["pending", "paused"].includes(request.status)) {
      return false;
    }

    state.queue.splice(index, 1);

    state.history.unshift({
      ...request,
      status: "cancelled",
      message: "Cancelled by user",
      updatedAt: Date.now(),
    });

    state.history = state.history.slice(0, MAX_HISTORY);

    // Keep the scheduled timer if another request is still pending.
    const hasPendingRequests = state.queue.some((item) =>
      ["pending", "paused"].includes(item.status),
    );

    if (!hasPendingRequests && processTimer !== null) {
      clearTimeout(processTimer);
      processTimer = null;
    } else if (hasPendingRequests && processTimer === null && !processing) {
      scheduleProcessQueue();
    }

    notify();

    return true;
  }

  function pauseRequest(id) {
    const request = state.queue.find((item) => item.id === id);

    // Only requests that have not started can be paused.
    if (!request || request.status !== "pending") {
      return false;
    }

    updateRequest(id, {
      status: "paused",
      message: "Paused by user",
    });

    return true;
  }

  function resumeRequest(id) {
    const request = state.queue.find((item) => item.id === id);

    if (!request || request.status !== "paused") {
      return false;
    }

    updateRequest(id, {
      status: "pending",
      message: "Resumed. Waiting to start",
    });

    scheduleProcessQueue();

    return true;
  }

  function updatePendingRequests(ids, action) {
    const idsToUpdate = new Set(ids);
    let updatedCount = 0;

    state.queue.forEach((request) => {
      if (!idsToUpdate.has(request.id)) {
        return;
      }

      if (action === "pause" && request.status === "pending") {
        request.status = "paused";
        request.message = "Paused by user";
        request.updatedAt = Date.now();
        updatedCount++;
      } else if (action === "resume" && request.status === "paused") {
        request.status = "pending";
        request.message = "Resumed. Waiting to start";
        request.updatedAt = Date.now();
        updatedCount++;
      }
    });

    if (updatedCount > 0) {
      notify();

      if (action === "resume") {
        scheduleProcessQueue();
      }
    }

    return updatedCount;
  }

  function pauseRequests(ids) {
    return updatePendingRequests(ids, "pause");
  }

  function resumeRequests(ids) {
    return updatePendingRequests(ids, "resume");
  }

  function archiveHistory() {
    state.history = [];
    notify();
  }

  function archiveHistoryByIds(ids) {
    const idsToRemove = new Set(ids);

    if (!idsToRemove.size) {
      return;
    }

    state.history = state.history.filter(
      (request) => !idsToRemove.has(request.id),
    );

    notify();
  }

  function dismissHistoryItem(id) {
    const index = state.history.findIndex((item) => item.id === id);

    if (index === -1) {
      return false;
    }

    state.history.splice(index, 1);
    notify();

    return true;
  }

  return {
    registerHandler,
    subscribe,
    enqueue,
    getState,
    getProjectedHours,
    retryRequest,
    getRetryableRequests,
    retryRequests,
    dismissRequest,
    cancelRequest,
    pauseRequest,
    resumeRequest,
    pauseRequests,
    resumeRequests,
    archiveHistory,
    archiveHistoryByIds,
    dismissHistoryItem,
  };
})();

export { RequestManager };
