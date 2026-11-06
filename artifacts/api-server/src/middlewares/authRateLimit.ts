import { isIP } from "node:net";
import type { RequestHandler } from "express";

const MAX_REQUESTS_PER_WINDOW = 20;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED_CLIENTS = 10_000;
const CLEANUP_INTERVAL_MS = 60_000;

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitBucket>();
let lastCleanupAt = 0;

function cleanupExpiredBuckets(now: number) {
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;

  for (const [ip, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(ip);
  }
  lastCleanupAt = now;
}

function getClientIp(req: Parameters<RequestHandler>[0]): string {
  const ip = (req.ip || req.socket.remoteAddress || "unknown").replace(
    /^::ffff:/,
    "",
  );
  return isIP(ip) ? ip : "unknown";
}

export const authRateLimit: RequestHandler = (req, res, next) => {
  const now = Date.now();
  cleanupExpiredBuckets(now);

  const ip = getClientIp(req);
  let bucket = buckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(ip, bucket);
  }

  if (bucket.count >= MAX_REQUESTS_PER_WINDOW) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((bucket.resetAt - now) / 1000),
    );
    res.setHeader("Retry-After", String(retryAfterSeconds));
    res.status(429).json({
      error: "Too many sign-in requests. Please wait and try again.",
    });
    return;
  }

  bucket.count += 1;
  if (buckets.size > MAX_TRACKED_CLIENTS) {
    const oldestIp = buckets.keys().next().value;
    if (oldestIp && oldestIp !== ip) buckets.delete(oldestIp);
  }
  next();
};
