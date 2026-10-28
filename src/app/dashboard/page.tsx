import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { TaskBoard, TaskSummary } from "@/components/TaskBoard";
import { FileList } from "@/components/FileList";
import { Comments } from "@/components/Comments";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ProjectForm } from "@/components/ProjectForm";
import { FloatingNav } from "@/components/FloatingNav";
import { ReviewSection } from "@/components/ReviewSection";
import { reviewStage } from "@/lib/review";
import { getClient, getComments, getFiles, getTasks, type PortalComment } from "@/lib/notion";
import { getSessionClientId } from "@/lib/session";

export const metadata: Metadata = { title: "Dashboard — Palliser Labs" };

function Section({
  id,
  title,
  children,
  aside,
  delay = 0,
  subtitle,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  aside?: string;
  delay?: number;
  subtitle?: string;
}) {
  return (
    <section id={id} className="mt-14 animate-rise sm:mt-16" style={{ animationDelay: `${delay}ms` }}>
      <div className="mb-4 flex items-baseline justify-between gap-4 px-1">
        <h2 className="font-display text-[1.4rem] font-medium tracking-[-0.01em] sm:text-[1.6rem]">{title}</h2>
        {aside && <span className="text-[0.75rem] text-muted">{aside}</span>}
      </div>
      {subtitle && <p className="-mt-2 mb-4 px-1 text-[0.85rem] text-muted">{subtitle}</p>}
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


  // Videos waiting on the client (or being tweaked / ready to download) get their own section up top;
  // the board shows everything else, so nothing appears twice.
  const reviewTasks = tasks.filter((t) => reviewStage(t));
  const boardTasks = tasks.filter((t) => !reviewStage(t));
  const toReview = reviewTasks.filter((t) => reviewStage(t) === "review").length;

  return (
    <>
      <AutoRefresh />
      <FloatingNav showReview reviewCount={toReview} />
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

      <Section
        id="review"
        title={toReview ? "Ready for your review" : "Your videos"}
        delay={60}
        subtitle={
          toReview
            ? "Watch it, then approve or tell us what to change."
            : reviewTasks.length
              ? "Tweaks underway and finished cuts ready to download."
              : undefined
        }
      >
        {reviewTasks.length ? (
          <ReviewSection tasks={reviewTasks} />
        ) : (
          <div className="card flex items-center gap-4 p-5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface text-muted" aria-hidden>
              <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7">
                <rect x="2.75" y="4.25" width="14.5" height="11.5" rx="2.5" />
                <path d="M8.5 7.75v4.5l3.75-2.25-3.75-2.25Z" strokeLinejoin="round" />
              </svg>
            </span>
            <p className="text-[0.85rem] leading-relaxed text-muted">
              <strong className="text-foreground">Nothing to review right now.</strong> When an edit is ready, it’ll
              appear here for you to watch, approve or request changes.
            </p>
          </div>
        )}
      </Section>

      <Section id="tasks" title="Tasks" delay={80}>
        <TaskSummary tasks={tasks} />
        <TaskBoard tasks={boardTasks} />
      </Section>

      <Section id="new-project" title="New project" delay={160}>
        <ProjectForm />
      </Section>

      <Section id="documents" title="Documents" delay={240} aside={files.length ? `${files.length} shared` : undefined}>
        <FileList files={files} />
      </Section>

      <Section id="messages" title="Messages" delay={320} subtitle="Your direct line to the Palliser Labs team.">
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
