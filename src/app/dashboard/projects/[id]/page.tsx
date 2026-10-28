import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProject } from "@/lib/notion";
import { getSessionClientId } from "@/lib/session";
import { briefRows, isHttpUrl } from "@/lib/brief";
import { formatDueDate } from "@/lib/format";

export const metadata: Metadata = { title: "Project brief — Palliser Labs" };

async function ProjectBrief({ params }: { params: Promise<{ id: string }> }) {
  const clientId = await getSessionClientId();
  if (!clientId) redirect("/login");

  const { id } = await params;
  // Only finds the task if its Client relation is the signed-in client.
  const project = await getProject(clientId, id);
  if (!project) notFound();

  const statusTone = project.done
    ? "bg-primary/10 text-primary"
    : project.status.toLowerCase() === "queued"
      ? "bg-yellow/25 text-[#8a5a00]"
      : "bg-accent/15 text-[#0b6a9e]";

  return (
    <article>
      <h1 className="break-words font-display text-[1.9rem] font-medium leading-[1.15] tracking-tight sm:text-[2.4rem]">
        {project.title}
      </h1>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-[0.75rem] font-bold ${statusTone}`}>{project.status}</span>
        {project.dueDate && (
          <span className="rounded-full bg-surface px-3 py-1 text-[0.75rem] text-muted">
            Due {formatDueDate(project.dueDate)}
          </span>
        )}
      </div>

      {project.brief ? (
        <dl className="mt-10 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
          {briefRows(project.brief).map((row) => (
            <div key={row.label} className="px-4 py-4 sm:grid sm:grid-cols-[10rem_1fr] sm:gap-6 sm:px-5">
              <dt className="text-[0.75rem] font-bold uppercase tracking-wide text-muted">{row.label}</dt>
              <dd className="mt-1.5 min-w-0 sm:mt-0">
                {row.values.length === 0 ? (
                  <span className="text-[0.9rem] text-muted/70">—</span>
                ) : row.links ? (
                  <ul className="space-y-1.5">
                    {row.values.map((v) => (
                      <li key={v} className="break-all text-[0.9rem]">
                        {isHttpUrl(v) ? (
                          <a href={v} target="_blank" rel="noopener noreferrer" className="font-bold text-primary hover:underline">
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
                      <span key={v} className="rounded-full bg-surface px-3 py-1 text-[0.8rem] font-bold text-foreground">
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
      ) : (
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
        className="mb-8 inline-flex items-center gap-1.5 text-[0.8rem] font-bold text-muted transition hover:text-foreground"
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
