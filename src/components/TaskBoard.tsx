import Link from "next/link";
import type { Task } from "@/lib/notion";
import { formatDueDate, isOverdue } from "@/lib/format";
import { statusKind } from "@/lib/status";
import { STATUS_STYLES, StatusChip } from "./StatusChip";

function CalendarIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <rect x="2" y="3" width="12" height="11" rx="2.5" />
      <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" strokeLinecap="round" />
    </svg>
  );
}

const linkPill =
  "pressable inline-flex min-h-8 items-center gap-1 rounded-full bg-surface px-3 text-[0.7rem] font-bold text-foreground hover:bg-foreground hover:text-white";

function TaskCard({ task }: { task: Task }) {
  const kind = statusKind(task.status, task.done);
  const overdue = !task.done && task.dueDate !== null && isOverdue(task.dueDate);
  const showDownload = task.done && Boolean(task.finalVideo);

  return (
    <li className="card relative overflow-hidden py-3.5 pl-4 pr-3.5 sm:py-4 sm:pl-5 sm:pr-4">
      {/* Status bar — echoes the rounded bars of the Palliser Labs mark */}
      <span className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${STATUS_STYLES[kind].rail}`} aria-hidden />
      <p
        className={`min-w-0 break-words text-[0.85rem] font-bold leading-snug sm:text-[0.92rem] ${
          task.done ? "text-muted" : "text-foreground"
        }`}
      >
        {task.title}
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {!task.done && <StatusChip status={task.status} />}
        {task.dueDate ? (
          <span
            className={`inline-flex items-center gap-1 text-[0.72rem] ${overdue ? "font-bold text-orange-ink" : "text-muted"}`}
          >
            <CalendarIcon />
            {overdue ? "Overdue · " : ""}
            {formatDueDate(task.dueDate)}
          </span>
        ) : (
          !task.done && <span className="text-[0.72rem] text-muted">No due date</span>
        )}
        {task.downloadedOn && (
          <span className="text-[0.72rem] font-bold text-success">✓ Downloaded {formatDueDate(task.downloadedOn)}</span>
        )}
      </div>
      {(task.hasBrief || showDownload) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {showDownload && (
            // Plain <a>: the route records the download, so it must never be prefetched.
            <a href={`/api/videos/${task.id}/download`} target="_blank" rel="noopener noreferrer" className={linkPill}>
              Download
            </a>
          )}
          {task.hasBrief && (
            <Link href={`/dashboard/projects/${task.id}`} prefetch={false} className={linkPill}>
              View brief
              <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          )}
        </div>
      )}
    </li>
  );
}

function Column({ title, tasks, empty, children }: { title: string; tasks: Task[]; empty: string; children?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-3 flex items-baseline gap-2 px-1">
        <h3 className="truncate text-[0.8rem] font-bold uppercase tracking-[0.06em] text-muted">{title}</h3>
        <span className="ml-auto text-[0.8rem] font-bold tabular-nums text-foreground">{tasks.length}</span>
      </div>
      {tasks.length ? (
        <ul className="space-y-2.5">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </ul>
      ) : (
        <p className="rounded-[1.25rem] border border-dashed border-line px-3 py-7 text-center text-[0.75rem] leading-relaxed text-muted">
          {empty}
        </p>
      )}
      {children}
    </div>
  );
}

/** Segmented progress bar: one rounded segment per status, sized by count. */
export function TaskSummary({ tasks }: { tasks: Task[] }) {
  const visible = tasks.filter((t) => !t.archived);
  if (!visible.length) return null;
  const counts = { queued: 0, in_progress: 0, review: 0, done: 0 };
  for (const t of visible) {
    const k = statusKind(t.status, t.done);
    if (k === "queued") counts.queued++;
    else if (k === "review") counts.review++;
    else if (k === "done") counts.done++;
    else counts.in_progress++; // in progress, tweaks, anything custom
  }
  const legend = [
    { kind: "queued", label: "Queued" },
    { kind: "in_progress", label: "In Progress" },
    { kind: "review", label: "To review" },
    { kind: "done", label: "Done" },
  ] as const;

  return (
    <div className="card mb-6 p-4 sm:p-5">
      <div
        className="flex h-2.5 gap-1"
        role="img"
        aria-label={`${counts.done} of ${visible.length} done, ${counts.review} to review, ${counts.in_progress} in progress, ${counts.queued} queued`}
      >
        {legend
          .filter(({ kind }) => counts[kind] > 0)
          .map(({ kind }, i) => (
            <span
              key={kind}
              className={`h-full origin-left animate-grow rounded-full ${STATUS_STYLES[kind].rail}`}
              style={{ flexGrow: counts[kind], flexBasis: 0, minWidth: "0.625rem", animationDelay: `${200 + i * 120}ms` }}
            />
          ))}
      </div>
      <dl className="mt-3.5 grid grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-4">
        {legend.map(({ kind, label }) => (
          <div key={kind} className="min-w-0">
            <dt className="flex items-center gap-1.5 truncate text-[0.7rem] text-muted">
              <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_STYLES[kind].rail}`} aria-hidden />
              {label}
            </dt>
            <dd className="mt-1 font-display text-[1.6rem] font-medium tabular-nums leading-none tracking-[-0.02em]">{counts[kind]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Board for everything not in the Review section: Queued / In progress on the left,
 * finished work on the right, and older finished work tucked into a collapsed Archive.
 */
export function TaskBoard({ tasks }: { tasks: Task[] }) {
  const active = tasks.filter((t) => !t.done && !t.archived);
  const done = tasks.filter((t) => t.done && !t.archived).reverse();
  const archived = tasks.filter((t) => t.archived).reverse();

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-5">
      <Column title="In Progress" tasks={active} empty="Nothing in progress right now." />
      <Column title="Completed" tasks={done} empty="Finished work will appear here.">
        {archived.length > 0 && (
          <details className="group mt-3">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 px-1 text-[0.75rem] font-bold text-muted hover:text-foreground">
              <svg
                viewBox="0 0 16 16"
                className="h-3 w-3 transition-transform duration-300 group-open:rotate-90"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Archive ({archived.length})
            </summary>
            <ul className="mt-1 space-y-2.5 opacity-80">
              {archived.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </ul>
          </details>
        )}
      </Column>
    </div>
  );
}
