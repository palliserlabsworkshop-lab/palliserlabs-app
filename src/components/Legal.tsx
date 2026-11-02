import Link from "next/link";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

/** Business details used in the Privacy Policy and Terms of Use. */
export const BUSINESS = {
  name: "Palliser Labs",
  abn: "33 498 626 405",
  location: "Melbourne, Victoria, Australia",
  email: "palliserlabsworkshop@gmail.com",
};

/** Small "Privacy · Terms" links for the bottom of the sign-in screens and the portal. */
export function LegalLinks({ className = "" }: { className?: string }) {
  const link = "underline-offset-2 transition hover:text-foreground hover:underline";
  return (
    <nav aria-label="Legal" className={`flex items-center justify-center gap-3 text-[0.72rem] text-muted ${className}`}>
      <Link href="/privacy" className={link}>
        Privacy Policy
      </Link>
      <span aria-hidden>·</span>
      <Link href="/terms" className={link}>
        Terms of Use
      </Link>
    </nav>
  );
}

/** Layout for a legal document: readable measure, clear headings, same look as the rest of the app. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col px-6 pb-16 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" aria-label="Palliser Labs portal">
            <Logo />
          </Link>
          <span className="-mr-2">
            <ThemeToggle />
          </span>
        </div>

        <h1 className="mt-14 font-display text-[2.2rem] font-medium leading-tight tracking-tight sm:text-[2.6rem]">{title}</h1>
        <p className="mt-2 text-[0.85rem] text-muted">Last updated {updated}</p>

        <article
          className="mt-10 text-[0.95rem] leading-relaxed text-foreground/90
            [&_a]:font-semibold [&_a]:text-primary-ink [&_a]:underline-offset-2 hover:[&_a]:underline
            [&_h2]:mb-3 [&_h2]:mt-12 [&_h2]:font-display [&_h2]:text-[1.3rem] [&_h2]:font-medium [&_h2]:tracking-[-0.01em] [&_h2]:text-foreground
            [&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-[0.95rem] [&_h3]:font-semibold [&_h3]:text-foreground
            [&_li]:mt-1.5 [&_p]:mt-3 [&_strong]:font-semibold [&_strong]:text-foreground
            [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_li]:marker:text-muted"
        >
          {children}
        </article>

        <div className="mt-16 border-t border-line pt-6">
          <LegalLinks className="justify-start" />
          <p className="mt-3 text-[0.72rem] text-muted">
            © {BUSINESS.name} · ABN {BUSINESS.abn}
          </p>
        </div>
      </div>
    </main>
  );
}
