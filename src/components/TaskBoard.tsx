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

function TaskCard({ task }: { task: Task }) {
  const kind = statusKind(task.status, task.done);
  const overdue = !task.done && task.dueDate !== null && isOverdue(task.dueDate);

  const body = (
    <>
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
      </div>
      {task.hasBrief && (
        <span className="mt-3 inline-flex items-center gap-1 text-[0.72rem] font-bold text-primary-ink">
          View brief
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </>
  );

  const card = "card relative block overflow-hidden py-3.5 pl-4 pr-3.5 sm:py-4 sm:pl-5 sm:pr-4";
  return (
    <li>
      {task.hasBrief ? (
        <Link
          href={`/dashboard/projects/${task.id}`}
          className={`${card} transition hover:border-foreground/15 active:scale-[0.99]`}
        >
          {body}
        </Link>
      ) : (
        <div className={card}>{body}</div>
      )}
    </li>
  );
}

function Column({ title, tasks, empty }: { title: string; tasks: Task[]; empty: string }) {
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
    </div>
  );
}

/** Segmented progress bar: one rounded segment per status, sized by count. */
export function TaskSummary({ tasks }: { tasks: Task[] }) {
  if (!tasks.length) return null;
  const counts = { queued: 0, in_progress: 0, done: 0, other: 0 };
  for (const t of tasks) counts[statusKind(t.status, t.done)]++;
  const segments = (["queued", "in_progress", "done", "other"] as const).filter((k) => counts[k] > 0);
  const legend: { kind: keyof typeof counts; label: string }[] = [
    { kind: "queued", label: "Queued" },
    { kind: "in_progress", label: "In Progress" },
    { kind: "done", label: "Done" },
  ];

  return (
    <div className="card mb-6 p-4 sm:p-5">
      <div
        className="flex h-2.5 gap-1"
        role="img"
        aria-label={`${counts.done} of ${tasks.length} tasks done, ${counts.in_progress} in progress, ${counts.queued} queued`}
      >
        {segments.map((k) => (
          <span
            key={k}
            className={`h-full rounded-full ${STATUS_STYLES[k].rail}`}
            style={{ flexGrow: counts[k], flexBasis: 0, minWidth: "0.625rem" }}
          />
        ))}
      </div>
      <dl className="mt-3.5 grid grid-cols-3 gap-2">
        {legend.map(({ kind, label }) => (
          <div key={kind} className="min-w-0">
            <dt className="flex items-center gap-1.5 truncate text-[0.72rem] text-muted">
              <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_STYLES[kind].rail}`} aria-hidden />
              {label}
            </dt>
            <dd className="mt-0.5 font-display text-[1.35rem] font-medium tabular-nums leading-none">{counts[kind]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function TaskBoard({ tasks }: { tasks: Task[] }) {
  // Queued and In Progress tasks share the left column; each card's chip says which.
  const active = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done).reverse();

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-5">
      <Column title="In Progress" tasks={active} empty="Nothing in progress right now." />
      <Column title="Completed" tasks={done} empty="Completed tasks will appear here." />
    </div>
  );
}
