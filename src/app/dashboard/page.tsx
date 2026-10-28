import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { TaskBoard, TaskSummary } from "@/components/TaskBoard";
import { FileList } from "@/components/FileList";
import { Comments } from "@/components/Comments";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ProjectForm } from "@/components/ProjectForm";
import { getClient, getComments, getFiles, getTasks, type PortalComment } from "@/lib/notion";
import { getSessionClientId } from "@/lib/session";

export const metadata: Metadata = { title: "Dashboard — Palliser Labs" };

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: string }) {
  return (
    <section className="mt-12 sm:mt-14">
      <div className="mb-4 flex items-baseline justify-between gap-4 px-1">
        <h2 className="font-display text-[1.3rem] font-medium tracking-tight sm:text-[1.45rem]">{title}</h2>
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
      <section>
        <p className="text-[0.9rem] text-muted">Welcome back,</p>
        <h1 className="mt-1 break-words font-display text-[2.25rem] font-medium leading-[1.08] tracking-[-0.02em] sm:text-[3rem]">
          {client.name || "there"}
        </h1>
        {client.company && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-line bg-card px-3.5 py-1.5 text-[0.8rem] font-bold text-foreground">
            <span className="flex h-3 items-end gap-[2px]" aria-hidden>
              <span className="h-3 w-[3px] rounded-full bg-yellow" />
              <span className="h-1.5 w-[3px] self-start rounded-full bg-orange" />
              <span className="h-3 w-[3px] rounded-full bg-accent" />
              <span className="h-1.5 w-[3px] rounded-full bg-primary" />
            </span>
            {client.company}
          </p>
        )}
      </section>

      <Section title="Tasks">
        <TaskSummary tasks={tasks} />
        <TaskBoard tasks={tasks} />
      </Section>

      <Section title="New project">
        <ProjectForm />
      </Section>

      <Section title="Documents" aside={files.length ? `${files.length} shared` : undefined}>
        <FileList files={files} />
      </Section>

      <Section title="Comments">
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
