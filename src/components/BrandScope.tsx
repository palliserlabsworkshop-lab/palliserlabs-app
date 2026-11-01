"use client";

import { createContext, useContext, useState } from "react";
import type { ClientFile, Task } from "@/lib/notion";
import { TaskBoard, TaskSummary } from "./TaskBoard";
import { FileList } from "./FileList";
import { ProjectForm } from "./ProjectForm";

/**
 * Brand filtering for people with several brands. The server sends every brand's tasks and
 * files once (already limited to the viewer's own brands); tapping a pill just filters them
 * here, so switching is instant — no round trip to Notion. The choice is mirrored in the URL
 * (?brand=…) so a refresh or shared link keeps it.
 */
type Brand = { id: string; name: string };
type Scope = { active: string | null; setActive: (id: string | null) => void; brands: Brand[] };

const ScopeContext = createContext<Scope>({ active: null, setActive: () => {}, brands: [] });

export function BrandScopeProvider({
  brands,
  initial,
  children,
}: {
  brands: Brand[];
  initial: string | null;
  children: React.ReactNode;
}) {
  const [active, setActiveState] = useState<string | null>(initial);
  const setActive = (id: string | null) => {
    setActiveState(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("brand", id.replace(/-/g, ""));
    else url.searchParams.delete("brand");
    window.history.replaceState(null, "", url);
  };
  return <ScopeContext.Provider value={{ active, setActive, brands }}>{children}</ScopeContext.Provider>;
}

export function BrandPills() {
  const { active, setActive, brands } = useContext(ScopeContext);
  const pill = (selected: boolean) =>
    `pressable inline-flex min-h-10 shrink-0 items-center rounded-full border px-4 text-[0.8rem] font-bold transition-colors duration-200 ${
      selected ? "border-foreground bg-foreground text-on-ink" : "border-line bg-card text-foreground hover:border-foreground/30"
    }`;
  return (
    <nav aria-label="Brands" className="-mx-5 mt-5 overflow-x-auto px-5 [scrollbar-width:none] sm:-mx-8 sm:px-8">
      <div className="flex w-max gap-2 pb-1" role="tablist">
        <button type="button" role="tab" aria-selected={!active} onClick={() => setActive(null)} className={pill(!active)}>
          All
        </button>
        {brands.map((b) => (
          <button
            key={b.id}
            type="button"
            role="tab"
            aria-selected={active === b.id}
            onClick={() => setActive(b.id)}
            className={pill(active === b.id)}
          >
            {b.name || "Untitled brand"}
          </button>
        ))}
      </div>
    </nav>
  );
}

function useScoped() {
  const { active, brands } = useContext(ScopeContext);
  const names = Object.fromEntries(brands.map((b) => [b.id, b.name]));
  const inScope = (brandId: string | null) => !active || brandId === active;
  // Brand labels on cards only make sense in the "All" view.
  return { active, inScope, labels: brands.length > 1 && !active ? names : undefined };
}

/** Tasks summary + board for the selected brand. `boardTasks` excludes videos shown in Review. */
export function ScopedTasks({ allTasks, boardTasks }: { allTasks: Task[]; boardTasks: Task[] }) {
  const { active, inScope, labels } = useScoped();
  return (
    <div key={active ?? "all"} className="animate-rise">
      <TaskSummary tasks={allTasks.filter((t) => inScope(t.brandId))} />
      <TaskBoard tasks={boardTasks.filter((t) => inScope(t.brandId))} brandNames={labels} />
    </div>
  );
}

export function ScopedFiles({ files }: { files: ClientFile[] }) {
  const { inScope, labels } = useScoped();
  return <FileList files={files.filter((f) => inScope(f.brandId))} brandNames={labels} />;
}

/** New project form, pre-selecting the brand currently being viewed. */
export function ScopedProjectForm() {
  const { active, brands } = useContext(ScopeContext);
  return (
    <ProjectForm
      brands={brands.length > 1 ? brands : []}
      defaultBrandId={active ?? (brands.length === 1 ? brands[0].id : null)}
    />
  );
}
