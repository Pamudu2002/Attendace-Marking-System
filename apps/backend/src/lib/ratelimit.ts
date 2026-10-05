import { ApiError } from "./http";

/**
 * Small in-memory fixed-window limiter. Good enough for a single backend instance;
 * swap for a Postgres/Redis counter if the API is scaled horizontally.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): void {
  if (process.env.RATE_LIMIT_DISABLED === "1") return;
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  b.count++;
  if (b.count > limit) {
    throw new ApiError(429, "RATE_LIMITED", "Too many requests, try again later", {
      retryAfterSec: Math.ceil((b.resetAt - now) / 1000),
    });
  }
}
