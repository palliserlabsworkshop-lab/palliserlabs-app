import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ChangeEmailForm, ChangePinForm, MarketingToggle } from "@/components/AccountForms";
import { requireViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Account — Palliser Labs" };

async function Account() {
  const viewer = await requireViewer();
  return (
    <>
      <h1 className="font-display text-[2rem] font-medium leading-tight tracking-tight sm:text-[2.4rem]">Account</h1>
      <p className="mt-2 text-[0.9rem] text-muted">{viewer.name}</p>

      <section className="mt-10" aria-labelledby="pin-heading">
        <h2 id="pin-heading" className="mb-3 px-1 font-display text-[1.25rem] font-medium">
          PIN
        </h2>
        <div className="card p-5 sm:p-6">
          <ChangePinForm />
        </div>
      </section>

      <section className="mt-10" aria-labelledby="email-heading">
        <h2 id="email-heading" className="mb-3 px-1 font-display text-[1.25rem] font-medium">
          Sign-in email
        </h2>
        <div className="card p-5 sm:p-6">
          <ChangeEmailForm email={viewer.email} />
        </div>
      </section>

      <section className="mt-10" aria-labelledby="emails-heading">
        <h2 id="emails-heading" className="mb-3 px-1 font-display text-[1.25rem] font-medium">
          Email preferences
        </h2>
        <div className="card p-5 sm:p-6">
          <MarketingToggle initial={viewer.marketing} />
        </div>
      </section>

      <p className="mt-8 px-1 text-[0.75rem] leading-relaxed text-muted">
        Forgotten your PIN? Message us and we’ll send you a temporary code to set a new one.
      </p>
    </>
  );
}

export default function AccountPage() {
  return (
    <>
      <Link
        href="/dashboard"
        className="mb-8 inline-flex items-center gap-1.5 text-[0.8rem] font-semibold text-muted transition hover:text-foreground"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to dashboard
      </Link>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-surface" aria-busy="true" />}>
        <Account />
      </Suspense>
    </>
  );
}
