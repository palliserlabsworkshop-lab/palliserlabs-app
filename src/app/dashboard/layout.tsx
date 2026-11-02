import Link from "next/link";
import { Logo } from "@/components/Logo";
import { logout } from "../actions";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LegalLinks } from "@/components/Legal";

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-line/70 bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5 sm:px-8">
          <Link href="/dashboard" aria-label="Dashboard">
            <Logo />
          </Link>
          <div className="-mr-2 flex shrink-0 items-center">
            <ThemeToggle />
            <Link
              href="/dashboard/account"
              aria-label="Account"
              title="Account"
              className="pressable flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-card hover:text-foreground"
            >
              <svg viewBox="0 0 20 20" className="h-[19px] w-[19px]" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
                <circle cx="10" cy="7" r="3.25" />
                <path d="M3.75 16.5c.9-2.9 3.3-4.5 6.25-4.5s5.35 1.6 6.25 4.5" strokeLinecap="round" />
              </svg>
            </Link>
            <form action={logout}>
            <button
              type="submit"
              className="pressable min-h-11 whitespace-nowrap rounded-full px-3 text-[0.85rem] font-semibold text-muted hover:bg-card hover:text-foreground"
            >
              Sign out
            </button>
          </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-36 pt-10 sm:px-8 sm:pt-14">
        {children}
      </main>

      <footer className="mx-auto -mt-24 flex w-full max-w-3xl flex-wrap items-center justify-between gap-2 px-5 pb-28 text-[0.7rem] text-muted sm:px-8">
        <span>© Palliser Labs</span>
        <LegalLinks />
      </footer>
    </div>
  );
}
