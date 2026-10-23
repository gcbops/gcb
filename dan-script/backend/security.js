/**
 * GCB Security Helpers
 *
 * Server-side security utilities such as
 * per-session and global rate limiting.
 */

// function enforceUserRateLimit(action, sessionId, limit, windowSeconds) {
//   if (!sessionId) {
//     throw new Error("A valid session is required for rate limiting.");
//   }

//   enforceRateLimit(
//     `user_${action}_${sessionId}`,
//     limit,
//     windowSeconds,
//     "Too many requests. Please wait and try again.",
//   );
// }

// function enforceGlobalRateLimit(action, limit, windowSeconds) {
//   enforceRateLimit(
//     `global_${action}`,
//     limit,
//     windowSeconds,
//     "This operation is temporarily busy. Please try again shortly.",
//   );
// }


// function enforceRateLimit(key, limit, windowSeconds, errorMessage) {
//   if (
//     typeof key !== "string" ||
//     !key ||
//     !Number.isInteger(limit) ||
//     limit < 1 ||
//     !Number.isFinite(windowSeconds) ||
//     windowSeconds < 1
//   ) {
//     throw new Error("Invalid rate-limit configuration.");
//   }

//   const lock = LockService.getScriptLock();

//   if (!lock.tryLock(5000)) {
//     throw new Error("Rate-limit service is busy. Please try again shortly.");
//   }

//   try {
//     const cache = CacheService.getScriptCache();
//     const cacheKey = `gcb_rate_${key}`;
//     const cached = cache.get(cacheKey);
//     const current = cached === null ? 0 : Number(cached);

//     if (!Number.isSafeInteger(current) || current < 0) {
//       throw new Error("Rate-limit counter is invalid.");
//     }

//     if (current >= limit) {
//       throw new Error(
//         errorMessage || "Too many requests. Please wait and try again.",
//       );
//     }

//     cache.put(cacheKey, String(current + 1), Math.ceil(windowSeconds));
//   } finally {
//     lock.releaseLock();
//   }
// }


/**
 * GCB Security Helpers
 *
 * Server-side security utilities such as
 * per-session and global rate limiting.
 */

function enforceUserRateLimit(action, sessionId, limit, windowSeconds) {
  if (!sessionId) {
    throw new Error("A valid session is required for rate limiting.");
  }

  enforceRateLimit(
    `user_${action}_${sessionId}`,
    limit,
    windowSeconds,
    "Too many requests. Please wait and try again.",
    { action, scope: "USER" },
  );
}

function enforceGlobalRateLimit(action, limit, windowSeconds) {
  enforceRateLimit(
    `global_${action}`,
    limit,
    windowSeconds,
    "This operation is temporarily busy. Please try again shortly.",
    { action, scope: "GLOBAL" },
  );
}

/**
 * Best-effort security event logging.
 * Never logs session IDs or raw rate-limit keys.
 */
function logRateLimitEvent_(status, {
  action = "UNKNOWN",
  scope = "UNKNOWN",
  message,
  error = null,
} = {}) {
  try {
    if (!shouldLogRateLimitEvent_(status, scope, action)) {
      return;
    }
    
    recordGcbOperationLog_({
      category: "SECURITY",
      operation: "RATE_LIMIT",
      status,
      trigger: "SERVER",
      processed: 1,
      succeeded: 0,
      failed: status === "FAILED" ? 1 : 0,
      target: `${scope}:${action}`.slice(0, 150),
      message,
      ...(error
        ? { error: String(error.message || error).slice(0, 500) }
        : {}),
    });
  } catch (logError) {
    console.error(
      "[Security] Rate-limit logging failed:",
      logError?.message || logError,
    );
  }
}

/**
 * Suppress duplicate security log entries for a short period.
 * This does not affect request rate limiting.
 */
function shouldLogRateLimitEvent_(status, scope, action) {
  const fingerprint = [
    "RATE_LIMIT_LOG",
    status,
    scope,
    action,
  ].join("_");

  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    fingerprint,
  );

  const cacheKey =
    "gcb_security_log_" +
    Utilities.base64EncodeWebSafe(digest)
      .replace(/=+$/, "")
      .slice(0, 40);

  const cache = CacheService.getScriptCache();

  if (cache.get(cacheKey) !== null) {
    return false;
  }

  cache.put(cacheKey, "1", 300); // 5 minutes
  return true;
}

function enforceRateLimit(
  key,
  limit,
  windowSeconds,
  errorMessage,
  logContext = {},
) {
  const { action = "UNKNOWN", scope = "UNKNOWN" } = logContext;

  if (
    typeof key !== "string" ||
    !key ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    !Number.isFinite(windowSeconds) ||
    windowSeconds < 1
  ) {
    const error = new Error("Invalid rate-limit configuration.");

    logRateLimitEvent_("FAILED", {
      action,
      scope,
      message: "Rate-limit configuration validation failed.",
      error,
    });

    throw error;
  }

  const lock = LockService.getScriptLock();

  // Do not attempt logging while holding the rate-limit lock.
  if (!lock.tryLock(5000)) {
    const error = new Error(
      "Rate-limit service is busy. Please try again shortly.",
    );

    logRateLimitEvent_("FAILED", {
      action,
      scope,
      message: "Could not acquire the rate-limit lock.",
      error,
    });

    throw error;
  }

  let operationError = null;
  let logEvent = null;

  try {
    const cache = CacheService.getScriptCache();
    const cacheKey = `gcb_rate_${key}`;
    const cached = cache.get(cacheKey);
    const current = cached === null ? 0 : Number(cached);

    if (!Number.isSafeInteger(current) || current < 0) {
      throw new Error("Rate-limit counter is invalid.");
    }

    if (current >= limit) {
      operationError = new Error(
        errorMessage || "Too many requests. Please wait and try again.",
      );

      logEvent = {
        status: "DENIED",
        message: "Rate limit exceeded.",
        error: operationError,
      };
    } else {
      cache.put(
        cacheKey,
        String(current + 1),
        Math.ceil(windowSeconds),
      );
    }
  } catch (error) {
    operationError = error;

    // Do not overwrite a rate-limit rejection with a generic failure.
    if (!logEvent) {
      logEvent = {
        status: "FAILED",
        message: "Rate-limit enforcement failed.",
        error,
      };
    }
  } finally {
    lock.releaseLock();
  }

  // Log only after releasing the script lock. The central operation
  // logger may acquire the same lock internally.
  if (logEvent) {
    logRateLimitEvent_(logEvent.status, {
      action,
      scope,
      message: logEvent.message,
      error: logEvent.error,
    });
  }

  if (operationError) {
    throw operationError;
  }
}
