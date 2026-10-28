import type { Task } from "./notion";
import { statusKind } from "./status";

/** Shared by the review card (browser) and the server action. */
export const TWEAK_AREAS = ["Pacing", "Captions", "Music", "Colour", "Hook", "Cut something", "Other"];

/** Extracts a Google Drive file or folder ID and returns an embeddable preview URL. */
export function driveEmbed(link: string): { kind: "file" | "folder"; src: string } | null {
  try {
    const url = new URL(link);
    if (!/(^|\.)google\.com$/i.test(url.hostname)) return null;
    const folder = url.pathname.match(/\/folders\/([\w-]+)/);
    if (folder) return { kind: "folder", src: `https://drive.google.com/embeddedfolderview?id=${folder[1]}#grid` };
    const file = url.pathname.match(/\/file\/d\/([\w-]+)/) ?? url.pathname.match(/\/d\/([\w-]+)/);
    const id = file?.[1] ?? url.searchParams.get("id");
    if (id) return { kind: "file", src: `https://drive.google.com/file/d/${id}/preview` };
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
