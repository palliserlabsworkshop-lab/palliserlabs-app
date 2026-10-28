import type { Task } from "@/lib/notion";
import { formatDueDate, isOverdue } from "@/lib/format";

function CalendarIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <rect x="2" y="3" width="12" height="11" rx="2.5" />
      <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TaskCard({ task }: { task: Task }) {
  const overdue = !task.done && task.dueDate !== null && isOverdue(task.dueDate);
  const queued = !task.done && task.status.toLowerCase() === "queued";

  return (
    <li className="rounded-2xl border border-line bg-white p-3.5 sm:p-4">
      <div className="flex items-start gap-2">
        {task.done && (
          <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckIcon />
          </span>
        )}
        <p
          className={`min-w-0 break-words text-[0.82rem] font-bold leading-snug sm:text-[0.9rem] ${
            task.done ? "text-muted" : "text-foreground"
          }`}
        >
          {task.title}
        </p>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {task.dueDate ? (
          <span
            className={`inline-flex items-center gap-1 text-[0.7rem] sm:text-[0.75rem] ${
              overdue ? "font-bold text-[#c2541b]" : "text-muted"
            }`}
          >
            <CalendarIcon />
            {overdue ? "Overdue · " : ""}
            {formatDueDate(task.dueDate)}
          </span>
        ) : (
          <span className="text-[0.7rem] text-muted/70 sm:text-[0.75rem]">No due date</span>
        )}
        {queued && (
          <span className="rounded-full bg-yellow/25 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-[#8a5a00]">
            Queued
          </span>
        )}
      </div>
    </li>
  );
}

function Column({ title, dot, tasks, empty }: { title: string; dot: string; tasks: Task[]; empty: string }) {
  return (
    <div className="min-w-0">
      <div className="mb-3 flex items-center gap-2 px-0.5">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} aria-hidden />
        <h3 className="truncate text-[0.8rem] font-bold text-foreground sm:text-[0.85rem]">{title}</h3>
        <span className="ml-auto text-[0.75rem] tabular-nums text-muted">{tasks.length}</span>
      </div>
      {tasks.length ? (
        <ul className="space-y-2.5">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-line px-3 py-6 text-center text-[0.75rem] leading-relaxed text-muted">
          {empty}
        </p>
      )}
    </div>
  );
}

export function TaskBoard({ tasks }: { tasks: Task[] }) {
  // "Queued" tasks sit in the In Progress column (tagged "Queued") so nothing is hidden.
  const active = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done).reverse();

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-6">
      <Column title="In Progress" dot="var(--brand-accent)" tasks={active} empty="Nothing in progress right now." />
      <Column title="Completed" dot="var(--brand-primary)" tasks={done} empty="Completed tasks will appear here." />
    </div>
  );
}
