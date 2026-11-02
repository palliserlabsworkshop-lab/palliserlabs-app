import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SetupForm } from "@/components/AccountForms";
import { getViewerForSetup } from "@/lib/viewer";

export const metadata: Metadata = { title: "Set up your account — Palliser Labs" };

async function Setup() {
  const viewer = await getViewerForSetup();
  if (!viewer) redirect("/login");
  if (!viewer.needsSetup) redirect("/dashboard");
  return (
    <>
      <h1 className="font-display text-[2rem] font-medium leading-tight tracking-tight">
        Welcome{viewer.name ? `, ${viewer.name.split(" ")[0]}` : ""}
      </h1>
      <p className="mt-2 text-[0.95rem] leading-relaxed text-muted">
        Check your email and choose your own 6-digit PIN. You’ll use these to sign in from now on.
      </p>
      <div className="mt-10">
        <SetupForm email={viewer.email} />
      </div>
    </>
  );
}

export default function WelcomePage() {
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
          <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-surface" aria-busy="true" />}>
            <Setup />
          </Suspense>
        </div>
        <p className="text-center text-[0.75rem] text-muted">Your PIN is stored securely — even we can’t see it.</p>
      </div>
    </main>
  );
}
