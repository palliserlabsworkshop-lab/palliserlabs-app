import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { TaskBoard, TaskSummary } from "@/components/TaskBoard";
import { FileList } from "@/components/FileList";
import { Comments } from "@/components/Comments";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ProjectForm } from "@/components/ProjectForm";
import { FloatingNav } from "@/components/FloatingNav";
import { getClient, getComments, getFiles, getTasks, type PortalComment } from "@/lib/notion";
import { getSessionClientId } from "@/lib/session";

export const metadata: Metadata = { title: "Dashboard — Palliser Labs" };

function Section({
  id,
  title,
  children,
  aside,
  delay = 0,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  aside?: string;
  delay?: number;
}) {
  return (
    <section id={id} className="mt-14 animate-rise sm:mt-16" style={{ animationDelay: `${delay}ms` }}>
      <div className="mb-4 flex items-baseline justify-between gap-4 px-1">
        <h2 className="font-display text-[1.4rem] font-medium tracking-[-0.01em] sm:text-[1.6rem]">{title}</h2>
        {aside && <span className="text-[0.75rem] text-muted">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

async function Dashboard() {
  const clientId = await getSessionClientId();
  if (!clientId) redirect("/login");

  const client = await getClient(clientId);
  if (!client) redirect("/login");

  // Every query below is scoped server-side to the signed-in client's Notion page ID.
  const [tasks, files, comments] = await Promise.all([
    getTasks(client.id),
    getFiles(client.id),
    getComments(client.id).catch((error): PortalComment[] | null => {
      console.error("Failed to load comments:", error);
      return null;
    }),
  ]);


  return (
    <>
      <AutoRefresh />
      <FloatingNav />
      <section className="animate-rise">
        <p className="text-[0.95rem] text-muted">Welcome back,</p>
        <h1 className="mt-1 break-words font-display text-[2.5rem] font-medium leading-[1.04] tracking-[-0.03em] sm:text-[3.4rem]">
          {client.name || "there"}
        </h1>
        {client.company && (
          <p className="mt-4 inline-flex items-center rounded-full border border-line bg-card px-3.5 py-1.5 text-[0.8rem] font-bold text-foreground">
            {client.company}
          </p>
        )}
      </section>

      <Section id="tasks" title="Tasks" delay={80}>
        <TaskSummary tasks={tasks} />
        <TaskBoard tasks={tasks} />
      </Section>

      <Section id="new-project" title="New project" delay={160}>
        <ProjectForm />
      </Section>

      <Section id="documents" title="Documents" delay={240} aside={files.length ? `${files.length} shared` : undefined}>
        <FileList files={files} />
      </Section>

      <Section id="comments" title="Comments" delay={320}>
        <Comments initial={comments ?? []} initialError={comments === null} />
      </Section>
    </>
  );
}

function DashboardSkeleton() {
  const bar = "animate-pulse rounded-xl bg-surface";
  return (
    <div aria-busy="true" aria-label="Loading your dashboard">
      <div className={`${bar} h-4 w-28`} />
      <div className={`${bar} mt-3 h-10 w-48`} />
      <div className={`${bar} mt-4 h-7 w-32 rounded-full`} />
      <div className={`${bar} mt-16 h-5 w-20`} />
      <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-6">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-2.5">
            <div className={`${bar} h-20`} />
            <div className={`${bar} h-20`} />
          </div>
        ))}
      </div>
      <div className={`${bar} mt-16 h-5 w-16`} />
      <div className={`${bar} mt-5 h-36`} />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}
