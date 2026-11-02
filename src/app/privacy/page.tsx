import type { Metadata } from "next";
import Link from "next/link";
import { BUSINESS, LegalPage } from "@/components/Legal";

export const metadata: Metadata = { title: "Privacy Policy — Palliser Labs" };

const mail = `mailto:${BUSINESS.email}`;

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="2 November 2026">
      <p>
        This policy explains how {BUSINESS.name} (ABN {BUSINESS.abn}, {BUSINESS.location}) — “we”, “us” — handles
        personal information in our client portal. We handle personal information in line with the Australian Privacy
        Principles and, for clients in the European Union or United Kingdom, the GDPR.
      </p>
      <p>
        <strong>In short:</strong> we only collect what we need to run your projects, we never sell your information,
        your PIN is stored in a form nobody can read (including us), and we don’t use advertising or tracking cookies.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account details:</strong> your name, email address, and which brands you work with us on.
        </li>
        <li>
          <strong>Your PIN:</strong> stored only as a one-way, salted and keyed hash. We cannot see or recover it — if
          you forget it, we issue a temporary code so you can choose a new one.
        </li>
        <li>
          <strong>Project content:</strong> project names, briefs, scripts, links to your footage and files, feedback,
          approvals and messages you send through the portal.
        </li>
        <li>
          <strong>Your email preference:</strong> whether you’ve opted in to news and offers, and when.
        </li>
        <li>
          <strong>Activity status:</strong> when you last had the portal open and whether you were active or away, so
          our team can see when you’re online (for example, to reply while you’re there). We don’t record what you
          look at or click.
        </li>
        <li>
          <strong>Security records:</strong> a count of recent incorrect PIN attempts and any temporary lock, used to
          protect your account. Your IP address is used briefly to limit repeated sign-in attempts and isn’t stored
          with your account. Our hosting provider keeps short-lived technical logs (such as the time and address of a
          request) to keep the service running.
        </li>
      </ul>
      <p>
        Your footage and final videos stay in Google Drive. The portal stores links to them, not copies.
      </p>

      <h2>How we use it</h2>
      <ul>
        <li>to give you access to the portal and show you your projects (and only yours);</li>
        <li>to produce, deliver and revise the work you’ve asked for;</li>
        <li>to communicate with you about your projects;</li>
        <li>to keep the portal and your account secure;</li>
        <li>to show our team when you’re online, so we can respond while you’re there;</li>
        <li>to send you news and offers — only if you’ve opted in.</li>
      </ul>
      <p>
        For clients in the EU or UK, our legal bases are: performing our contract with you (running your projects),
        our legitimate interest in keeping the service secure, and your consent for marketing emails.
      </p>

      <h2>Who can see it</h2>
      <p>
        We do not sell, rent or trade your personal information. Inside the portal, you only see information for the
        brands you’re linked to; people who share a brand with you can see that brand’s projects and messages. We use a
        small number of trusted service providers to run the portal:
      </p>
      <ul>
        <li>
          <strong>Notion</strong> (Notion Labs, Inc., United States) — stores account details and project information;
        </li>
        <li>
          <strong>Vercel</strong> (Vercel Inc., United States) — hosts the portal;
        </li>
        <li>
          <strong>Google</strong> (Google LLC) — Google Drive, where your footage and videos are kept.
        </li>
      </ul>
      <p>
        We may also disclose information if required by law. These providers may store information outside
        Australia, including in the United States. We take reasonable steps to make sure they protect it, and we only
        use providers with strong security practices. For EU and UK clients, these transfers rely on the providers’
        standard data-protection safeguards.
      </p>

      <h2>How we protect it</h2>
      <ul>
        <li>all connections are encrypted (HTTPS);</li>
        <li>PINs are stored only as one-way hashes;</li>
        <li>accounts lock temporarily after repeated incorrect PINs;</li>
        <li>sign-in sessions use secure cookies that other websites and scripts can’t read;</li>
        <li>every request is checked so you can only reach your own brands’ information.</li>
      </ul>
      <p>
        No system is perfectly secure, but we work hard to protect your information. If we become aware of a data
        breach likely to cause you serious harm, we will notify you as required by law.
      </p>

      <h2>Cookies</h2>
      <p>
        The portal uses one essential cookie to keep you signed in (it lasts up to 7 days, or until you sign out). It
        also remembers your light or dark mode choice on your own device. We don’t use analytics, advertising or
        tracking cookies, so there’s nothing to opt out of. Because the cookie is strictly necessary for the portal to
        work, we don’t ask for consent to it.
      </p>

      <h2>Emails from us</h2>
      <p>
        We send <strong>project emails</strong> as part of our service — for example, when something is ready for your
        review or we’ve sent you a message. We only send <strong>news and offers</strong> if you’ve ticked the box to
        receive them. You can switch these off at any time on your Account page or by using the unsubscribe link in any
        such email, and we’ll stop within 5 business days.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep your information while you’re a client and for as long as we reasonably need it afterwards for our
        records, to resolve disputes, or to meet legal obligations. You can ask us to delete your information at any
        time (see below); we’ll do so unless we’re required to keep it.
      </p>

      <h2>Your rights</h2>
      <p>You can ask us to:</p>
      <ul>
        <li>access the personal information we hold about you;</li>
        <li>correct it if it’s wrong (you can also update your email and PIN yourself on your Account page);</li>
        <li>delete it;</li>
        <li>stop sending you marketing emails.</li>
      </ul>
      <p>
        If you’re in the EU or UK, you also have the right to restrict or object to how we use your information, to
        receive a copy in a portable format, and to withdraw consent at any time.
      </p>
      <p>
        To make a request, email <a href={mail}>{BUSINESS.email}</a>. We’ll respond within 30 days. If you’re not
        happy with our response, you can complain to the Office of the Australian Information Commissioner
        (oaic.gov.au) or, in the EU or UK, your local data protection authority.
      </p>

      <h2>Children</h2>
      <p>The portal is for businesses and isn’t intended for anyone under 18.</p>

      <h2>Changes to this policy</h2>
      <p>
        We may update this policy from time to time. The date at the top shows when it last changed, and we’ll let you
        know about significant changes.
      </p>

      <h2>Contact us</h2>
      <p>
        {BUSINESS.name} · ABN {BUSINESS.abn} · {BUSINESS.location}
        <br />
        <a href={mail}>{BUSINESS.email}</a>
      </p>
      <p>
        See also our <Link href="/terms">Terms of Use</Link>.
      </p>
    </LegalPage>
  );
}
