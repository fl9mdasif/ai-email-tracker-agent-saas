# Loopify

Never miss a reply that closes the deal. Loopify is a multi-tenant SaaS that connects your mailboxes, reads new mail, and uses AI to tell you which emails need a reply, which leads answered, and what to do next.

The full product spec is in [Product.md](Product.md).

## Status

| Milestone | What | State |
|-----------|------|-------|
| 1 | Foundation: Next.js app, Neon Postgres, Google sign-in, tenants and modules | Done |
| 1b | Landing page with a 3D hero | Done |
| 2 | Credentials vault (AES-256-GCM) and connected accounts | Done |
| 3 | Mail sync over IMAP (Hostinger, Zoho) in the background | Done |
| 7 (part) | Connect Gmail (read-only OAuth), several Gmail accounts | Code complete; needs Google Cloud setup and a real-Gmail test |
| 4 | AI analysis: category, priority, summary, next action (today's mail only, super-admin scan interval) | Code complete; live run verified on Groq |
| 5+ | Prioritised dashboard, Gmail/Outlook OAuth, follow-ups, outreach tools | Planned |

## Tech stack

- Next.js 16 (App Router, Turbopack), TypeScript, React 19
- Tailwind CSS v4, shadcn/ui, `motion`, three.js (react-three-fiber)
- Neon Postgres with Drizzle ORM
- Auth.js v5 (Google sign-in)
- Inngest for background jobs
- OpenAI (production) or Groq (free testing), behind a provider-neutral gateway (`src/core/llm`)
- Vitest for tests

## How it is organised

- `src/core`: tenancy, auth, database, credentials vault, LLM gateway, config. It never imports from `src/modules`.
- `src/modules/email-tracker`: the product module (connectors, sync, AI analysis, queries, background jobs). Its tables are prefixed `et_`.
- `src/app`: pages (landing, login, dashboard, accounts) and the API routes.

Rules that hold everywhere:
- Every query filters by `tenant_id`, taken from the session, never from the request.
- Mailbox passwords and tokens are encrypted with AES-256-GCM, bound to the tenant and account, and never returned to the browser.
- Email text is treated as untrusted input to the model, and prompts and replies are never stored.

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill it in. Minimum for local work:

   | Variable | Purpose |
   |----------|---------|
   | `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Neon connection strings |
   | `NEXTAUTH_URL`, `NEXTAUTH_SECRET` | Auth.js |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in |
   | `CREDENTIALS_ENCRYPTION_KEY` | Vault key. Back it up: losing it makes stored credentials unreadable |
   | `LLM_PROVIDER`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `LLM_MODEL` | AI analysis. `LLM_PROVIDER` is `openai` (default, production) or `groq` (free tier for testing, needs `GROQ_API_KEY`). `LLM_MODEL` is optional and defaults per provider (`gpt-4.1-mini` on OpenAI) |

   | `SUPER_ADMIN_EMAILS` | Comma-separated emails allowed to open the platform dashboard (`/admin`) and set the AI scan interval |

   Never commit `.env.local`.

3. Apply the database migrations:

   ```bash
   npm run db:migrate
   ```

4. Start the app and, in a second terminal, the Inngest worker:

   ```bash
   npm run dev
   npm run inngest:dev
   ```

   App: http://localhost:3000. Inngest dashboard: http://localhost:8288.

5. Sign in with Google, open **Accounts**, and connect a Hostinger or Zoho mailbox, or press **Connect Gmail**. Press **Sync now**, then open **Today**.

   **Connect Gmail** needs one-time setup in Google Cloud (the same project as the login): enable the Gmail API, add the scope `https://www.googleapis.com/auth/gmail.readonly`, add each Gmail as a test user while the app is in testing mode, and add `http://localhost:3000/api/connect/google/callback` (and your production URL) as a redirect URI. It reuses `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Access is read-only, only an encrypted refresh token is stored, and in testing mode Google expires it about every 7 days: press **Reconnect** on the account card.

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` / `build` / `start` | Run, build and serve the app |
| `npm test` | Run all tests (database tests are skipped without env) |
| `npm run lint` | ESLint |
| `npm run db:generate` / `db:migrate` | Create and apply migrations |
| `npm run db:studio` | Browse the database |
| `npm run inngest:dev` | Local Inngest worker |
| `npm run ai:smoke` | One real model call (provider from `LLM_PROVIDER`) to check the key, model and credits |
| `npm run db:backfill-brand` | Set the provider brand on older connected accounts |

## AI analysis

The AI scans **only mail received today** (in each tenant's own time zone, set in **Settings**), so older mail never uses credits. Mail is still fetched every 15 minutes, but the AI scan runs on its own interval, chosen by a **super admin** on the platform dashboard (`/admin`): 15 minutes, 30 minutes, or 1 to 10 hours (default 1 hour). Super admins are the emails listed in `SUPER_ADMIN_EMAILS`; anyone else gets a 404 on `/admin`.

Each inbound email gets one of seven categories (needs reply, follow-up needed, lead reply, invoice or payment, newsletter or promo, FYI, spam), a priority from 1 to 3, a summary, and a suggested action. Up to 3000 characters of each email are sent to the model.

On **Today**, a progress bar shows "Scanning your mail" with the date being scanned. **Cancel** beside the bar stops the scan (the email in flight finishes) and turns automatic scans off for that tenant until **Scan now** is pressed. **Scan now** also starts a scan at any time.

If the AI account has no credits or the key is rejected, analysis pauses without using up any email's attempts, the Today page shows a notice, and it resumes by itself once the problem is fixed.

## Notes

- Provider logos are trademarks of their owners and are used only to show compatibility. Sources are listed in `public/providers/SOURCES.md`.
- This project uses a recent Next.js with breaking changes. See `AGENTS.md` before changing framework-level code.
- `PLAN.md` and `PROGRESS.md` are local working notes and are git-ignored.
