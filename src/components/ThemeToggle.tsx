"use client";

import { THEME_STORAGE_KEY as STORAGE_KEY } from "@/lib/theme";

function currentTheme(): "light" | "dark" {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Sun/moon switch. Until it's used, the app follows the device's appearance setting.
 * Icons are swapped purely in CSS (see .theme-icon-* in globals.css), so the server
 * render always matches whatever theme the page ends up in.
 */
export function ThemeToggle() {
  function toggle() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing — the choice just won't be remembered.
    }
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", next === "dark" ? "#0f0f11" : "#f6f6f8");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Switch between light and dark appearance"
      title="Light / dark"
      className="relative flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-card hover:text-foreground active:opacity-60"
    >
      {/* Moon — shown in light appearance (tap for dark) */}
      <svg viewBox="0 0 24 24" className="theme-icon-moon absolute h-[19px] w-[19px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M20.2 14.6A8.5 8.5 0 0 1 9.4 3.8a8.5 8.5 0 1 0 10.8 10.8Z" strokeLinejoin="round" />
      </svg>
      {/* Sun — shown in dark appearance (tap for light) */}
      <svg viewBox="0 0 24 24" className="theme-icon-sun absolute h-[20px] w-[20px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.75v2M12 19.25v2M2.75 12h2M19.25 12h2M5.46 5.46l1.41 1.41M17.13 17.13l1.41 1.41M5.46 18.54l1.41-1.41M17.13 6.87l1.41-1.41" strokeLinecap="round" />
      </svg>
    </button>
  );
}
