import "server-only";

/**
 * Fast in-memory throttle, a first line of defence in front of the per-account lockout that's
 * stored in Notion (see authenticatePerson). Per email: 5 failures / 15 min. Per IP address:
 * 20 failures / 15 min across all emails, which stops one visitor trying many accounts.
 * Each Vercel instance has its own memory, which is why the Notion lockout is the hard limit.
 * Also used to rate-limit posting (key prefix "post:").
 */
const WINDOW_MS = 15 * 60 * 1000;
const limitFor = (key: string) => (key.startsWith("ip:") ? 20 : key.startsWith("post:") ? 60 : 5);
const failures = new Map<string, { count: number; resetAt: number }>();

export function isLimited(key: string): boolean {
  const entry = failures.get(key);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    failures.delete(key);
    return false;
  }
  return entry.count >= limitFor(key);
}

export function recordFailure(key: string) {
  const now = Date.now();
  const entry = failures.get(key);
  if (!entry || now > entry.resetAt) failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
  else entry.count++;
  if (failures.size > 10_000) failures.clear();
}

/** Counts one use against a key's limit (same counter as recordFailure, clearer name for posting). */
export const recordHit = recordFailure;

export function clearFailures(key: string) {
  failures.delete(key);
}
