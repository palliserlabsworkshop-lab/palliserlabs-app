import type { Task } from "./notion";
import { scriptKind } from "./script";
import { statusKind, type StatusKind } from "./status";

/**
 * How a task shows on the board. While a project is still in its script step, the script's
 * stage is what matters (the video hasn't started), so it drives the colour and label.
 */
export function taskDisplay(task: Task): { kind: StatusKind; label?: string } {
  const script = scriptKind(task.scriptStatus);
  if (script && !task.hasBrief && !task.done) {
    if (script === "queued") return { kind: "queued", label: "Script queued" };
    if (script === "review") return { kind: "review", label: "Script ready" };
    if (script === "changes") return { kind: "tweaks", label: "Script changes" };
    return { kind: "done", label: "Script approved" };
  }
  return { kind: statusKind(task.status, task.done) };
}
