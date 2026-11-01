/**
 * Notion property names used by the portal. If you rename a column in
 * Notion, update it here — nothing else needs to change.
 */
/** Brands database (env CLIENTS_DB_ID) — one row per business or personal brand. No logins here. */
export const BRAND_PROPS = {
  name: "Name",
  status: "Status",
  type: "Type", // Select — "Business" or "Personal brand"
} as const;

/** Brand Type value for personal brands (case-insensitive match). */
export const PERSONAL_BRAND_TYPE = "Personal brand";

export const TASK_PROPS = {
  title: "Task",
  status: "Status",
  dueDate: "Due date",
  client: "Client",
  videoLink: "Video Link", // URL — the client's Google Drive link
  briefData: "Brief Data", // Text — the brief as JSON option keys (source of truth)
  finalVideo: "Final Video", // URL — the finished edit (Drive file or folder) for review
  revisionRound: "Revision round", // Number — 1 for the first cut, +1 per round of changes
  approvedOn: "Approved on", // Date — set when the client approves
  downloadedOn: "Downloaded on", // Date — set the first time the client clicks Download
  hooks: "Hooks", // Number — hook variants requested (for billing)
  format: "Format", // Multi-select — brief formats, as display labels
  platform: "Platform", // Multi-select — target platforms, as display labels
  code: "ID", // Unique ID (prefix PL) — e.g. PL-12, used to match Drive uploads to tasks
  requestedBy: "Requested by", // Relation to People (or Text) — who submitted it from the portal
  scriptStatus: "Script status", // Select — Queued / Ready for review / Changes requested / Approved (empty = no script step)
  script: "Script", // Text — starts as the client's script; edit it into the final script
  scriptLink: "Script Link", // URL — the client's Google Doc/Drive link, or your final Google Doc
} as const;

/** Script status options (Select on the Tasks DB). The video keeps using Status. */
export const SCRIPT_STATUS = {
  queued: "Queued",
  review: "Ready for review",
  changes: "Changes requested",
  approved: "Approved",
} as const;

/** People database (env PEOPLE_DB_ID) — everyone who signs in, each linked to one or more brands. */
export const PERSON_PROPS = {
  name: "Name",
  email: "Email",
  appPassword: "App Password",
  status: "Status",
  brands: "Brands", // Relation to the Clients/Brands database
  personalBrand: "Personal brand", // Checkbox — when ticked, the app creates and shows their personal brand
} as const;

/**
 * Review workflow status names. Each must exist as a Status option in Notion:
 * Ready for review + Tweaks requested in the "In progress" group,
 * Approved + Archived in the "Complete" group.
 */
export const REVIEW_STATUS = "Ready for review";
export const TWEAKS_STATUS = "Tweaks requested";
export const APPROVED_STATUS = "Approved";
export const ARCHIVED_STATUS = "Archived";

/** Days after download before an approved video is archived (hidden in the app, Archived in Notion). */
export const ARCHIVE_AFTER_DOWNLOAD_DAYS = 14;
/** Days after completion before an older Done task without the review flow is hidden in the app. */
export const HIDE_DONE_AFTER_DAYS = 30;

/** Status given to projects submitted from the portal. Must exist as an option in Notion. */
export const NEW_PROJECT_STATUS = "Queued";
/** Status for a project still in its script step (no footage yet), so it shows in your pipeline. */
export const SCRIPT_STAGE_STATUS = "Script";
/** Status once the script is approved — it's now a video project waiting on the client's footage. */
export const AWAITING_FOOTAGE_STATUS = "Awaiting footage";

export const FILE_PROPS = {
  name: "File name",
  file: "File / URL",
  type: "Type",
  client: "Client",
} as const;

/** Task status values that count as "Completed" (case-insensitive). */
export const DONE_STATUSES = ["done", "completed", "complete", "approved", "archived"];

/** Status values (on People or Brands) that switch a login or brand off (case-insensitive). */
export const BLOCKED_STATUSES = ["inactive", "archived", "disabled", "former"];
