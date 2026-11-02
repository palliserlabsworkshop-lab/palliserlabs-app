# Palliser Labs — Client Portal

A mobile-first client portal built with Next.js (App Router), TypeScript and Tailwind CSS. Notion is the backend. People sign in with their email and their own 6-digit PIN and see only the brands they're linked to.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

| Variable | What it is |
| --- | --- |
| `NOTION_TOKEN` | Your Notion internal integration secret |
| `CLIENTS_DB_ID` | The **Brands** database (URL or bare 32-character ID) |
| `PEOPLE_DB_ID` | The **People** database |
| `TASKS_DB_ID` / `FILES_DB_ID` | The Tasks / Deliverables and Documents databases |
| `SESSION_SECRET` | A random string of at least 32 characters (`openssl rand -base64 32`) that signs login cookies |

`.env.local` is git-ignored. No secret appears in the source code.

## Notion checklist

1. **Share each database with the integration.** Open each of the three databases, then go to **⋯ → Connections** and add your integration.
2. **Turn on the comment capabilities.** Go to notion.so/profile/integrations, open your integration, then **Capabilities**. Enable *Read content*, *Insert content*, *Read comments* and *Insert comments*. Without the comment capabilities, the Comments section shows "unavailable".
3. **Use these property names**, or change them in `src/lib/schema.ts`:
   - People: `Name`, `Email`, `App Password`, `Status`, `Brands` (a relation to Brands), `Personal brand` (Checkbox), `Failed logins` (Number) and `Locked until` (Date), which are set by the app
   - Brands: `Name`, `Type` (Business / Personal brand), `Status`
   - Tasks: `Task`, `Status`, `Due date`, `Brand` (or `Client`, a relation to Brands), plus `Video Link` (URL) and `Brief Data` (Text) for portal projects, and `Final Video` (URL), `Revision round` (Number), `Approved on` (Date), `Downloaded on` (Date) for reviews, plus `Script status` (Select: Queued / Ready for review / Changes requested / Approved), `Script` (Text) and `Script Link` (URL) for the script step. `Status` needs `Queued`, `Ready for review`, `Tweaks requested`, `Approved` and `Archived` options.
   - Files: `File name`, `File / URL`, `Type`, `Brand` (or `Client`, a relation to Brands)

The app reads each database's schema at runtime, so property types are flexible:
- `Email` can be an Email or Text property.
- `App Password` can be Text or Number. Leading zeros are restored, so `0042` works.
- `Status` can be Status or Select.
- `File / URL` can be a Files & media or URL property.
- Column names are matched ignoring case, spaces and punctuation, so `File/URL` and `File / URL` both work.

## How it works

- **Login** (`src/app/actions.ts`): the email and PIN are checked on the server against the People database using a timing-safe comparison. On success, the server sets an HttpOnly signed cookie that holds only the person's Notion page ID. People (or brands) whose Status is Inactive, Archived, Disabled or Former are switched off.
- **Data isolation** (`src/lib/viewer.ts`, `src/lib/notion.ts`): on every request the person and their linked brands are re-read from Notion. Every Tasks and Files query is then filtered server-side to rows linked to those brands. Nothing from the browser is trusted, and no data is cached.
- **Task columns**: *Done* goes to **Completed**. *Queued* and *In progress* go to **In Progress**, with a yellow **Queued** or blue **In Progress** chip. Status colours: yellow = Queued, blue = In Progress, orange = needs your review, green = Done. Purple is only used for selected or tappable things.
- **New project form**: clients submit a Google Drive link, a "needed by" date and a brief (format, purpose, style, 1–3 hook variants, platform, references, notes). This creates a **Queued** row in the Tasks DB linked to the chosen brand (and to the person in `Requested by`), with the date in `Due date`. The earliest date allowed is set by `TURNAROUND_HOURS` (24) in `src/lib/brief.ts`.
  - The answers are saved in `Brief Data` as JSON option keys (e.g. `talking_head`), so the labels in `src/lib/brief.ts` can change without breaking old data.
  - A readable copy of the brief is written into the Notion page body for the editor.
  - Clients can open each project's brief from its task card in the app.
- **Script step (optional)**: under New project, a client can pick *Start with my script*. They paste their script or link a Google Doc, and choose how many written hooks and calls to action to add (0–3 each). 1 hook + 1 CTA is included; more shows an extra-cost note and is flagged "⚠️ Extra cost" in the page body. Scripts are promised in "2 hrs+".
  - This creates a ✍️ task with `Script status` *Queued* and `Status` *Script* (add a "Script" option to Status). Their script goes into `Script` (Text) and `Script Link` (URL), and their original stays in the page body.
  - Edit `Script` (or the linked doc) into the final version, then set `Script status` to *Ready for review*. The client can read it, copy it, download it as .txt, or open the Google Doc, and then approve it or request changes. A change request sets *Changes requested* and is posted as a comment.
  - Once the script is approved, the same project asks the client for footage (`/dashboard/projects/:id/footage`). That adds the video brief to the same row and sets `Status` to *Queued*, and from there it follows the normal video flow. Approving also sets `Status` to *Awaiting footage* (add that option too), so the row moves from the Scripts board to the Videos board, with a "✍️ Script attached" formula column on approved scripts.
  - Cards show a progress line: Script → Footage → Editing → Review → Done.
- **Video review**: set Status to *Ready for review* with a `Final Video` link (Drive file or folder), and the video appears at the top of the client's dashboard as a tile with a play button that opens it in Google Drive. The thumbnail is fetched server-side through `/api/videos/:id/thumbnail`, so it also loads on phones. Phone browsers block Drive's embedded player, so the app doesn't embed it.
  - **Approve** sets *Approved* and `Approved on`.
  - **Request changes** sets *Tweaks requested*, adds 1 to `Revision round`, and posts the request as a comment on the task page.
  - Each video has its own feedback thread, made of page-level comments on the task.
  - **Download** goes through `/api/videos/:id/download`, which records `Downloaded on` the first time it's clicked (it records the click, not a confirmed save) and then redirects to Drive.
- **Archiving**: the app hides archived and finished work under a collapsed "Archive" link.
  - Anything with Status *Archived* is hidden.
  - Delivered videos are hidden 14 days after they're downloaded.
  - Older Done tasks with no final video are hidden 30 days after their due date.
  - A daily Vercel cron job (`/api/cron/archive`, see `vercel.json`) sets Status *Archived* in Notion, but only on videos whose `Downloaded on` is more than 14 days old. It never changes any other rows. It needs a `CRON_SECRET` environment variable.
- **Google Drive "Final edits" folder (optional)**: drop a final edit (a file or a folder) into the shared Drive folder, with the task's code in its name, e.g. `PL-12 Spring launch.mp4`. The code comes from the `ID` column, a Unique ID with the prefix `PL`.
  - The app sets `Final Video`, changes Status to *Ready for review*, makes the file viewable by anyone with the link, and moves it into `Final edits/Delivered`.
  - Videos the client has already approved or that are archived are never reopened.
  - When a video is archived, its file moves to `Final edits/Archive`.
  - The check runs in the background whenever a client opens their dashboard (at most once a minute per server), and also daily. You can trigger it manually with `GET /api/cron/drive-sync` and `Authorization: Bearer <CRON_SECRET>`.
  - It needs `GOOGLE_SERVICE_ACCOUNT_JSON` (the whole key file) and `DRIVE_FINAL_EDITS_FOLDER_ID`. Without them it does nothing.
- **People and Brands**: one person can share brands with others, e.g. Liam and Jack both linked to Natty and Freedom Club, each with a private personal brand.
  - **Personal brand** tick box: the first time a ticked person signs in, the app creates "<Name> – Personal" in Brands (Type: Personal brand) and links it to them. It is labelled **Personal** in the app. Unticking hides it but keeps it in Notion.
  - Brand pills (*All · Natty · … · Personal*) filter Tasks and Documents instantly in the browser. The server only sends the person's own brands' data.
  - **Ready for your review** always shows every brand, with each card labelled. New project asks which brand it's for, and a brand outside the person's own is rejected on the server.
  - Per-video feedback on shared brands shows who wrote each comment. The scope rules are in `src/lib/scope.ts`.
- **Files** open through `/api/files/:id`. This route checks that the file belongs to one of the signed-in person's brands, then redirects to a fresh link. Notion-hosted file links expire after about 1 hour.
- **Messages** (the general chat) are the comments on the person's own People row, one thread covering all their brands.
  - Comments posted in the app appear in Notion under the person's name.
  - Comments you add in Notion appear in the app within about 15 seconds, by polling.
  - Notion's API returns only open (unresolved) comments. If you resolve a thread in Notion, it disappears from the portal.
- **Accounts and PINs**
  - **New client:** add them to People (name, email, brands) and type a **temporary code** of 4–6 digits into `App Password`. Send them the code.
  - **First sign-in:** with that code, they go straight to **Choose your PIN**. They confirm or correct their email and pick a 6-digit PIN. Easy ones like 111111 or 123456 are refused.
  - **Hashed PIN:** the PIN is saved in `App Password` only as a salted, keyed scrypt hash (`pin1$…`), so nobody can read it, including you.
  - **Forgotten PIN:** type a new temporary code into `App Password` and they'll choose a new PIN on their next sign-in.
  - **Account page:** the person icon in the header. They can change their PIN or sign-in email, after entering their current PIN. Wrong PINs count towards the lockout, a new email must be typed twice, and an email that's already in use is refused.
  - **Sign-outs:** any change to the PIN or email signs out every other device. Changing `SESSION_SECRET` means everyone needs a new temporary code.
- **Privacy Policy and Terms of Use**
  - **Pages:** `/privacy` and `/terms`, linked at the bottom of the sign-in screen, the first-time setup screen and every portal page. Your business details are in `BUSINESS` in `src/components/Legal.tsx`.
  - **Agreement:** the setup screen says "By continuing you agree…".
  - **Cookies:** the only cookie is the essential sign-in cookie. There's no analytics or tracking, so no cookie banner is needed.
- **Marketing emails (opt-in)**
  - **Setup screen:** an unticked box: "Send me occasional news and offers".
  - **Account page:** a News and offers switch.
  - **Notion:** saved in People as `Marketing emails` (Checkbox) and `Marketing consent date` (Date). The date is the record of consent and is cleared on opt-out.
  - **Who to email:** only people with the box ticked. Every promotional email needs an unsubscribe link (Spam Act).
- **Security**
  - **Brute-force protection:** wrong PINs are counted on the person's People row (`Failed logins`). After 5 wrong PINs the account locks (`Locked until`) for 15 minutes, and the lock doubles every further 5 wrong PINs, up to 24 hours. While locked, even the right PIN is refused. Clear `Locked until` (and `Failed logins`) in Notion to unlock someone straight away. There's also a fast per-email and per-IP throttle in memory, and every failed sign-in waits about 1 second. The error message is the same whether or not an email exists.
  - **Sessions:** a signed, HttpOnly, Secure `__Host-` cookie that JavaScript can't read. It holds only the person's ID and a fingerprint of their login details, never the PIN. Changing someone's Email or App Password in Notion signs them out everywhere. Setting them Inactive blocks them on their next click.
  - **Browser protections:** a strict Content Security Policy (code, images and connections only to this site, no framing, no outside form posts), HSTS, no-sniff, a Permissions-Policy and noindex. `X-Powered-By` is removed.
  - **Requests:** the message endpoints only accept posts from the portal's own pages (CSRF check) and are rate-limited. Server actions have Next.js's built-in origin check. Cron routes compare `CRON_SECRET` in constant time. Links from Notion are only opened if they're http(s).
  - **Secrets:** they live only in Vercel environment variables, are read server-side only (`server-only`), and none are exposed to the browser.

## Branding

All colours live in one commented block at the top of `src/app/globals.css`, with a dark set underneath it. Dark mode follows the device setting until the sun/moon button in the header is used, and that choice is remembered on the device. The brand fonts are in `src/fonts`: Sora for the body, and Aspekta for headings and the wordmark. The logo is an SVG in `src/components/Logo.tsx`.

## Deploy to Vercel

1. Push this folder to a Git repository and import it in Vercel.
2. Under **Settings → Environment Variables**, add the variables from the table above.
3. Deploy.
