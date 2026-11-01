import type { Task } from "./notion";
import { statusKind } from "./status";
import { scriptKind } from "./script";

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

/** A script waiting for the client to approve or ask for changes. */
export function scriptInReview(task: Task): boolean {
  return !task.done && !task.archived && scriptKind(task.scriptStatus) === "review";
}

/** Script approved, footage not sent yet — the project's next step is the client's. */
export function awaitingFootage(task: Task): boolean {
  return !task.done && !task.archived && scriptKind(task.scriptStatus) === "approved" && !task.hasBrief;
}

/** Everything that belongs in the "Ready for your review" section at the top of the dashboard. */
export function needsClient(task: Task): boolean {
  return Boolean(reviewStage(task)) || scriptInReview(task) || awaitingFootage(task);
}

/**
 * The project's journey, for the small progress line on cards:
 * Script (only if the project started with one) → Footage → Editing → Review → Done.
 */
export function projectSteps(task: Task): { steps: string[]; current: number } | null {
  const script = scriptKind(task.scriptStatus);
  if (!script && !task.hasBrief) return null;
  const steps = [...(script ? ["Script"] : []), "Footage", "Editing", "Review", "Done"];
  let label = "Editing";
  if (task.done) label = "Done";
  else if (script && script !== "approved" && !task.hasBrief) label = "Script";
  else if (!task.hasBrief) label = "Footage";
  else if (statusKind(task.status) === "review") label = "Review";
  return { steps, current: steps.indexOf(label) };
}
