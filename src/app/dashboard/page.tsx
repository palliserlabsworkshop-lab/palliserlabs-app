import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { TaskBoard } from "@/components/TaskBoard";
import { FileList } from "@/components/FileList";
import { Comments } from "@/components/Comments";
import { getClient, getComments, getFiles, getTasks, type PortalComment } from "@/lib/notion";
import { getSessionClientId } from "@/lib/session";
import { logout } from "../actions";

export const metadata: Metadata = { title: "Dashboard — Palliser Labs" };

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: string }) {
  return (
    <section className="mt-12 sm:mt-16">
      <div className="mb-4 flex items-baseline justify-between gap-4 sm:mb-5">
        <h2 className="font-display text-[1.15rem] font-medium tracking-tight sm:text-xl">{title}</h2>
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

  const doneCount = tasks.filter((t) => t.done).length;

  return (
    <>
      <section>
        <p className="text-[0.85rem] text-muted">Welcome back,</p>
        <h1 className="mt-1 break-words font-display text-[2.1rem] font-medium leading-[1.1] tracking-tight sm:text-[2.75rem]">
          {client.name || "there"}
        </h1>
        {client.company && (
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-[0.8rem] font-bold text-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            {client.company}
          </p>
        )}
      </section>

      <Section title="Tasks" aside={tasks.length ? `${doneCount} of ${tasks.length} complete` : undefined}>
        {tasks.length > 0 && (
          <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-surface" aria-hidden>
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.round((doneCount / tasks.length) * 100)}%` }}
            />
          </div>
        )}
        <TaskBoard tasks={tasks} />
      </Section>

      <Section title="Files" aside={files.length ? `${files.length} shared` : undefined}>
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
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-line/70 bg-white/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5 sm:px-8">
          <Logo />
          <form action={logout}>
            <button
              type="submit"
              className="rounded-full px-3 py-2 text-[0.8rem] font-bold text-muted transition hover:bg-surface hover:text-foreground"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-[max(4rem,env(safe-area-inset-bottom))] pt-10 sm:px-8 sm:pt-14">
        <Suspense fallback={<DashboardSkeleton />}>
          <Dashboard />
        </Suspense>
      </main>

      <footer className="mx-auto w-full max-w-3xl px-5 pb-8 text-[0.7rem] text-muted sm:px-8">
        © Palliser Labs
      </footer>
    </div>
  );
}
