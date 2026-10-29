"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveVideoAction, requestTweaksAction } from "@/app/actions";
import type { Task } from "@/lib/notion";
import { driveInfo, reviewStage, TWEAK_AREAS, type ReviewStage as Stage } from "@/lib/review";
import { formatDueDate } from "@/lib/format";
import { Comments } from "./Comments";


/** SF Symbols–style play glyph. Its triangle centroid sits on the circle's centre, so it reads as centred. */
function PlayGlyph({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M9.2 6.6v10.8c0 .7.8 1.1 1.4.7l8.2-5.4a.85.85 0 0 0 0-1.4l-8.2-5.4c-.6-.4-1.4 0-1.4.7Z" />
    </svg>
  );
}

function FolderGlyph({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5Z" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Video tile. Drive's embedded player is blocked by phone browsers, so this is a cover
 * that opens the video in Google Drive. With a thumbnail: the frame fills the tile with a
 * frosted play button. Without one (folders, processing, private): a light, quiet tile.
 */
function Player({ link, taskId }: { link: string; taskId: string }) {
  const info = driveInfo(link);
  const isFolder = info?.kind === "folder";
  const [thumbLoaded, setThumbLoaded] = useState(false);
  const label = isFolder ? "Open folder" : "Watch video";

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label} in Google Drive`}
      className="pressable group relative block aspect-video overflow-hidden rounded-2xl bg-gradient-to-b from-surface to-[var(--brand-tile)] ring-1 ring-inset ring-line"
    >
      {info?.kind === "file" && (
        // eslint-disable-next-line @next/next/no-img-element -- served by our own thumbnail route
        <img
          src={`/api/videos/${taskId}/thumbnail`}
          alt=""
          ref={(img) => {
            if (img?.complete && img.naturalWidth > 0) setThumbLoaded(true);
          }}
          onLoad={() => setThumbLoaded(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-700 ease-[var(--ease-out-soft)] group-hover:scale-[1.02] ${
            thumbLoaded ? "opacity-100" : "invisible opacity-0"
          }`}
        />
      )}

      {thumbLoaded ? (
        <>
          <span className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" aria-hidden />
          <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
            <span className="glass flex h-[60px] w-[60px] items-center justify-center rounded-full transition-transform duration-300 ease-[var(--ease-spring)] group-hover:scale-105">
              <PlayGlyph className="h-7 w-7 text-foreground" />
            </span>
          </span>
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-between px-4 pb-3 text-[0.78rem] font-bold text-white">
            {label}
            <span className="font-normal opacity-85">Google Drive ↗</span>
          </span>
        </>
      ) : (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-3" aria-hidden>
          <span className="flex h-[56px] w-[56px] items-center justify-center rounded-full bg-foreground text-on-ink shadow-[0_8px_20px_-8px_rgb(17_17_17/0.45)] transition-transform duration-300 ease-[var(--ease-spring)] group-hover:scale-105">
            {isFolder ? <FolderGlyph className="h-6 w-6" /> : <PlayGlyph className="h-[26px] w-[26px]" />}
          </span>
          <span className="text-center">
            <span className="block text-[0.9rem] font-bold text-foreground">{label}</span>
            <span className="mt-0.5 block text-[0.72rem] text-muted">Opens in Google Drive</span>
          </span>
        </span>
      )}
    </a>
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

function ReviewCard({ task, brandName }: { task: Task; brandName?: string }) {
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
        {brandName && <span className="mb-1 block text-[0.68rem] font-bold uppercase tracking-[0.08em] text-muted">{brandName}</span>}
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
            className={`pressable mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full text-[0.9rem] font-bold text-on-ink ${
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
      <div className="px-5 pt-4">{task.finalVideo ? <Player link={task.finalVideo} taskId={task.id} /> : null}</div>

      <div className="p-5">
        {flash ? (
          <div
            role="status"
            className={`flex h-12 animate-pop items-center justify-center gap-2 rounded-full text-[0.9rem] font-bold text-on-ink ${
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
                        on ? "border-foreground bg-foreground text-on-ink" : "border-line bg-card hover:border-foreground/30"
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
                className="pressable flex h-12 items-center justify-center gap-2 rounded-full bg-foreground text-[0.88rem] font-bold text-on-ink hover:bg-primary-ink disabled:opacity-70"
              >
                {pending && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-on-ink/30 border-t-on-ink" aria-hidden />
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
export function ReviewSection({ tasks, brandNames }: { tasks: Task[]; brandNames?: Record<string, string> }) {
  return (
    <div className="space-y-4">
      {tasks.map((t) => (
        <ReviewCard key={t.id} task={t} brandName={t.brandId ? brandNames?.[t.brandId] : undefined} />
      ))}
    </div>
  );
}
