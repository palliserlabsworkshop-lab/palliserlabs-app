"use client";

import { useState } from "react";
import { Comments } from "./Comments";

export function Tick({ className = "h-[22px] w-[22px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} animate-pop`} fill="none" aria-hidden>
      <circle cx="12" cy="12" r="11" fill="currentColor" fillOpacity="0.18" />
      <path
        d="M7 12.5l3.2 3.2L17 8.8"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="16"
        className="animate-draw [--dash:16]"
      />
    </svg>
  );
}

export function FeedbackThread({ taskId, label = "Feedback on this video" }: { taskId: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-line">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-12 w-full items-center justify-between px-5 text-[0.8rem] font-semibold text-foreground transition-colors hover:bg-surface/60"
      >
        {label}
        <svg
          viewBox="0 0 16 16"
          className={`h-3.5 w-3.5 text-muted transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="animate-rise border-t border-line">
          <Comments
            bare
            loadOnMount
            initial={[]}
            endpoint={`/api/tasks/${taskId}/comments`}
            emptyTitle="No feedback yet."
            emptyHint="Anything you post here goes straight to your editor."
            placeholder="Comment on this video…"
          />
        </div>
      )}
    </div>
  );
}
