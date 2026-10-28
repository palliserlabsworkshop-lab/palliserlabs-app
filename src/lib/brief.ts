/**
 * Project brief: option lists, validation and formatting.
 * Shared by the intake form (browser) and the server, so the rules are identical.
 *
 * Answers are stored as option KEYS (e.g. "talking_head"). To rename what a
 * client sees, change the label here — stored data keeps working.
 */

export type Option = { key: string; label: string };

export const FORMAT_OPTIONS: Option[] = [
  { key: "talking_head", label: "Talking head" },
  { key: "voiceover_broll", label: "Voice-over + B-roll" },
  { key: "day_in_the_life", label: "Day-in-the-life" },
  { key: "montage", label: "Montage" },
  { key: "educational", label: "Educational" },
  { key: "ugc", label: "UGC" },
  { key: "faceless_product", label: "Faceless product" },
  { key: "ai_scenes", label: "AI scenes" },
  { key: "other", label: "Other" },
];

export const PURPOSE_OPTIONS: Option[] = [
  { key: "personal_brand", label: "Personal brand" },
  { key: "paid_ad", label: "Paid ad" },
  { key: "product_launch", label: "Product launch" },
  { key: "testimonial", label: "Testimonial" },
];

export const STYLE_OPTIONS: Option[] = [
  { key: "cinematic", label: "Cinematic" },
  { key: "raw", label: "Raw" },
  { key: "calm", label: "Calm" },
  { key: "high_energy", label: "High-energy" },
  { key: "inspirational", label: "Inspirational" },
  { key: "funny", label: "Funny" },
];

export const PLATFORM_OPTIONS: Option[] = [
  { key: "vertical_9_16", label: "Reels / TikTok / Shorts (9:16)" },
  { key: "youtube_16_9", label: "YouTube (16:9)" },
  { key: "feed_1_1_4_5", label: "Feed post (1:1 or 4:5)" },
];

export const STYLE_MAX = 2;
export const HOOKS_MIN = 1;
export const HOOKS_MAX = 3;
export const HOOKS_DEFAULT = 1;
export const MAX_REFERENCE_LINKS = 10;
export const MAX_DRIVE_LINKS = 5;

/** Maximum turnaround per video. The earliest deadline a client can pick is this far ahead. */
export const TURNAROUND_HOURS = 24;
export const MAX_DEADLINE_DAYS = 365;

/** YYYY-MM-DD for a date `days` from today in the given (or local) time. */
export function isoDateFromToday(days: number, now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Earliest selectable deadline: today + turnaround, rounded up to whole days. */
export function earliestDeadline(now = new Date()): string {
  return isoDateFromToday(Math.ceil(TURNAROUND_HOURS / 24), now);
}

export type Brief = {
  version: 1;
  projectName: string;
  driveLink: string; // first footage link (kept for older briefs and the Video Link column)
  driveLinks: string[]; // all footage links — files or folders
  format: string[];
  formatOther: string;
  purpose: string[];
  style: string[];
  hookVariants: boolean;
  hookCount: number | null;
  deadline: string;
  platform: string[];
  referenceLinks: string[];
  notes: string;
};

export type BriefField =
  | "projectName"
  | "driveLink"
  | "format"
  | "formatOther"
  | "purpose"
  | "style"
  | "hookCount"
  | "deadline"
  | "platform"
  | "referenceLinks"
  | "notes";

export type BriefErrors = Partial<Record<BriefField, string>>;

const DRIVE_RE = /^https:\/\/(drive|docs)\.google\.com\/\S+$/i;

export function isDriveLink(value: string): boolean {
  return DRIVE_RE.test(value.trim());
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

const keysOf = (options: Option[]) => new Set(options.map((o) => o.key));
const pick = (value: unknown, options: Option[]) => {
  const allowed = keysOf(options);
  return Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === "string" && allowed.has(v)))] : [];
};
const str = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/** Cleans untrusted input (unknown keys dropped, lengths capped) and validates it. */
export function validateBrief(
  input: Record<string, unknown>,
  /** Earliest allowed deadline (YYYY-MM-DD). The server passes a day of leeway for time zones. */
  minDeadline = earliestDeadline(),
): { brief: Brief; errors: BriefErrors } {
  const rawCount = Math.round(Number(input.hookCount));
  const hookCount = Number.isFinite(rawCount) ? rawCount : NaN;
  const brief: Brief = {
    version: 1,
    projectName: str(input.projectName, 200),
    driveLink: "",
    driveLinks: (Array.isArray(input.driveLinks) ? input.driveLinks : [input.driveLink])
      .map((l) => str(l, 1000))
      .filter(Boolean),
    format: pick(input.format, FORMAT_OPTIONS),
    formatOther: str(input.formatOther, 200),
    purpose: pick(input.purpose, PURPOSE_OPTIONS),
    style: pick(input.style, STYLE_OPTIONS),
    hookVariants: hookCount > 1,
    hookCount,
    deadline: str(input.deadline, 10),
    platform: pick(input.platform, PLATFORM_OPTIONS),
    referenceLinks: Array.isArray(input.referenceLinks)
      ? input.referenceLinks.map((l) => str(l, 1000)).filter(Boolean)
      : [],
    notes: str(input.notes, 1500),
  };
  brief.driveLink = brief.driveLinks[0] ?? "";
  if (!brief.format.includes("other")) brief.formatOther = "";

  const errors: BriefErrors = {};
  if (!brief.projectName) errors.projectName = "Give your project a name.";
  if (!brief.driveLinks.length) errors.driveLink = "Paste a Google Drive link.";
  else if (brief.driveLinks.length > MAX_DRIVE_LINKS) errors.driveLink = `Add up to ${MAX_DRIVE_LINKS} links.`;
  else if (!brief.driveLinks.every(isDriveLink)) errors.driveLink = "Each link needs to be a Google Drive link (drive.google.com/…).";
  if (!brief.format.length) errors.format = "Pick at least one format.";
  else if (brief.format.includes("other") && !brief.formatOther) errors.formatOther = "Tell us which format.";
  if (!brief.purpose.length) errors.purpose = "Pick at least one purpose.";
  if (brief.style.length > STYLE_MAX) errors.style = `Pick up to ${STYLE_MAX}.`;
  if (!(Number(brief.hookCount) >= HOOKS_MIN && Number(brief.hookCount) <= HOOKS_MAX)) {
    errors.hookCount = `Choose between ${HOOKS_MIN} and ${HOOKS_MAX}.`;
  }
  if (!brief.deadline) errors.deadline = "Choose when you need it by.";
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(brief.deadline) || Number.isNaN(Date.parse(brief.deadline))) {
    errors.deadline = "Choose a valid date.";
  } else if (brief.deadline < minDeadline) {
    errors.deadline = `Our turnaround is ${TURNAROUND_HOURS} hours, so the earliest date is ${formatDeadline(minDeadline)}.`;
  } else if (brief.deadline > isoDateFromToday(MAX_DEADLINE_DAYS)) {
    errors.deadline = "Choose a date within the next year.";
  }
  if (!brief.platform.length) errors.platform = "Pick at least one platform.";
  if (brief.referenceLinks.length > MAX_REFERENCE_LINKS) {
    errors.referenceLinks = `Add up to ${MAX_REFERENCE_LINKS} links.`;
  } else if (brief.referenceLinks.some((l) => !isHttpUrl(l))) {
    errors.referenceLinks = "Each reference must be a full link starting with https://";
  }
  return { brief, errors };
}

/** Parses stored brief JSON; returns null if it isn't a brief. */
export function parseBrief(json: string): Brief | null {
  try {
    const data = JSON.parse(json);
    if (!data || typeof data !== "object" || data.version !== 1) return null;
    // Read stored answers as-is; validation rules may have changed since they were saved.
    const { brief } = validateBrief(data, "0000-00-00");
    const count = Number(data.hookCount) || (data.hookVariants === false ? 1 : null);
    return { ...brief, hookCount: count, hookVariants: (count ?? 1) > 1 };
  } catch {
    return null;
  }
}

/** Turns stored keys back into labels; unknown keys (e.g. a removed option) are shown as-is. */
export function labelsFor(keys: string[], options: Option[]): string[] {
  return keys.map((k) => options.find((o) => o.key === k)?.label ?? k);
}

/** "Thu 30 Oct 2026" for a YYYY-MM-DD date, independent of time zone. */
export function formatDeadline(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

export function formatLabels(brief: Brief): string[] {
  return labelsFor(brief.format, FORMAT_OPTIONS).map((label, i) =>
    brief.format[i] === "other" && brief.formatOther ? `Other: ${brief.formatOther}` : label,
  );
}

/** The brief as label/value rows — used for the app's brief page and the Notion page body. */
export function briefRows(brief: Brief): { label: string; values: string[]; links?: boolean }[] {
  return [
    { label: "Footage", values: brief.driveLinks, links: true },
    { label: "Needed by", values: brief.deadline ? [formatDeadline(brief.deadline)] : [] },
    { label: "Format", values: formatLabels(brief) },
    { label: "Purpose", values: labelsFor(brief.purpose, PURPOSE_OPTIONS) },
    { label: "Style / tone", values: labelsFor(brief.style, STYLE_OPTIONS) },
    {
      label: "Hooks",
      values: brief.hookCount ? [brief.hookCount > 1 ? `${brief.hookCount} hook variants` : "1 hook"] : [],
    },
    { label: "Platform", values: labelsFor(brief.platform, PLATFORM_OPTIONS) },
    { label: "Reference links", values: brief.referenceLinks, links: true },
    { label: "Notes", values: brief.notes ? [brief.notes] : [] },
  ];
}
