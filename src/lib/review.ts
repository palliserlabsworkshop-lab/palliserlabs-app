import type { Task } from "./notion";
import { statusKind } from "./status";

/** Shared by the review card (browser) and the server action. */
export const TWEAK_AREAS = ["Pacing", "Captions", "Music", "Colour", "Hook", "Cut something", "Other"];

/**
 * Reads a Google Drive file or folder link. Drive's embedded player is blocked by
 * most phone browsers (third-party cookies), so the app shows a cover image and
 * opens the video in Drive instead. The thumbnail works for files shared
 * "Anyone with the link".
 */
export function driveInfo(link: string): { kind: "file" | "folder"; id: string; thumbnail: string | null } | null {
  try {
    const url = new URL(link);
    if (!/(^|\.)google\.com$/i.test(url.hostname)) return null;
    const folder = url.pathname.match(/\/folders\/([\w-]+)/);
    if (folder) return { kind: "folder", id: folder[1], thumbnail: null };
    const file = url.pathname.match(/\/file\/d\/([\w-]+)/) ?? url.pathname.match(/\/d\/([\w-]+)/);
    const id = file?.[1] ?? url.searchParams.get("id");
    if (id) return { kind: "file", id, thumbnail: `https://drive.google.com/thumbnail?id=${id}&sz=w1280` };
    return null;
  } catch {
    return null;
  }
}

export type ReviewStage = "review" | "tweaks" | "approved";

/** Which videos belong in the Review section, and in which state. */
export function reviewStage(task: Task): ReviewStage | null {
  const kind = statusKind(task.status, task.done);
  if (task.archived) return null;
  if (kind === "review") return "review";
  if (kind === "tweaks") return "tweaks";
  if (kind === "done" && task.finalVideo && !task.downloadedOn) return "approved";
  return null;
}
