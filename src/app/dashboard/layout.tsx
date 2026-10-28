import Link from "next/link";
import { Logo } from "@/components/Logo";
import { logout } from "../actions";

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-line/70 bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5 sm:px-8">
          <Link href="/dashboard" aria-label="Dashboard">
            <Logo />
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="-mr-2 min-h-11 rounded-full px-4 text-[0.85rem] font-bold text-muted transition hover:bg-card hover:text-foreground"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-[max(4rem,env(safe-area-inset-bottom))] pt-10 sm:px-8 sm:pt-14">
        {children}
      </main>

      <footer className="mx-auto w-full max-w-3xl px-5 pb-8 text-[0.7rem] text-muted sm:px-8">© Palliser Labs</footer>
    </div>
  );
}
