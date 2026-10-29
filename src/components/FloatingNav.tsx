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
  // While a tap-triggered scroll is running, the section tracker stays quiet so the
  // highlight goes straight to the tapped tab instead of flicking through every section it passes.
  const tapLock = useRef(false);
  const unlockTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function goTo(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    setActive(id);
    tapLock.current = true;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);

    // Unlock once scrolling has settled (or after a safety timeout).
    const release = () => {
      clearTimeout(unlockTimer.current);
      unlockTimer.current = setTimeout(() => {
        tapLock.current = false;
        window.removeEventListener("scroll", release);
      }, 160);
    };
    window.addEventListener("scroll", release, { passive: true });
    release();
    setTimeout(() => {
      tapLock.current = false;
      window.removeEventListener("scroll", release);
    }, 1800);
  }

  useEffect(() => {
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0);
        if (tapLock.current) return;
        // At the very bottom the last section may be short — treat it as active.
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
          return setActive(ids.split(",").at(-1)!);
        }
        const best = [...visible.entries()].sort((a, b) => b[1] - a[1])[0];
        if (best && best[1] > 0) setActive(best[0]);
      },
      { rootMargin: "-80px 0px -45% 0px", threshold: [0, 0.15, 0.4, 0.75] },
    );
    for (const id of ids.split(",")) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [ids]);

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
          className="absolute inset-y-1.5 left-1.5 rounded-full bg-foreground shadow-sm transition-transform duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)]"
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
              className={`pressable relative z-10 flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-full text-[0.68rem] font-bold transition-colors duration-300 ${
                isActive ? "text-white" : "text-muted hover:text-foreground"
              }`}
            >
              <span className="relative">
                <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
                  {item.icon}
                </svg>
                {item.id === "review" && reviewCount > 0 && (
                  <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 animate-pop items-center justify-center rounded-full bg-orange px-1 text-[0.6rem] font-extrabold text-foreground">
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
