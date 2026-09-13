/**
 * In-memory fixed-window rate limiter, keyed by IP.
 *
 * IMPORTANT: this state lives in process memory. It works correctly for a
 * single instance (e.g. one Vercel serverless function warm container, or
 * one Docker container) but does NOT coordinate across multiple instances.
 * For real horizontal scaling, replace this with a shared store
 * (Redis + INCR/EXPIRE, or Upstash's rate-limit package) - the interface
 * below (`checkRateLimit`) is intentionally the only thing callers depend
 * on, so that swap is contained to this file.
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = Number(process.env.RATE_LIMIT_PER_MINUTE || 20);

const buckets = new Map<string, { count: number; windowStart: number }>();

export function checkRateLimit(key: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1 };
  }

  if (bucket.count >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, remaining: 0 };
  }

  bucket.count += 1;
  return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - bucket.count };
}
