import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { LoginForm } from "./LoginForm";
import { ThemeToggle } from "@/components/ThemeToggle";

export const metadata: Metadata = { title: "Sign in — Palliser Labs" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col px-6 pb-10 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col">
        <div className="flex items-center justify-between">
          <Logo />
          <span className="-mr-2">
            <ThemeToggle />
          </span>
        </div>

        <div className="flex flex-1 flex-col justify-center py-12">
          <h1 className="font-display text-[2rem] font-medium leading-tight tracking-tight">
            Client portal
          </h1>
          <p className="mt-2 text-[0.95rem] leading-relaxed text-muted">
            Sign in to see your project progress, files and messages.
          </p>
          <div className="mt-10">
            <LoginForm />
          </div>
        </div>

        <p className="text-center text-[0.75rem] text-muted">
          Trouble signing in? Contact your Palliser Labs project lead.
        </p>
      </div>
    </main>
  );
}
