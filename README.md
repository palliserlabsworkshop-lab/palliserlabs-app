# Palliser Labs — Client Portal

A mobile-first client portal built with Next.js (App Router), TypeScript and Tailwind CSS. Notion is the backend. Clients sign in with their email and a 4-digit App Password. They see only their own tasks, files and comments.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

| Variable | What it is |
| --- | --- |
| `NOTION_TOKEN` | Your Notion internal integration secret |
| `CLIENTS_DB_ID` / `TASKS_DB_ID` / `FILES_DB_ID` | The database URL or its bare 32-character ID (both work) |
| `SESSION_SECRET` | A random string of at least 32 characters (`openssl rand -base64 32`) that signs login cookies |

`.env.local` is git-ignored. No secret appears in the source code.

## Notion checklist

1. **Share each database with the integration.** Open each of the three databases, then go to **⋯ → Connections** and add your integration.
2. **Turn on the comment capabilities.** Go to notion.so/profile/integrations, open your integration, then **Capabilities**. Enable *Read content*, *Insert content*, *Read comments* and *Insert comments*. Without the comment capabilities, the Comments section shows "unavailable".
3. **Use these property names**, or change them in `src/lib/schema.ts`:
   - Clients: `Name`, `Email`, `Company`, `Status`, `App Password`
   - Tasks: `Task`, `Status`, `Due date`, `Client` (a relation to Clients)
   - Files: `File name`, `File/URL`, `Type`, `Client` (a relation to Clients)

The app reads each database's schema at runtime, so property types are flexible:
- `Email` can be an Email or Text property.
- `App Password` can be Text or Number. Leading zeros are restored, so `0042` works.
- `Status` can be Status or Select.
- `File/URL` can be a Files & media or URL property.

## How it works

- **Login** (`src/app/actions.ts`): the email and PIN are checked on the server against the Clients DB using a timing-safe comparison. On success, the server sets an HttpOnly signed cookie that holds only the client's Notion page ID. Clients whose Status is Inactive, Archived, Disabled or Former can't sign in.
- **Data isolation** (`src/lib/notion.ts`): every Tasks and Files query is filtered server-side by `Client` relation *contains* the page ID taken from the signed cookie. Nothing from the browser is trusted. Client data is never cached.
- **Task columns**: *Done* goes to **Completed**. *In progress* and *Not started* go to **In Progress**, and *Not started* tasks carry an "Up next" tag.
- **Files** open through `/api/files/:id`. This route checks that the file belongs to the signed-in client, then redirects to a fresh link. Notion-hosted file links expire after about 1 hour.
- **Comments** use the client's own row-page in the Clients DB as the thread.
  - Comments posted in the app appear in Notion under the client's name.
  - Comments you add in Notion appear in the app within about 15 seconds, by polling.
  - Notion's API returns only open (unresolved) comments. If you resolve a thread in Notion, it disappears from the portal.
- **Login throttling**: after 5 failed attempts in 15 minutes, further attempts from that email or IP are blocked. This uses in-memory storage, so on Vercel each instance keeps its own count. For a strict global limit, use Upstash Redis or Vercel KV.

## Branding

All colours live in one commented block at the top of `src/app/globals.css`. The brand fonts are in `src/fonts`: Sora for the body, and Aspekta for headings and the wordmark. The logo is an SVG in `src/components/Logo.tsx`.

## Deploy to Vercel

1. Push this folder to a Git repository and import it in Vercel.
2. Under **Settings → Environment Variables**, add all five variables from the table above.
3. Deploy.
