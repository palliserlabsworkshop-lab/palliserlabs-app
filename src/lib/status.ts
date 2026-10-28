import { DONE_STATUSES } from "./schema";

export type StatusKind = "queued" | "in_progress" | "done" | "other";

/** Maps a Notion status name to one of the portal's status colours. */
export function statusKind(status: string, done?: boolean): StatusKind {
  const s = status.trim().toLowerCase();
  if (done || DONE_STATUSES.includes(s)) return "done";
  if (s === "queued") return "queued";
  if (s === "in progress" || s === "in-progress" || s === "doing") return "in_progress";
  return "other";
}
