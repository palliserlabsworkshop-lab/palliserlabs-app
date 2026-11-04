import "server-only";

/**
 * Read-only Stripe lookups for billing periods. Uses a restricted key (STRIPE_SECRET_KEY) that only
 * needs Customers: Read and Subscriptions: Read. Nothing here can charge, change or send anything.
 * Without the key, or before a client subscribes, charges are filed under "No subscription yet".
 */

export type SubscriptionTiming = { anchor: Date; start: Date; endedAt: Date | null };

type StripeSubscription = {
  status: string;
  billing_cycle_anchor?: number;
  start_date?: number;
  created?: number;
  ended_at?: number | null;
};

const CUSTOMER_RE = /^cus_[A-Za-z0-9]{6,64}$/;

/** All of a customer's subscriptions (most recent first), or null if Stripe isn't set up / reachable. */
async function listSubscriptions(customerId: string): Promise<StripeSubscription[] | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !CUSTOMER_RE.test(customerId)) return null;
  const url = `https://api.stripe.com/v1/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=20`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    console.error(`Stripe subscriptions lookup failed (${res.status}).`);
    return null;
  }
  const body = (await res.json()) as { data?: StripeSubscription[] };
  return Array.isArray(body.data) ? body.data : [];
}

const LIVE = new Set(["active", "trialing", "past_due", "unpaid", "paused"]);

/**
 * The subscription that covered `at`: started on or before it and not ended before it.
 * Prefers a live subscription when there's more than one.
 */
export async function subscriptionAt(customerId: string, at: Date): Promise<SubscriptionTiming | null> {
  const subs = await listSubscriptions(customerId).catch((error) => {
    console.error("Stripe lookup error:", error);
    return null;
  });
  if (!subs) return null;
  const t = at.getTime() / 1000;
  const covering = subs
    .filter((s) => (s.start_date ?? s.created ?? Infinity) <= t + 86_400 && (!s.ended_at || s.ended_at >= t))
    .sort((a, b) => Number(LIVE.has(b.status)) - Number(LIVE.has(a.status)));
  const sub = covering[0];
  if (!sub?.billing_cycle_anchor) return null;
  return {
    anchor: new Date(sub.billing_cycle_anchor * 1000),
    start: new Date((sub.start_date ?? sub.created ?? sub.billing_cycle_anchor) * 1000),
    endedAt: sub.ended_at ? new Date(sub.ended_at * 1000) : null,
  };
}
