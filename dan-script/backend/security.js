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
  );
}

function enforceGlobalRateLimit(action, limit, windowSeconds) {
  enforceRateLimit(
    `global_${action}`,
    limit,
    windowSeconds,
    "This operation is temporarily busy. Please try again shortly.",
  );
}


function enforceRateLimit(key, limit, windowSeconds, errorMessage) {
  if (
    typeof key !== "string" ||
    !key ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    !Number.isFinite(windowSeconds) ||
    windowSeconds < 1
  ) {
    throw new Error("Invalid rate-limit configuration.");
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(5000)) {
    throw new Error("Rate-limit service is busy. Please try again shortly.");
  }

  try {
    const cache = CacheService.getScriptCache();
    const cacheKey = `gcb_rate_${key}`;
    const cached = cache.get(cacheKey);
    const current = cached === null ? 0 : Number(cached);

    if (!Number.isSafeInteger(current) || current < 0) {
      throw new Error("Rate-limit counter is invalid.");
    }

    if (current >= limit) {
      throw new Error(
        errorMessage || "Too many requests. Please wait and try again.",
      );
    }

    cache.put(cacheKey, String(current + 1), Math.ceil(windowSeconds));
  } finally {
    lock.releaseLock();
  }
}

