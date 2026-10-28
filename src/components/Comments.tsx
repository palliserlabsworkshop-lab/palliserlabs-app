"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PortalComment } from "@/lib/notion";
import { formatRelative } from "@/lib/format";

const POLL_MS = 15_000;
const MAX_LENGTH = 2000;

export function Comments({ initial, initialError }: { initial: PortalComment[]; initialError?: boolean }) {
  const router = useRouter();
  const [comments, setComments] = useState(initial);
  const [error, setError] = useState(initialError ? "Comments are unavailable right now." : "");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(initial.length);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/comments", { cache: "no-store" });
      if (res.status === 401) return router.replace("/login");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { comments: PortalComment[] };
      setComments(data.comments);
      setError("");
    } catch {
      // Keep showing the last good list; the next poll will retry.
    }
  }, [router]);

  // Two-way sync: pick up comments added in Notion. Pauses while the tab is hidden.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      clearInterval(timer);
      timer = setInterval(refresh, POLL_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh();
        start();
      } else clearInterval(timer);
    };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  useEffect(() => {
    if (comments.length > lastCount.current && listRef.current) {
      listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    }
    lastCount.current = comments.length;
  }, [comments.length]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.status === 401) return router.replace("/login");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { comments: PortalComment[] };
      setComments(data.comments);
      setDraft("");
    } catch {
      setError("Your comment couldn’t be sent. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white">
      <div ref={listRef} className="max-h-[26rem] space-y-4 overflow-y-auto px-4 py-5 sm:px-5">
        {comments.length === 0 ? (
          <p className="py-6 text-center text-sm leading-relaxed text-muted">
            No messages yet.
            <br />
            Ask a question or leave feedback for the team.
          </p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className={`flex flex-col ${c.fromClient ? "items-end" : "items-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-[0.9rem] leading-relaxed ${
                  c.fromClient
                    ? "rounded-br-md bg-primary text-white"
                    : "rounded-bl-md bg-surface text-foreground"
                }`}
              >
                {c.text}
              </div>
              <span className="mt-1.5 px-1 text-[0.7rem] text-muted" suppressHydrationWarning>
                {c.author} · {formatRelative(c.createdAt)}
              </span>
            </div>
          ))
        )}
      </div>

      <form onSubmit={submit} className="border-t border-line p-3 sm:p-4">
        {error && (
          <p role="alert" className="mb-2 px-1 text-[0.75rem] text-[#c2541b]">
            {error}
          </p>
        )}
        <div className="flex items-end gap-2">
          <label htmlFor="comment" className="sr-only">
            Write a message
          </label>
          <textarea
            id="comment"
            rows={1}
            value={draft}
            maxLength={MAX_LENGTH}
            onChange={(e) => {
              setDraft(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e);
            }}
            placeholder="Write a message…"
            className="min-h-11 flex-1 resize-none rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base leading-snug text-foreground placeholder:text-muted/70 focus:border-primary focus:bg-white focus:outline-none sm:text-[0.9rem]"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            aria-label="Send message"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-foreground text-white transition hover:bg-primary disabled:opacity-30"
          >
            {sending ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
                <path d="M10 16V4M5 9l5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
