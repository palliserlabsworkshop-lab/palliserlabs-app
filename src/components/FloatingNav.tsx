"use client";

import { useEffect, useRef, useState } from "react";

const REVIEW_ITEM = {
  id: "review",
  label: "Review",
  icon: (
    <>
      <rect x="2.75" y="4.25" width="14.5" height="11.5" rx="2.5" />
      <path d="M8.5 7.75v4.5l3.75-2.25-3.75-2.25Z" strokeLinejoin="round" />
    </>
  ),
};

const BASE_ITEMS = [
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
    id: "messages",
    label: "Messages",
    icon: (
      <path
        d="M3.5 9.5c0-3.3 2.9-5.75 6.5-5.75s6.5 2.45 6.5 5.75-2.9 5.75-6.5 5.75c-.8 0-1.6-.1-2.3-.35L4 16.25l.9-3.1A5.4 5.4 0 0 1 3.5 9.5Z"
        strokeLinejoin="round"
      />
    ),
  },
];

/** Floating glass bar that jumps between dashboard sections and highlights the one in view. */
export function FloatingNav({ showReview = false, reviewCount = 0 }: { showReview?: boolean; reviewCount?: number }) {
  const ITEMS = showReview ? [REVIEW_ITEM, ...BASE_ITEMS] : BASE_ITEMS;
  const ids = ITEMS.map((i) => i.id).join(",");
  const [active, setActive] = useState(ITEMS[0].id);
  // While a tap-triggered scroll runs, position tracking pauses so the highlight
  // stays on the tapped tab instead of passing through every section on the way.
  const scrollingTo = useRef<string | null>(null);

  // The active tab is the last section whose top has crossed a line ~35% down the screen.
  // Purely position-based, so it changes once per boundary and never flickers.
  useEffect(() => {
    const sectionIds = ids.split(",");
    let frame = 0;
    const update = () => {
      frame = 0;
      if (scrollingTo.current) return;
      const line = window.innerHeight * 0.35;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      let current = sectionIds[0];
      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      if (atBottom) current = sectionIds[sectionIds.length - 1];
      setActive((prev) => (prev === current ? prev : current));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [ids]);

  function goTo(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    setActive(id);
    scrollingTo.current = id;

    const headerOffset = 88; // sticky header + breathing room
    const maxY = document.documentElement.scrollHeight - window.innerHeight;
    const target = Math.max(0, Math.min(maxY, el.getBoundingClientRect().top + window.scrollY - headerOffset));
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: target, behavior: reduceMotion ? "auto" : "smooth" });
    history.replaceState(null, "", `#${id}`);

    // Release once the page has arrived (or stopped moving for a few frames), with a safety cap.
    let frames = 0; // safety cap: ~2.5s at 60fps
    let lastY = window.scrollY;
    let still = 0;
    const watch = () => {
      const y = window.scrollY;
      still = Math.abs(y - lastY) < 0.5 ? still + 1 : 0;
      lastY = y;
      const arrived = Math.abs(y - target) < 2;
      if ((arrived && still >= 2) || still >= 12 || ++frames > 150) {
        scrollingTo.current = null;
        return;
      }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  }

  const index = Math.max(0, ITEMS.findIndex((i) => i.id === active));
  const n = ITEMS.length;

  return (
    <nav
      aria-label="Dashboard sections"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div className={`glass pointer-events-auto relative grid w-full animate-float-in rounded-full p-1.5 ${n > 4 ? "max-w-[26rem]" : "max-w-[22rem]"}`}
        style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {/* Sliding highlight behind the active item */}
        <span
          aria-hidden
          className="absolute inset-y-1.5 left-1.5 rounded-full bg-foreground shadow-sm transition-transform duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform"
          style={{ width: `calc((100% - 0.75rem) / ${n})`, transform: `translateX(${index * 100}%)` }}
        />
        {ITEMS.map((item) => {
          const isActive = item.id === active;
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              aria-current={isActive ? "true" : undefined}
              onClick={(e) => goTo(e, item.id)}
              className={`relative z-10 flex min-h-12 select-none flex-col items-center justify-center gap-0.5 rounded-full text-[0.68rem] font-bold transition-[color,opacity] duration-300 [-webkit-tap-highlight-color:transparent] active:opacity-60 ${
                isActive ? "text-on-ink" : "text-muted hover:text-foreground"
              }`}
            >
              <span className="relative">
                <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
                  {item.icon}
                </svg>
                {item.id === "review" && reviewCount > 0 && (
                  <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 animate-pop items-center justify-center rounded-full bg-orange px-1 text-[0.6rem] font-extrabold text-[#111]">
                    {reviewCount}
                  </span>
                )}
              </span>
              {item.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
