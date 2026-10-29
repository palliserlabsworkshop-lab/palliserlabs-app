import "server-only";
import { decideSync, parseTaskCode } from "./drive-rules";
import { driveInfo } from "./review";
import { deliverFinalVideo, findTaskByCode } from "./notion";
import {
  ensureSubfolder,
  finalEditsFolderId,
  isDriveConfigured,
  listFolder,
  moveTo,
  shareWithAnyone,
  viewLink,
} from "./google-drive";

const DELIVERED = "Delivered";
const ARCHIVE = "Archive";
const MAX_PER_RUN = 10; // keeps each run well inside the function time limit

export type SyncReport = { configured: boolean; delivered: string[]; skipped: string[]; unmatched: string[] };

/**
 * Picks up final edits dropped into the Drive "Final edits" folder.
 * Files and folders are handled the same way. Each name must contain the task's code, e.g. "PL-12 Spring launch.mp4".
 * Order matters: Notion is updated first; sharing and moving are best-effort afterwards.
 */
export async function syncFinalEdits(): Promise<SyncReport> {
  const report: SyncReport = { configured: isDriveConfigured(), delivered: [], skipped: [], unmatched: [] };
  if (!report.configured) return report;

  const root = finalEditsFolderId()!;
  const [delivered, archive] = await Promise.all([ensureSubfolder(DELIVERED), ensureSubfolder(ARCHIVE)]);
  const items = (await listFolder(root)).filter((i) => i.id !== delivered && i.id !== archive).slice(0, MAX_PER_RUN);

  for (const item of items) {
    const code = parseTaskCode(item.name);
    const task = code !== null ? await findTaskByCode(code) : null;
    if (!task) {
      report.unmatched.push(item.name);
      continue;
    }
    const link = viewLink(item);
    const decision = decideSync(task, link);

    if (decision === "skip-done") {
      // Never reopen work the client has approved; leave the file where it is for a human to check.
      console.warn(`Drive sync: "${item.name}" matches "${task.title}", which is already finished — left untouched.`);
      report.skipped.push(item.name);
      continue;
    }
    if (decision === "deliver") {
      await deliverFinalVideo(task, link);
      report.delivered.push(`${item.name} → ${task.title}`);
    } else {
      report.skipped.push(item.name);
    }
    // Best effort: make it watchable, then file it away. Failures only log.
    await shareWithAnyone(item.id).catch((e) => console.error(`Drive sync: sharing "${item.name}" failed`, e));
    await moveTo(item.id, delivered).catch((e) => console.error(`Drive sync: moving "${item.name}" failed`, e));
  }
  if (report.delivered.length || report.unmatched.length) console.log("Drive sync:", JSON.stringify(report));
  return report;
}

/** Moves the Drive files of archived videos into Final edits / Archive. */
export async function archiveDriveFiles(links: string[]): Promise<void> {
  if (!isDriveConfigured() || !links.length) return;
  const archive = await ensureSubfolder(ARCHIVE);
  for (const link of links) {
    const id = driveInfo(link)?.id;
    if (id) await moveTo(id, archive).catch((e) => console.error("Drive archive move failed", e));
  }
}

let lastRun = 0;
let running: Promise<unknown> | null = null;

/** Runs the sync at most once a minute per server instance — called after dashboard loads. */
export function maybeSyncFinalEdits(): Promise<unknown> | void {
  if (!isDriveConfigured() || running || Date.now() - lastRun < 60_000) return;
  lastRun = Date.now();
  running = syncFinalEdits()
    .catch((error) => console.error("Drive sync failed:", error))
    .finally(() => {
      running = null;
    });
  return running;
}
