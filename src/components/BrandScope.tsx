"use client";

import { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
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

/**
 * Apple-style segmented control: one rounded track with a white thumb that slides to the
 * selected brand. Scrolls sideways when there are more brands than fit.
 */
export function BrandPills() {
  const { active, setActive, brands } = useContext(ScopeContext);
  const options = [{ id: null as string | null, name: "All" }, ...brands];
  const trackRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);
  const index = Math.max(0, options.findIndex((o) => o.id === active));

  // Measure the selected segment so the thumb can slide to it (segments have different widths).
  useLayoutEffect(() => {
    const measure = () => {
      const el = buttonRefs.current[index];
      if (el) setThumb({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    buttonRefs.current[index]?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [index, brands.length]);

  return (
    <nav aria-label="Brands" className="-mx-5 mt-5 overflow-x-auto px-5 [scrollbar-width:none] sm:-mx-8 sm:px-8">
      <div ref={trackRef} role="tablist" className="relative inline-flex rounded-full bg-surface p-1 ring-1 ring-inset ring-line/60">
        {thumb && (
          <span
            aria-hidden
            className="absolute inset-y-1 left-0 rounded-full bg-thumb shadow-[0_1px_2px_rgb(0_0_0/0.08),0_2px_8px_-2px_rgb(0_0_0/0.12)] ring-1 ring-black/[0.04] transition-[transform,width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
            style={{ transform: `translateX(${thumb.x}px)`, width: thumb.w }}
          />
        )}
        {options.map((o, i) => {
          const selected = i === index;
          return (
            <button
              key={o.id ?? "all"}
              ref={(el) => {
                buttonRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(o.id)}
              className={`relative z-10 min-h-9 shrink-0 whitespace-nowrap rounded-full px-4 text-[0.82rem] font-bold transition-colors duration-200 [-webkit-tap-highlight-color:transparent] active:opacity-60 ${
                selected ? "text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              {o.name || "Untitled brand"}
            </button>
          );
        })}
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
  const { inScope, labels } = useScoped();
  // Swaps in place (no remount), so switching brands is immediate rather than replaying entrance animations.
  return (
    <>
      <TaskSummary tasks={allTasks.filter((t) => inScope(t.brandId))} />
      <TaskBoard tasks={boardTasks.filter((t) => inScope(t.brandId))} brandNames={labels} />
    </>
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
