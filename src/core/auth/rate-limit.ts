import { AppError } from '../errors';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitBucket>();

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= maxRequests) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  existing.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function enforceRateLimit(
  key: string,
  maxRequests = 15,
  windowMs = 60_000
): void {
  if (process.env.DISABLE_RATE_LIMIT === 'true') return;
  const res = checkRateLimit(key, maxRequests, windowMs);
  if (!res.allowed) {
    throw new AppError(429, 'RATE_LIMITED', 'Попробуйте через минуту');
  }
}

export function resetRateLimits(): void {
  buckets.clear();
}
