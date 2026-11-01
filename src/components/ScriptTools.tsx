"use client";

import { useEffect, useState } from "react";

const pill =
  "pressable inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line bg-card px-3.5 text-[0.78rem] font-bold text-foreground hover:border-foreground/30";

/** The script itself: readable in place, scrolls when it's long. */
export function ScriptText({ text, tall = false }: { text: string; tall?: boolean }) {
  return (
    <div
      tabIndex={0}
      aria-label="Script"
      className={`overflow-y-auto overscroll-contain whitespace-pre-wrap break-words rounded-2xl bg-surface px-4 py-3.5 text-[0.9rem] leading-relaxed text-foreground focus-visible:outline-2 ${
        tall ? "max-h-[32rem]" : "max-h-72"
      }`}
    >
      {text}
    </div>
  );
}

/** Copy · Download (.txt) · Open in Google Docs — whichever apply to this script. */
export function ScriptTools({ taskId, text, link }: { taskId: string; text: string; link: string | null }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Clipboard blocked (e.g. insecure context) — the Download button still works.
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {text && (
        <button type="button" onClick={copy} className={pill} aria-live="polite">
          {copied ? (
            <>
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 animate-pop text-success" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
                <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
                <rect x="5.5" y="5.5" width="8" height="8.5" rx="2" />
                <path d="M10.5 3.5V3a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3v6A1.5 1.5 0 0 0 4 10.5h.5" strokeLinecap="round" />
              </svg>
              Copy script
            </>
          )}
        </button>
      )}
      {text && (
        // Plain <a>: a file download, never prefetched.
        <a href={`/api/tasks/${taskId}/script`} className={pill}>
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M8 2.5v7.5M5 7l3 3 3-3M3 13.5h10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Download .txt
        </a>
      )}
      {link && (
        <a href={link} target="_blank" rel="noopener noreferrer" className={pill}>
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
            <path d="M4 1.75h5.25L12.5 5v9.25H4Z" strokeLinejoin="round" />
            <path d="M9 1.75V5.25h3.5M6 8.5h4.5M6 11h4.5" strokeLinecap="round" />
          </svg>
          {/docs\.google\.com/i.test(link) ? "Open in Google Docs" : "Open script link"} ↗
        </a>
      )}
    </div>
  );
}
