import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProject } from "@/lib/notion";
import { getViewer } from "@/lib/viewer";
import { briefRows, isHttpUrl } from "@/lib/brief";
import { formatDueDate } from "@/lib/format";
import { StatusChip } from "@/components/StatusChip";
import { ProjectSteps } from "@/components/ProjectSteps";
import { ScriptText, ScriptTools } from "@/components/ScriptTools";
import { awaitingFootage } from "@/lib/review";
import { scriptKind } from "@/lib/script";
import { taskDisplay } from "@/lib/stage";

export const metadata: Metadata = { title: "Project — Palliser Labs" };

const SCRIPT_NOTE: Record<string, string> = {
  queued: "We’re writing your hooks and CTA now. You’ll review the script on your dashboard.",
  changes: "We’re making your changes. The updated script will appear on your dashboard.",
  review: "Your script is ready — approve it or ask for changes on your dashboard.",
};

async function ProjectBrief({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const { id } = await params;
  // Only finds the task if its Client relation is the signed-in client.
  const project = await getProject(viewer.brandIds, id);
  if (!project) notFound();
  const script = scriptKind(project.scriptStatus);
  const display = taskDisplay(project);
  // The client sees the finished script once it's ready; before that, a note on where it's at.
  const showScript = script === "review" || script === "approved";

  return (
    <article>
      <h1 className="break-words font-display text-[1.9rem] font-medium leading-[1.15] tracking-tight sm:text-[2.4rem]">
        {project.title}
      </h1>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <StatusChip status={project.status} done={project.done} size="md" kind={display.kind} label={display.label} />
        {project.dueDate && (
          <span className="rounded-full border border-line bg-card px-3 py-1 text-[0.75rem] text-muted">
            Due {formatDueDate(project.dueDate)}
          </span>
        )}
      </div>

      {!project.done && (
        <div className="mt-6">
          <ProjectSteps task={project} size="md" />
        </div>
      )}

      {script && (
        <section className="mt-10" aria-labelledby="script-heading">
          <h2 id="script-heading" className="mb-3 px-1 font-display text-[1.25rem] font-medium tracking-[-0.01em]">
            Script
          </h2>
          <div className="card space-y-3 p-4 sm:p-5">
            {showScript ? (
              <>
                {project.script ? (
                  <ScriptText text={project.script} tall />
                ) : (
                  <p className="text-[0.85rem] text-muted">Your script is in the linked document.</p>
                )}
                <ScriptTools taskId={project.id} text={project.script} link={project.scriptLink} />
              </>
            ) : (
              <p className="text-[0.85rem] leading-relaxed text-muted">{SCRIPT_NOTE[script]}</p>
            )}
            {awaitingFootage(project) && (
              <Link
                href={`/dashboard/projects/${project.id}/footage`}
                prefetch={false}
                className="pressable flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[0.9rem] font-semibold text-on-ink hover:bg-primary-ink"
              >
                Next: send your footage →
              </Link>
            )}
          </div>
        </section>
      )}

      {project.brief ? (
        <>
        {script && (
          <h2 className="mb-3 mt-10 px-1 font-display text-[1.25rem] font-medium tracking-[-0.01em]">Video brief</h2>
        )}
        <dl className={`card divide-y divide-line overflow-hidden ${script ? "" : "mt-10"}`}>
          {briefRows(project.brief).map((row) => (
            <div key={row.label} className="px-4 py-4 sm:grid sm:grid-cols-[10rem_1fr] sm:gap-6 sm:px-5">
              <dt className="text-[0.75rem] font-semibold uppercase tracking-wide text-muted">{row.label}</dt>
              <dd className="mt-1.5 min-w-0 sm:mt-0">
                {row.values.length === 0 ? (
                  <span className="text-[0.9rem] text-muted/70">—</span>
                ) : row.links ? (
                  <ul className="space-y-1.5">
                    {row.values.map((v) => (
                      <li key={v} className="break-all text-[0.9rem]">
                        {isHttpUrl(v) ? (
                          <a href={v} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-ink hover:underline">
                            {v}
                          </a>
                        ) : (
                          v
                        )}
                      </li>
                    ))}
                  </ul>
                ) : row.values.length > 1 || row.label !== "Notes" ? (
                  <div className="flex flex-wrap gap-1.5">
                    {row.values.map((v) => (
                      <span key={v} className="rounded-full bg-surface px-3 py-1 text-[0.8rem] font-semibold text-foreground">
                        {v}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap break-words text-[0.9rem] leading-relaxed">{row.values[0]}</p>
                )}
              </dd>
            </div>
          ))}
        </dl>
        </>
      ) : script ? null : (
        <p className="mt-10 rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          This task doesn’t have a project brief.
        </p>
      )}
    </article>
  );
}

export default function ProjectPage({ params }: PageProps<"/dashboard/projects/[id]">) {
  return (
    <>
      <Link
        href="/dashboard"
        className="mb-8 inline-flex items-center gap-1.5 text-[0.8rem] font-semibold text-muted transition hover:text-foreground"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to dashboard
      </Link>
      <Suspense
        fallback={
          <div aria-busy="true">
            <div className="h-9 w-64 animate-pulse rounded-xl bg-surface" />
            <div className="mt-10 h-80 animate-pulse rounded-2xl bg-surface" />
          </div>
        }
      >
        <ProjectBrief params={params} />
      </Suspense>
    </>
  );
}
