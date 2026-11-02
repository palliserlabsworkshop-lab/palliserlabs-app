"use client";

import { useEffect, useState } from "react";

/** Untouched for this long → Away. */
const AWAY_AFTER_MS = 5 * 60_000;
/** Untouched for this long → Offline (even if the dashboard is still open). */
const OFFLINE_AFTER_MS = 30 * 60_000;
/** How often the status is checked. */
const TICK_MS = 60_000;
/** "Last seen" is refreshed at least this often while open (Notion shows Offline after 3 minutes). */
const REFRESH_MS = 90_000;

type State = "online" | "away" | "offline";

function report(state: State, beacon = false) {
  const body = JSON.stringify({ state });
  // When the page is closing, a beacon is the only request the browser reliably lets through.
  if (beacon && navigator.sendBeacon) {
    navigator.sendBeacon("/api/presence", new Blob([body], { type: "application/json" }));
    return;
  }
  fetch("/api/presence", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(
    () => {},
  );
}

/**
 * Activity status: a pulsing green dot while the client is using the dashboard, amber when they've
 * stepped away. It also keeps their status up to date for the team's "Who's online" view in Notion.
 */
export function PresenceDot() {
  const [state, setState] = useState<State>("online");

  useEffect(() => {
    let lastInput = Date.now();
    let lastSent = 0;
    let sent: State | null = null;

    const current = (): State => {
      const idle = Date.now() - lastInput;
      if (idle >= OFFLINE_AFTER_MS) return "offline";
      if (document.hidden || idle >= AWAY_AFTER_MS) return "away";
      return "online";
    };
    const tick = () => {
      const now = current();
      setState(now);
      if (now === "offline") {
        if (sent !== "offline") {
          report("offline");
          sent = "offline";
        }
        return;
      }
      if (now !== sent || Date.now() - lastSent >= REFRESH_MS) {
        report(now);
        sent = now;
        lastSent = Date.now();
      }
    };
    const onActivity = () => {
      const wasActive = current() === "online";
      lastInput = Date.now();
      if (!wasActive) tick(); // coming back from Away/Offline updates straight away
    };
    const onLeave = () => report("offline", true);

    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("pagehide", onLeave);
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => {
      clearInterval(id);
      events.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("pagehide", onLeave);
    };
  }, []);

  const online = state === "online";
  const label = online ? "Online" : "Away";
  return (
    <span className="relative inline-flex h-3 w-3 shrink-0" role="img" aria-label={label} title={label}>
      {online && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-50" />}
      <span
        className={`relative inline-flex h-3 w-3 rounded-full ring-2 ring-background transition-colors duration-500 ${
          online ? "bg-success" : "bg-yellow"
        }`}
      />
    </span>
  );
}
