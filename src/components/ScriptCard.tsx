"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { approveScriptAction, requestScriptChangesAction } from "@/app/actions";
import type { Task } from "@/lib/notion";
import { awaitingFootage } from "@/lib/review";
import { FeedbackThread, Tick } from "./ReviewParts";
import { ScriptText, ScriptTools } from "./ScriptTools";

type Stage = "review" | "approved" | "changes";

/**
 * The script step of a project, in the review section:
 *  - Ready for review: read it, copy/download it, approve or ask for changes.
 *  - Approved: the same card points to the next step — sending the footage.
 */
export function ScriptCard({ task, brandName }: { task: Task; brandName?: string }) {
  const router = useRouter();
  const serverStage: Stage = awaitingFootage(task) ? "approved" : "review";
  // Local stage moves the card on instantly; it resets when Notion moves the script on.
  const [localStage, setStage] = useState<Stage | null>(null);
  const [seenServerStage, setSeenServerStage] = useState(serverStage);
  if (seenServerStage !== serverStage) {
    setSeenServerStage(serverStage);
    setStage(null);
  }
  const stage = localStage ?? serverStage;
  const [mode, setMode] = useState<"idle" | "changes">("idle");
  const [details, setDetails] = useState("");
  const [error, setError] = useState("");
  const [flash, setFlash] = useState<"approved" | "sent" | null>(null);
  const [pending, startTransition] = useTransition();

  function approve() {
    setError("");
    startTransition(async () => {
      const result = await approveScriptAction(task.id);
      if (result.error) return setError(result.error);
      setFlash("approved");
      setTimeout(() => {
        setStage("approved");
        setFlash(null);
        router.refresh();
      }, 1400);
    });
  }

  function sendChanges(e: React.FormEvent) {
    e.preventDefault();
    if (!details.trim()) return setError("Tell us what you’d like changed.");
    setError("");
    startTransition(async () => {
      const result = await requestScriptChangesAction(task.id, details);
      if (result.error) return setError(result.error);
      setFlash("sent");
      setTimeout(() => {
        setStage("changes");
        setMode("idle");
        setFlash(null);
        router.refresh();
      }, 1400);
    });
  }

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-5 pt-5">
      <div className="min-w-0">
        {brandName && <span className="mb-1 block text-[0.68rem] font-bold uppercase tracking-[0.08em] text-muted">{brandName}</span>}
        <h3 className="break-words text-[1rem] font-bold leading-snug">{task.title}</h3>
      </div>
      <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-[0.7rem] font-bold text-muted">Script</span>
    </div>
  );

  const body = task.script ? (
    <ScriptText text={task.script} />
  ) : (
    <p className="rounded-2xl bg-surface px-4 py-3.5 text-[0.85rem] leading-relaxed text-muted">
      Your script is in the linked document.
    </p>
  );

  if (stage === "changes") {
    return (
      <article className="card animate-rise overflow-hidden">
        {header}
        <div className="mx-5 mb-5 mt-4 flex gap-3 rounded-2xl bg-accent/10 p-4">
          <span className="relative mt-1 flex h-2.5 w-2.5 shrink-0" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
          </span>
          <div>
            <p className="text-[0.85rem] font-bold text-accent-ink">Script changes in progress</p>
            <p className="mt-1 text-[0.8rem] leading-relaxed text-accent-ink/90">
              We’re on it. The updated script will appear right here for you to review.
            </p>
          </div>
        </div>
      </article>
    );
  }

  if (stage === "approved") {
    return (
      <article className="card animate-rise overflow-hidden">
        {header}
        <div className="space-y-4 px-5 pb-5 pt-4">
          <div className="flex items-center gap-3 rounded-2xl bg-primary/10 p-4 text-primary-ink">
            <Tick />
            <div>
              <p className="text-[0.85rem] font-bold">Script approved</p>
              <p className="mt-0.5 text-[0.78rem] leading-relaxed">
                Next step: send us your footage for this project. Your script comes with it.
              </p>
            </div>
          </div>
          <ScriptTools taskId={task.id} text={task.script} link={task.scriptLink} />
          <Link
            href={`/dashboard/projects/${task.id}/footage`}
            prefetch={false}
            className="pressable flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[0.9rem] font-bold text-on-ink hover:bg-primary-ink"
          >
            Next: send your footage
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
              <path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
      </article>
    );
  }

  // stage === "review"
  return (
    <article className="card animate-rise overflow-hidden ring-2 ring-orange/40">
      {header}
      <div className="space-y-3 px-5 pt-4">
        {body}
        <ScriptTools taskId={task.id} text={task.script} link={task.scriptLink} />
      </div>
      <div className="p-5">
        {flash ? (
          <div
            role="status"
            className={`flex h-12 animate-pop items-center justify-center gap-2 rounded-full text-[0.9rem] font-bold text-on-ink ${
              flash === "approved" ? "bg-success" : "bg-accent-ink"
            }`}
          >
            <Tick /> {flash === "approved" ? "Script approved" : "Changes sent"}
          </div>
        ) : mode === "idle" ? (
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => {
                setMode("changes");
                setError("");
              }}
              disabled={pending}
              className="pressable h-12 rounded-full border border-line bg-card text-[0.88rem] font-bold text-foreground hover:border-foreground/30"
            >
              Request changes
            </button>
            <button
              type="button"
              onClick={approve}
              disabled={pending}
              className="pressable flex h-12 items-center justify-center gap-2 rounded-full bg-foreground text-[0.88rem] font-bold text-on-ink hover:bg-success disabled:opacity-70"
            >
              {pending ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-on-ink/30 border-t-on-ink" aria-hidden />
              ) : (
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                  <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              Approve
            </button>
          </div>
        ) : (
          <form onSubmit={sendChanges} className="animate-rise space-y-4">
            <div>
              <label htmlFor={`script-changes-${task.id}`} className="mb-2.5 block text-[0.85rem] font-bold">
                What should we change?
              </label>
              <textarea
                id={`script-changes-${task.id}`}
                rows={3}
                maxLength={1500}
                autoFocus
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="e.g. “Make the second hook punchier and shorten the CTA.”"
                className="w-full resize-y rounded-xl border border-line bg-card px-3.5 py-3 text-base leading-relaxed placeholder:text-muted/70 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 sm:text-[0.9rem]"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setMode("idle")}
                className="pressable h-12 rounded-full text-[0.88rem] font-bold text-muted hover:bg-surface hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="pressable flex h-12 items-center justify-center gap-2 rounded-full bg-foreground text-[0.88rem] font-bold text-on-ink hover:bg-primary-ink disabled:opacity-70"
              >
                {pending && <span className="h-4 w-4 animate-spin rounded-full border-2 border-on-ink/30 border-t-on-ink" aria-hidden />}
                Send changes
              </button>
            </div>
          </form>
        )}
        {error && (
          <p role="alert" className="mt-3 text-center text-[0.8rem] font-bold text-orange-ink">
            {error}
          </p>
        )}
      </div>
      <FeedbackThread taskId={task.id} label="Feedback on this script" />
    </article>
  );
}
