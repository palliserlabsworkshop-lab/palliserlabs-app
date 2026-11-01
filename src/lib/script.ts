/**
 * Script step: an optional first stage of a project. The client sends their script (pasted or
 * as a Google Doc / Drive link) and picks what we add — written hook(s) and/or a call to action.
 * We edit it in Notion, the client approves it, then the same project moves on to footage.
 * Shared by the form (browser) and the server, so the rules are identical.
 */
import { isHttpUrl } from "./brief";

/** Minimum turnaround shown to clients ("2 hrs+"). */
export const SCRIPT_TURNAROUND_LABEL = "2 hrs+";
export const SCRIPT_MAX_LENGTH = 20_000;
export const WRITTEN_HOOKS_MAX = 3;

export type ScriptRequest = {
  projectName: string;
  text: string;
  link: string;
  /** Written hooks to add, 0–3. */
  hooks: number;
  cta: boolean;
  notes: string;
};

export type ScriptField = "projectName" | "script" | "adds";
export type ScriptErrors = Partial<Record<ScriptField, string>>;

const str = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/** Cleans untrusted input (lengths capped) and validates it. */
export function validateScriptRequest(input: Record<string, unknown>): { request: ScriptRequest; errors: ScriptErrors } {
  const hooks = Math.round(Number(input.hooks));
  const request: ScriptRequest = {
    projectName: str(input.projectName, 200),
    text: typeof input.text === "string" ? input.text.replace(/\r\n/g, "\n").trim().slice(0, SCRIPT_MAX_LENGTH) : "",
    link: str(input.link, 1000),
    hooks: Number.isFinite(hooks) ? Math.min(Math.max(hooks, 0), WRITTEN_HOOKS_MAX) : 0,
    cta: input.cta === true,
    notes: str(input.notes, 1500),
  };
  const errors: ScriptErrors = {};
  if (!request.projectName) errors.projectName = "Give your project a name.";
  if (!request.text && !request.link) errors.script = "Paste your script or add a link to it.";
  else if (request.link && !isHttpUrl(request.link)) errors.script = "The link needs to start with https://";
  if (!request.hooks && !request.cta) errors.adds = "Pick at least one.";
  return { request, errors };
}

/** What the client asked us to add, as readable lines. */
export function scriptAdds(request: Pick<ScriptRequest, "hooks" | "cta">): string[] {
  return [
    request.hooks ? (request.hooks > 1 ? `${request.hooks} written hooks` : "1 written hook") : "",
    request.cta ? "Call to action" : "",
  ].filter(Boolean);
}

export type ScriptKind = "queued" | "review" | "changes" | "approved";

/** Maps the Script status column to a stage. Empty means the project has no script step. */
export function scriptKind(status: string): ScriptKind | null {
  const s = status.trim().toLowerCase();
  if (!s) return null;
  if (s === "approved" || s === "done") return "approved";
  if (s === "ready for review" || s === "in review" || s === "review") return "review";
  if (s === "changes requested" || s === "tweaks requested") return "changes";
  return "queued"; // Queued, In progress, or anything custom
}

/** "Spring launch – script.txt", safe for a download filename. */
export function scriptFileName(title: string): string {
  const base = title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Script";
  return `${base} – script.txt`;
}
