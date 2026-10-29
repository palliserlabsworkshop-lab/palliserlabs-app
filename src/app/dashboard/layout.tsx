import Link from "next/link";
import { Logo } from "@/components/Logo";
import { logout } from "../actions";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-line/70 bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5 sm:px-8">
          <Link href="/dashboard" aria-label="Dashboard">
            <Logo />
          </Link>
          <div className="-mr-2 flex items-center gap-1">
            <ThemeToggle />
            <form action={logout}>
            <button
              type="submit"
              className="pressable min-h-11 rounded-full px-4 text-[0.85rem] font-bold text-muted hover:bg-card hover:text-foreground"
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

      <footer className="mx-auto -mt-24 w-full max-w-3xl px-5 pb-28 text-[0.7rem] text-muted sm:px-8">© Palliser Labs</footer>
    </div>
  );
}
