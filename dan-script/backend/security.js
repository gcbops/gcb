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
  const cache = CacheService.getScriptCache();

  const cacheKey = `gcb_rate_${key}`;

  const current = Number(cache.get(cacheKey) || 0);

  if (current >= limit) {
    throw new Error(
      errorMessage || "Too many requests. Please wait and try again.",
    );
  }

  cache.put(cacheKey, String(current + 1), windowSeconds);
}
