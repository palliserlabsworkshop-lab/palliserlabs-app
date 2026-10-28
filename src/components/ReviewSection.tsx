"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveVideoAction, requestTweaksAction } from "@/app/actions";
import type { Task } from "@/lib/notion";
import { driveEmbed, reviewStage, TWEAK_AREAS, type ReviewStage as Stage } from "@/lib/review";
import { formatDueDate } from "@/lib/format";
import { Comments } from "./Comments";


function Player({ link }: { link: string }) {
  const embed = driveEmbed(link);
  return (
    <div className="overflow-hidden rounded-2xl bg-foreground/[0.04] ring-1 ring-line">
      {embed ? (
        <iframe
          src={embed.src}
          title="Video preview"
          allow="autoplay; fullscreen"
          allowFullScreen
          loading="lazy"
          className={`block w-full border-0 bg-surface ${embed.kind === "file" ? "aspect-video" : "h-80"}`}
        />
      ) : (
        <div className="flex aspect-video items-center justify-center px-6 text-center text-sm text-muted">
          Preview isn’t available for this link — open it in Google Drive below.
        </div>
      )}
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-11 items-center justify-center gap-1.5 border-t border-line bg-card text-[0.78rem] font-bold text-foreground transition-colors hover:bg-surface"
      >
        Open in Google Drive
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
          <path d="M5 11l6-6M6 5h5v5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </a>
    </div>
  );
}

function Tick({ className = "h-[22px] w-[22px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} animate-pop`} fill="none" aria-hidden>
      <circle cx="12" cy="12" r="11" fill="currentColor" fillOpacity="0.18" />
      <path
        d="M7 12.5l3.2 3.2L17 8.8"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="16"
        className="animate-draw [--dash:16]"
      />
    </svg>
  );
}

function FeedbackThread({ taskId }: { taskId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-line">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-12 w-full items-center justify-between px-5 text-[0.8rem] font-bold text-foreground transition-colors hover:bg-surface/60"
      >
        Feedback on this video
        <svg
          viewBox="0 0 16 16"
          className={`h-3.5 w-3.5 text-muted transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="animate-rise border-t border-line">
          <Comments
            bare
            loadOnMount
            initial={[]}
            endpoint={`/api/tasks/${taskId}/comments`}
            emptyTitle="No feedback on this video yet."
            emptyHint="Anything you post here goes straight to your editor."
            placeholder="Comment on this video…"
          />
        </div>
      )}
    </div>
  );
}

function ReviewCard({ task }: { task: Task }) {
  const router = useRouter();
  const serverStage = reviewStage(task) ?? "review";
  // A local stage lets the card move on instantly after an action; it resets whenever
  // Notion moves the video on (e.g. the editor marks round 2 ready for review).
  const [localStage, setStage] = useState<Stage | null>(null);
  const [seenServerStage, setSeenServerStage] = useState(serverStage);
  if (seenServerStage !== serverStage) {
    setSeenServerStage(serverStage);
    setStage(null);
  }
  const stage = localStage ?? serverStage;
  const [mode, setMode] = useState<"idle" | "changes">("idle");
  const [areas, setAreas] = useState<string[]>([]);
  const [details, setDetails] = useState("");
  const [timestamp, setTimestamp] = useState("");
  const [error, setError] = useState("");
  const [flash, setFlash] = useState<"approved" | "sent" | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [pending, startTransition] = useTransition();
  // After sending changes the next round starts straight away, before Notion catches up.
  const round = (task.revisionRound ?? 1) + (localStage === "tweaks" && serverStage === "review" ? 1 : 0);

  function approve() {
    setError("");
    startTransition(async () => {
      const result = await approveVideoAction(task.id);
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
      const result = await requestTweaksAction(task.id, { areas, details, timestamp });
      if (result.error) return setError(result.error);
      setFlash("sent");
      setTimeout(() => {
        setStage("tweaks");
        setMode("idle");
        setFlash(null);
        router.refresh();
      }, 1400);
    });
  }

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-5 pt-5">
      <div className="min-w-0">
        <h3 className="break-words text-[1rem] font-bold leading-snug">{task.title}</h3>
        {task.dueDate && <p className="mt-1 text-[0.75rem] text-muted">Due {formatDueDate(task.dueDate)}</p>}
      </div>
      <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-[0.7rem] font-bold text-muted">Round {round}</span>
    </div>
  );

  if (stage === "tweaks") {
    return (
      <article className="card animate-rise overflow-hidden">
        {header}
        <div className="mx-5 mb-5 mt-4 flex gap-3 rounded-2xl bg-accent/10 p-4">
          <span className="relative mt-1 flex h-2.5 w-2.5 shrink-0" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
          </span>
          <div>
            <p className="text-[0.85rem] font-bold text-accent-ink">Tweaks in progress</p>
            <p className="mt-1 text-[0.8rem] leading-relaxed text-accent-ink/90">
              We’re working on your changes. Round {round} will appear right here as soon as it’s ready to review.
            </p>
          </div>
        </div>
        <FeedbackThread taskId={task.id} />
      </article>
    );
  }

  if (stage === "approved") {
    const done = downloaded || Boolean(task.downloadedOn);
    return (
      <article className="card animate-rise overflow-hidden">
        {header}
        <div className="px-5 pb-5 pt-4">
          <div className="flex items-center gap-3 rounded-2xl bg-primary/10 p-4 text-primary-ink">
            <Tick />
            <div>
              <p className="text-[0.85rem] font-bold">Approved — your final cut is ready</p>
              <p className="mt-0.5 text-[0.78rem] leading-relaxed">Download it below. We’ll tidy it away a couple of weeks after.</p>
            </div>
          </div>
          <a
            href={`/api/videos/${task.id}/download`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setTimeout(() => setDownloaded(true), 400)}
            className={`pressable mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full text-[0.9rem] font-bold text-white ${
              done ? "bg-success" : "bg-foreground hover:bg-primary-ink"
            }`}
          >
            {done ? (
              <>
                <Tick className="h-5 w-5" /> Downloaded — download again
              </>
            ) : (
              <>
                <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
                  <path d="M10 3.5v9M6 9l4 4 4-4M4 16.5h12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Download final cut
              </>
            )}
          </a>
        </div>
      </article>
    );
  }

  // stage === "review"
  return (
    <article className="card animate-rise overflow-hidden ring-2 ring-orange/40">
      {header}
      <div className="px-5 pt-4">{task.finalVideo ? <Player link={task.finalVideo} /> : null}</div>

      <div className="p-5">
        {flash ? (
          <div
            role="status"
            className={`flex h-12 animate-pop items-center justify-center gap-2 rounded-full text-[0.9rem] font-bold text-white ${
              flash === "approved" ? "bg-success" : "bg-accent-ink"
            }`}
          >
            <Tick /> {flash === "approved" ? "Approved" : "Changes sent"}
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
              className="pressable flex h-12 items-center justify-center gap-2 rounded-full bg-foreground text-[0.88rem] font-bold text-white hover:bg-success disabled:opacity-70"
            >
              {pending ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden />
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
              <p className="mb-2.5 text-[0.85rem] font-bold">What should we change?</p>
              <div className="flex flex-wrap gap-2">
                {TWEAK_AREAS.map((a) => {
                  const on = areas.includes(a);
                  return (
                    <button
                      key={a}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setAreas(on ? areas.filter((x) => x !== a) : [...areas, a])}
                      className={`pressable min-h-10 rounded-full border px-3.5 text-[0.78rem] font-bold ${
                        on ? "border-foreground bg-foreground text-white" : "border-line bg-card hover:border-foreground/30"
                      }`}
                    >
                      {a}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label htmlFor={`details-${task.id}`} className="sr-only">
                Details
              </label>
              <textarea
                id={`details-${task.id}`}
                rows={3}
                maxLength={1500}
                autoFocus
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Tell us the details — e.g. “Trim the intro and make the captions bigger.”"
                className="w-full resize-y rounded-xl border border-line bg-card px-3.5 py-3 text-base leading-relaxed placeholder:text-muted/70 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 sm:text-[0.9rem]"
              />
            </div>
            <div className="flex items-center gap-3">
              <label htmlFor={`ts-${task.id}`} className="shrink-0 text-[0.8rem] font-bold">
                At <span className="font-normal text-muted">(optional)</span>
              </label>
              <input
                id={`ts-${task.id}`}
                value={timestamp}
                onChange={(e) => setTimestamp(e.target.value)}
                maxLength={40}
                placeholder="0:12"
                inputMode="numeric"
                className="h-11 w-28 rounded-xl border border-line bg-card px-3 text-base focus:border-primary focus:outline-none sm:text-[0.9rem]"
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
                className="pressable flex h-12 items-center justify-center gap-2 rounded-full bg-foreground text-[0.88rem] font-bold text-white hover:bg-primary-ink disabled:opacity-70"
              >
                {pending && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden />
                )}
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
      <FeedbackThread taskId={task.id} />
    </article>
  );
}

/** Top-of-dashboard section: videos to review, tweaks underway, and approved cuts to download. */
export function ReviewSection({ tasks }: { tasks: Task[] }) {
  return (
    <div className="space-y-4">
      {tasks.map((t) => (
        <ReviewCard key={t.id} task={t} />
      ))}
    </div>
  );
}
