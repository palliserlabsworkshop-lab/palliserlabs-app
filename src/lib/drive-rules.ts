/**
 * Pure rules for the Drive → Notion sync, kept separate so they can be tested without
 * Notion or Google. The key guarantee: a client's decision is never overwritten.
 */

/** Finds a task code like "PL-12", "pl12" or "PL 12" in a file or folder name. Returns 12. */
export function parseTaskCode(name: string, prefix = "PL"): number | null {
  const match = name.match(new RegExp(`(?:^|[^a-z0-9])${prefix}[\\s_-]?(\\d{1,6})(?![0-9])`, "i"));
  return match ? Number(match[1]) : null;
}

export type SyncDecision = "deliver" | "skip-same" | "skip-done";

/**
 * What to do with a dropped file for a task:
 *  - skip-same: this exact link is already the task's Final Video (e.g. a move to Delivered failed earlier)
 *  - skip-done: the client already approved it / it's finished — never send it back to review
 *  - deliver:   set it as the Final Video and mark the task Ready for review
 */
export function decideSync(task: { statusKind: string; finalVideo: string | null }, link: string): SyncDecision {
  if (task.finalVideo && sameDriveItem(task.finalVideo, link)) return "skip-same";
  if (task.statusKind === "done" || task.statusKind === "archived") return "skip-done";
  return "deliver";
}

/** Compares two Drive links by their file/folder ID, ignoring the rest of the URL. */
export function sameDriveItem(a: string, b: string): boolean {
  const id = (link: string) =>
    link.match(/\/(?:file\/d|folders|d)\/([\w-]+)/)?.[1] ?? link.match(/[?&]id=([\w-]+)/)?.[1] ?? link.trim();
  return id(a) === id(b);
}
