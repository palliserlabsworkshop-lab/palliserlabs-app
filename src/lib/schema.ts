/**
 * Notion property names used by the portal. If you rename a column in
 * Notion, update it here — nothing else needs to change.
 */
export const CLIENT_PROPS = {
  name: "Name",
  email: "Email",
  company: "Company",
  status: "Status",
  appPassword: "App Password",
} as const;

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

export const FILE_PROPS = {
  name: "File name",
  file: "File / URL",
  type: "Type",
  client: "Client",
} as const;

/** Task status values that count as "Completed" (case-insensitive). */
export const DONE_STATUSES = ["done", "completed", "complete", "approved", "archived"];

/** Client Status values that are NOT allowed to log in (case-insensitive). */
export const BLOCKED_CLIENT_STATUSES = ["inactive", "archived", "disabled", "former"];
