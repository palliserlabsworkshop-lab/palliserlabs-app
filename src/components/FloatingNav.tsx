"use client";

import { useEffect, useState } from "react";

const ITEMS = [
  {
    id: "tasks",
    label: "Tasks",
    icon: <path d="M4 6.5l2 2 3.5-4M4 14l2 2 3.5-4M12.5 7h4M12.5 14.5h4" strokeLinecap="round" strokeLinejoin="round" />,
  },
  {
    id: "new-project",
    label: "New",
    icon: <path d="M10 4v12M4 10h12" strokeLinecap="round" />,
  },
  {
    id: "documents",
    label: "Files",
    icon: (
      <>
        <path d="M5.5 2.75h6l3.75 3.75v10a.75.75 0 0 1-.75.75h-9a.75.75 0 0 1-.75-.75v-13a.75.75 0 0 1 .75-.75Z" strokeLinejoin="round" />
        <path d="M11.5 2.75v3.75h3.75" strokeLinejoin="round" />
      </>
    ),
  },
  {
    id: "comments",
    label: "Chat",
    icon: (
      <path
        d="M3.5 9.5c0-3.3 2.9-5.75 6.5-5.75s6.5 2.45 6.5 5.75-2.9 5.75-6.5 5.75c-.8 0-1.6-.1-2.3-.35L4 16.25l.9-3.1A5.4 5.4 0 0 1 3.5 9.5Z"
        strokeLinejoin="round"
      />
    ),
  },
];

/** Floating glass bar that jumps between dashboard sections and highlights the one in view. */
export function FloatingNav() {
  const [active, setActive] = useState(ITEMS[0].id);

  useEffect(() => {
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0);
        // At the very bottom the last section may be short — treat it as active.
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
          return setActive(ITEMS[ITEMS.length - 1].id);
        }
        const best = [...visible.entries()].sort((a, b) => b[1] - a[1])[0];
        if (best && best[1] > 0) setActive(best[0]);
      },
      { rootMargin: "-80px 0px -45% 0px", threshold: [0, 0.15, 0.4, 0.75] },
    );
    for (const item of ITEMS) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  const index = ITEMS.findIndex((i) => i.id === active);

  return (
    <nav
      aria-label="Dashboard sections"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div className="glass pointer-events-auto relative grid w-full max-w-[22rem] animate-float-in grid-cols-4 rounded-full p-1.5">
        {/* Sliding highlight behind the active item */}
        <span
          aria-hidden
          className="absolute inset-y-1.5 left-1.5 rounded-full bg-foreground shadow-sm transition-transform duration-500 ease-[var(--ease-spring)]"
          style={{ width: "calc((100% - 0.75rem) / 4)", transform: `translateX(${index * 100}%)` }}
        />
        {ITEMS.map((item) => {
          const isActive = item.id === active;
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              aria-current={isActive ? "true" : undefined}
              onClick={() => setActive(item.id)}
              className={`pressable relative z-10 flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-full text-[0.68rem] font-bold transition-colors duration-300 ${
                isActive ? "text-white" : "text-muted hover:text-foreground"
              }`}
            >
              <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
                {item.icon}
              </svg>
              {item.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
