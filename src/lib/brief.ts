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
export const HOOKS_MIN = 2;
export const HOOKS_MAX = 10;
export const HOOKS_DEFAULT = 3;
export const MAX_REFERENCE_LINKS = 10;

export type Brief = {
  version: 1;
  projectName: string;
  driveLink: string;
  format: string[];
  formatOther: string;
  purpose: string[];
  style: string[];
  hookVariants: boolean;
  hookCount: number | null;
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
export function validateBrief(input: Record<string, unknown>): { brief: Brief; errors: BriefErrors } {
  const hookVariants = input.hookVariants !== false;
  const rawCount = Number(input.hookCount);
  const brief: Brief = {
    version: 1,
    projectName: str(input.projectName, 200),
    driveLink: str(input.driveLink, 1000),
    format: pick(input.format, FORMAT_OPTIONS),
    formatOther: str(input.formatOther, 200),
    purpose: pick(input.purpose, PURPOSE_OPTIONS),
    style: pick(input.style, STYLE_OPTIONS),
    hookVariants,
    hookCount: hookVariants ? (Number.isFinite(rawCount) ? Math.round(rawCount) : NaN) : null,
    platform: pick(input.platform, PLATFORM_OPTIONS),
    referenceLinks: Array.isArray(input.referenceLinks)
      ? input.referenceLinks.map((l) => str(l, 1000)).filter(Boolean)
      : [],
    notes: str(input.notes, 1500),
  };
  if (!brief.format.includes("other")) brief.formatOther = "";

  const errors: BriefErrors = {};
  if (!brief.projectName) errors.projectName = "Give your project a name.";
  if (!brief.driveLink) errors.driveLink = "Paste a Google Drive link.";
  else if (!isDriveLink(brief.driveLink)) errors.driveLink = "This needs to be a Google Drive link (drive.google.com/…).";
  if (!brief.format.length) errors.format = "Pick at least one format.";
  else if (brief.format.includes("other") && !brief.formatOther) errors.formatOther = "Tell us which format.";
  if (!brief.purpose.length) errors.purpose = "Pick at least one purpose.";
  if (brief.style.length > STYLE_MAX) errors.style = `Pick up to ${STYLE_MAX}.`;
  if (brief.hookVariants && !(Number(brief.hookCount) >= HOOKS_MIN && Number(brief.hookCount) <= HOOKS_MAX)) {
    errors.hookCount = `Choose between ${HOOKS_MIN} and ${HOOKS_MAX}.`;
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
    return { ...validateBrief(data).brief, hookCount: data.hookVariants === false ? null : Number(data.hookCount) || null };
  } catch {
    return null;
  }
}

/** Turns stored keys back into labels; unknown keys (e.g. a removed option) are shown as-is. */
export function labelsFor(keys: string[], options: Option[]): string[] {
  return keys.map((k) => options.find((o) => o.key === k)?.label ?? k);
}

export function formatLabels(brief: Brief): string[] {
  return labelsFor(brief.format, FORMAT_OPTIONS).map((label, i) =>
    brief.format[i] === "other" && brief.formatOther ? `Other: ${brief.formatOther}` : label,
  );
}

/** The brief as label/value rows — used for the app's brief page and the Notion page body. */
export function briefRows(brief: Brief): { label: string; values: string[]; links?: boolean }[] {
  return [
    { label: "Video files", values: [brief.driveLink], links: true },
    { label: "Format", values: formatLabels(brief) },
    { label: "Purpose", values: labelsFor(brief.purpose, PURPOSE_OPTIONS) },
    { label: "Style / tone", values: labelsFor(brief.style, STYLE_OPTIONS) },
    { label: "Hook variants", values: [brief.hookVariants ? `Yes — ${brief.hookCount} hooks` : "No"] },
    { label: "Platform", values: labelsFor(brief.platform, PLATFORM_OPTIONS) },
    { label: "Reference links", values: brief.referenceLinks, links: true },
    { label: "Notes", values: brief.notes ? [brief.notes] : [] },
  ];
}
