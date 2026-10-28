import "server-only";

/**
 * Simple in-memory login throttle: 5 failed attempts per key per 15 minutes.
 * On Vercel each serverless instance has its own memory, so this slows down
 * guessing rather than guaranteeing a hard limit. For a strict global limit,
 * back it with a shared store such as Upstash Redis or Vercel KV.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const failures = new Map<string, { count: number; resetAt: number }>();

export function isLimited(key: string): boolean {
  const entry = failures.get(key);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    failures.delete(key);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

export function recordFailure(key: string) {
  const now = Date.now();
  const entry = failures.get(key);
  if (!entry || now > entry.resetAt) failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
  else entry.count++;
  if (failures.size > 10_000) failures.clear();
}

export function clearFailures(key: string) {
  failures.delete(key);
}
