import { DONE_STATUSES } from "./schema";

export type StatusKind = "queued" | "in_progress" | "review" | "tweaks" | "done" | "archived" | "other";

/** Maps a Notion status name to one of the portal's status colours. */
export function statusKind(status: string, done?: boolean): StatusKind {
  const s = status.trim().toLowerCase();
  if (s === "archived") return "archived";
  if (done || DONE_STATUSES.includes(s)) return "done";
  if (s === "queued") return "queued";
  if (s === "ready for review" || s === "in review" || s === "review") return "review";
  if (s === "tweaks requested" || s === "changes requested" || s === "tweaks in progress") return "tweaks";
  if (s === "in progress" || s === "in-progress" || s === "doing") return "in_progress";
  return "other";
}
