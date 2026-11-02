import type { Metadata } from "next";
import Link from "next/link";
import { BUSINESS, LegalPage } from "@/components/Legal";

export const metadata: Metadata = { title: "Terms of Use — Palliser Labs" };

const mail = `mailto:${BUSINESS.email}`;

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use" updated="2 November 2026">
      <p>
        These terms apply to your use of the {BUSINESS.name} client portal (the “portal”), operated by {BUSINESS.name}{" "}
        (ABN {BUSINESS.abn}, {BUSINESS.location}) — “we”, “us”. By signing in, you agree to them.
      </p>

      <h2>1. Your agreement with us comes first</h2>
      <p>
        The portal is a tool for working on projects with us. Our fees, deliverables, revisions, timelines and who owns
        the finished work are set out in your quote or client agreement. If anything in these terms conflicts with
        that agreement, the agreement wins.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>Accounts are created by us for our clients and their team members.</li>
        <li>
          Keep your PIN private and don’t share your account. You’re responsible for what happens under your account.
        </li>
        <li>
          Tell us straight away at <a href={mail}>{BUSINESS.email}</a> if you think someone else has used it.
        </li>
        <li>Keep your email address up to date (you can change it on your Account page).</li>
      </ul>

      <h2>3. Using the portal</h2>
      <p>Please use the portal only for your projects with us. You must not:</p>
      <ul>
        <li>try to access accounts, brands or information that aren’t yours;</li>
        <li>try to test, probe, overload or get around the portal’s security;</li>
        <li>upload or link to anything unlawful, harmful or that contains malware;</li>
        <li>share content you don’t have the right to share.</li>
      </ul>

      <h2>4. Your content</h2>
      <p>
        You keep ownership of the footage, scripts, briefs and other material you give us. You confirm you have the
        rights to share it, and you give us permission to use it to produce and deliver your projects. We won’t
        publish your material or finished work (for example, in our portfolio) unless your agreement with us allows it
        or you’ve given us permission.
      </p>

      <h2>5. Our portal</h2>
      <p>
        The portal, its design and our brand belong to {BUSINESS.name}. You may use the portal for your projects, but
        you may not copy, resell or reverse-engineer it.
      </p>

      <h2>6. Availability</h2>
      <p>
        We work to keep the portal available and secure, but we can’t promise it will always be uninterrupted or
        error-free. We may update, change or pause it — for example, for maintenance. The portal relies on other
        services such as Notion, Vercel and Google Drive, and their availability is outside our control.
      </p>

      <h2>7. Liability</h2>
      <p>
        Nothing in these terms excludes your rights under the Australian Consumer Law or other laws that can’t be
        excluded. Otherwise, to the extent the law allows: the portal is provided “as is”; we aren’t liable for indirect
        or consequential loss (such as lost profits or data); and our total liability relating to the portal is limited
        to supplying the relevant services again or paying the cost of having them supplied again.
      </p>

      <h2>8. Suspending or closing access</h2>
      <p>
        We may suspend or close access to the portal if these terms are broken, to protect security, or when our work
        together ends. You can ask us to close your account at any time.
      </p>

      <h2>9. Privacy</h2>
      <p>
        Our <Link href="/privacy">Privacy Policy</Link> explains how we handle your personal information.
      </p>

      <h2>10. Changes</h2>
      <p>
        We may update these terms. The date at the top shows when they last changed, and we’ll let you know about
        significant changes. Continuing to use the portal means you accept the updated terms.
      </p>

      <h2>11. Governing law</h2>
      <p>
        These terms are governed by the laws of Victoria, Australia, and the courts of Victoria have jurisdiction.
        Clients outside Australia keep any rights under their own local laws that can’t be excluded.
      </p>

      <h2>Contact us</h2>
      <p>
        {BUSINESS.name} · ABN {BUSINESS.abn} · {BUSINESS.location}
        <br />
        <a href={mail}>{BUSINESS.email}</a>
      </p>
    </LegalPage>
  );
}
