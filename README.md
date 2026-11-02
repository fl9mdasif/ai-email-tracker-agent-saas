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
| 4 | AI analysis: category, priority, summary, next action | Code complete; live run needs OpenAI credits |
| 5+ | Prioritised dashboard, Gmail/Outlook OAuth, follow-ups, outreach tools | Planned |

## Tech stack

- Next.js 16 (App Router, Turbopack), TypeScript, React 19
- Tailwind CSS v4, shadcn/ui, `motion`, three.js (react-three-fiber)
- Neon Postgres with Drizzle ORM
- Auth.js v5 (Google sign-in)
- Inngest for background jobs
- OpenAI, behind a provider-neutral gateway (`src/core/llm`)
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
   | `OPENAI_API_KEY`, `LLM_MODEL` | AI analysis (model defaults to `gpt-4.1-mini`) |

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

5. Sign in with Google, open **Accounts**, and connect a Hostinger or Zoho mailbox. Press **Sync now**, then open **Today**.

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` / `build` / `start` | Run, build and serve the app |
| `npm test` | Run all tests (database tests are skipped without env) |
| `npm run lint` | ESLint |
| `npm run db:generate` / `db:migrate` | Create and apply migrations |
| `npm run db:studio` | Browse the database |
| `npm run inngest:dev` | Local Inngest worker |
| `npm run ai:smoke` | One real OpenAI call to check the key and credits |
| `npm run db:backfill-brand` | Set the provider brand on older connected accounts |

## AI analysis

New mail is analysed after each sync, and a 15-minute job catches up on anything left. Each inbound email gets one of seven categories (needs reply, follow-up needed, lead reply, invoice or payment, newsletter or promo, FYI, spam), a priority from 1 to 3, a summary, and a suggested action. Up to 3000 characters of each email are sent to OpenAI.

If the OpenAI account has no credits or the key is rejected, analysis pauses without using up any email's attempts, the Today page shows a notice, and it resumes by itself once the problem is fixed.

## Notes

- Provider logos are trademarks of their owners and are used only to show compatibility. Sources are listed in `public/providers/SOURCES.md`.
- This project uses a recent Next.js with breaking changes. See `AGENTS.md` before changing framework-level code.
- `PLAN.md` and `PROGRESS.md` are local working notes and are git-ignored.
