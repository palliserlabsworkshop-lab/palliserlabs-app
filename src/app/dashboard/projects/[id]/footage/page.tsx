import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProject } from "@/lib/notion";
import { awaitingFootage } from "@/lib/review";
import { getViewer } from "@/lib/viewer";
import { ProjectForm } from "@/components/ProjectForm";
import { ProjectSteps } from "@/components/ProjectSteps";

export const metadata: Metadata = { title: "Send your footage — Palliser Labs" };

async function Footage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const { id } = await params;
  // Only found if the project belongs to one of the signed-in person's brands.
  const project = await getProject(viewer.brandIds, id);
  if (!project) notFound();
  // Footage already sent (or the script isn't approved yet) — the project page has the rest.
  if (!awaitingFootage(project)) redirect(`/dashboard/projects/${project.id}`);

  return (
    <>
      <p className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-muted">Next step</p>
      <h1 className="mt-1 break-words font-display text-[1.9rem] font-medium leading-[1.15] tracking-tight sm:text-[2.4rem]">
        {project.title}
      </h1>
      <div className="mt-5">
        <ProjectSteps task={project} size="md" />
      </div>
      <p className="mb-6 mt-6 text-[0.9rem] leading-relaxed text-muted">
        Your script is approved and attached. Share your footage and how you’d like it edited.
      </p>
      <ProjectForm attachTo={{ id: project.id, title: project.title }} />
    </>
  );
}

export default function FootagePage({ params }: PageProps<"/dashboard/projects/[id]/footage">) {
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
            <div className="mt-10 h-96 animate-pulse rounded-2xl bg-surface" />
          </div>
        }
      >
        <Footage params={params} />
      </Suspense>
    </>
  );
}
