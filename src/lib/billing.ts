/**
 * Billing rules for approved videos. Pure functions (no Notion or Stripe calls), so they're easy
 * to test and the numbers on every charge are explained by this one file.
 *
 * - Each approved video is one Video Edit ($70 AUD).
 * - Add-ons (written hooks, written CTAs, visual hooks, visual CTAs) are off unless the client
 *   switches them on; the first of each is included, each extra is $5.
 * - 24-hour guarantee: if the first delivery (first time Ready for review) came more than 24 hours
 *   after the footage was sent, the video and its add-ons are free. Change requests after that
 *   don't affect it.
 * - Billing periods follow the client's Stripe subscription: from the renewal day to the day
 *   before the next one (e.g. 12 Nov–11 Dec), labelled by the month it starts in.
 */

export const CURRENCY = "AUD";
/** Prices in cents, matching the Stripe prices below. */
export const PRICE_CENTS = { videoEdit: 7000, addOn: 500 } as const;
export const LATE_AFTER_HOURS = 24;
/** Approvals before this date aren't charged by the automatic catch-up (no back-billing). */
export const BILLING_START_DATE = "2026-11-01";
/** Days and month labels are worked out in Melbourne time. */
export const BILLING_TIME_ZONE = "Australia/Melbourne";

/** Stripe price IDs, for creating draft invoices later. */
export const STRIPE_PRICE_IDS = {
  subscription: "price_1UXuekP1RcvqXRBb5ECVqXPl",
  videoEdit: "price_1UXuelP1RcvqXRBb3OkaKkx4",
  extraVisualHook: "price_1UXuenP1RcvqXRBbIkQjQr54",
  extraWrittenHook: "price_1UXueoP1RcvqXRBb4zBtas1h",
  extraWrittenCta: "price_1UXueqP1RcvqXRBb7Nxuys2g",
  extraVisualCta: "price_1UXuerP1RcvqXRBb6Rr9mQfV",
} as const;

export type ChargeInput = {
  visualHooks: number | null;
  visualCtas: number | null;
  writtenHooks: number | null;
  writtenCtas: number | null;
  /** ISO time the client sent footage (starts the clock). */
  footageSent: string | null;
  /** ISO time it was first Ready for review (stops the clock). */
  deliveredOn: string | null;
};

export type Charge = {
  late: boolean;
  videoEdits: number;
  extraWrittenHooks: number;
  extraVisualHooks: number;
  extraWrittenCtas: number;
  extraVisualCtas: number;
  totalCents: number;
  breakdown: string;
};

/** Extras beyond the one included (0 if the add-on is off). */
export const extras = (count: number | null | undefined) => Math.max(0, Math.floor(Number(count) || 0) - 1);

export const dollars = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

/** Hours between footage being sent and first delivery, or null if either time is missing. */
export function deliveryHours(footageSent: string | null, deliveredOn: string | null): number | null {
  if (!footageSent || !deliveredOn) return null;
  const ms = Date.parse(deliveredOn) - Date.parse(footageSent);
  return Number.isFinite(ms) ? ms / 3_600_000 : null;
}

export function computeCharge(input: ChargeInput): Charge {
  const hours = deliveryHours(input.footageSent, input.deliveredOn);
  // Without both times we can't prove it was late, so it's charged normally.
  const late = hours !== null && hours > LATE_AFTER_HOURS;
  const counts = {
    extraWrittenHooks: extras(input.writtenHooks),
    extraVisualHooks: extras(input.visualHooks),
    extraWrittenCtas: extras(input.writtenCtas),
    extraVisualCtas: extras(input.visualCtas),
  };
  if (late) {
    return {
      late,
      videoEdits: 0,
      extraWrittenHooks: 0,
      extraVisualHooks: 0,
      extraWrittenCtas: 0,
      extraVisualCtas: 0,
      totalCents: 0,
      breakdown: `Late — free under the 24-hour guarantee (delivered after ${Math.round(hours!)} hrs)`,
    };
  }
  const parts = [`Video edit ${dollars(PRICE_CENTS.videoEdit)}`];
  const add = (n: number, one: string, many: string) => {
    if (n > 0) parts.push(`+${n} ${n === 1 ? one : many} ${dollars(n * PRICE_CENTS.addOn)}`);
  };
  add(counts.extraWrittenHooks, "written hook", "written hooks");
  add(counts.extraVisualHooks, "visual hook", "visual hooks");
  add(counts.extraWrittenCtas, "written CTA", "written CTAs");
  add(counts.extraVisualCtas, "visual CTA", "visual CTAs");
  const extraTotal =
    (counts.extraWrittenHooks + counts.extraVisualHooks + counts.extraWrittenCtas + counts.extraVisualCtas) *
    PRICE_CENTS.addOn;
  return { late, videoEdits: 1, ...counts, totalCents: PRICE_CENTS.videoEdit + extraTotal, breakdown: parts.join(" · ") };
}

// ---------------------------------------------------------------------------
// Billing periods
// ---------------------------------------------------------------------------

type Ymd = { y: number; m: number; d: number }; // m is 1–12

/** Calendar date of an instant in the billing time zone. */
export function localDate(at: Date, timeZone = BILLING_TIME_ZONE): Ymd {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const iso = ({ y, m, d }: Ymd) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const addMonths = (y: number, m: number, n: number) => {
  const total = y * 12 + (m - 1) + n;
  return { y: Math.floor(total / 12), m: (total % 12) + 1 };
};
/** The renewal day in a given month (a 31st renews on the 30th in a 30-day month, as Stripe does). */
const renewalIn = (y: number, m: number, anchorDay: number): Ymd => ({ y, m, d: Math.min(anchorDay, daysIn(y, m)) });
const before = (a: Ymd, b: Ymd) => iso(a) < iso(b);
const dayBefore = ({ y, m, d }: Ymd): Ymd => {
  if (d > 1) return { y, m, d: d - 1 };
  const p = addMonths(y, m, -1);
  return { ...p, d: daysIn(p.y, p.m) };
};

export type Period = { start: string; end: string; label: string };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The billing period containing `approvedAt`, for a subscription renewing on the anchor's day.
 * Null if the approval came before the subscription started.
 */
export function billingPeriod(approvedAt: Date, anchor: Date, subscriptionStart: Date): Period | null {
  const day = localDate(approvedAt);
  if (before(day, localDate(subscriptionStart))) return null;
  const anchorDay = localDate(anchor).d;
  let start = renewalIn(day.y, day.m, anchorDay);
  if (before(day, start)) {
    const p = addMonths(day.y, day.m, -1);
    start = renewalIn(p.y, p.m, anchorDay);
  }
  const n = addMonths(start.y, start.m, 1);
  const end = dayBefore(renewalIn(n.y, n.m, anchorDay));
  const label = `${MONTHS[start.m - 1]} ${start.y} (${start.d} ${SHORT[start.m - 1]}–${end.d} ${SHORT[end.m - 1]})`;
  return { start: iso(start), end: iso(end), label };
}

/** Group name for the Charges "Invoice" column (Notion select options can't contain commas). */
export function invoiceName(account: string | null, period: Period | null): string {
  const who = account?.trim() || "Unassigned";
  return `${who} — ${period ? period.label : "No subscription yet"}`.replace(/,/g, " ").slice(0, 100);
}
