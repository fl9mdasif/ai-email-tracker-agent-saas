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
| 5 | Tenant dashboard: Today by priority, Needs reply, Follow-ups, Mail, email detail, export and delete | Code complete; needs a look in the browser |
| 6 | Chat: ask your mailbox (planner, SQL retrieval, answer) | Code complete; needs a real-AI try in the browser |
| 5b | Platform (super admin) dashboard with roles | B.1 to B.4 done (roles, plans, workspaces); the rest in progress |
| 8 | Hot-lead follow-up: scoring, AI drafts, review and one-click Send (SMTP and Gmail) | Code complete; needs a real send from your mailbox |
| 9+ | Outlook, Instantly and Apollo, digest and push | Planned |

## Tech stack

- Next.js 16 (App Router, Turbopack), TypeScript, React 19
- Tailwind CSS v4, shadcn/ui, `motion`, three.js (react-three-fiber)
- Neon Postgres with Drizzle ORM
- Auth.js v5 (Google sign-in)
- Inngest for background jobs
- imapflow and mailparser to read mail; nodemailer to send it (SMTP, and building the message for Gmail)
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

## Dashboard

- **Today**: numbers, today's mail by priority, a get-started checklist, and an alert when an account needs reconnecting.
- **Needs reply**, **Follow-ups** (AI suggestions plus your own **Remind me**), and **Mail** (search, filters by account, category, priority, handled and unread).
- Open any email to read it as plain text, see what the AI made of it, open it in Gmail, or press **Analyze this email** for mail older than today.
- **Settings**: time zone, AI usage, **Export my data** (JSON) and **Delete my workspace**.

## Chat

Open **Chat** and ask about your mail in plain words, in English or Bangla, or press one of the four suggested questions (What needs my action today? Who should I follow up with? Which leads replied? What came in today?).

- The AI first turns your question into a filter from a fixed list (it never writes SQL and never sees any email while doing so). The app then runs a tenant-scoped query for **at most 25 emails**, with no email bodies, and a second AI call answers only from those rows. Mail text is treated as untrusted data.
- The chat can only read: it cannot send, reply, delete or change anything.
- Limit: 20 questions per hour and 100 per day for a workspace. Conversations are saved so follow-up questions work; **Clear chat** deletes yours, and they are part of **Export my data** and removed with **Delete my workspace**.

## Leads and follow-ups (human in the loop)

- During its normal scan the AI also scores a prospect's mail **hot**, **warm** or **cold** with a short reason (hot: asks for a price, a call or a demo, or replies positively). No extra AI calls. **Score older leads** on the Leads page scores lead replies from the last 30 days once (at most 50 per press).
- **Leads** lists them hottest first. Open one to see their last email and a follow-up the AI drafts from the real thread, in their language and tone. It never invents prices, dates or links; it leaves placeholders like [price] for you. The draft is written only when you open the lead or press **Regenerate** (at most 30 drafts a day).
- **Edit**, **Save**, **Regenerate**, **Skip** (hides the lead for 7 days) or **Send**. Send asks once more, naming From and To, then sends **exactly one email** from the mailbox the lead wrote to, as a reply in the same thread. A double click or a second tab cannot send it twice. There is no bulk send and no automatic send.
- After a send the lead rests for 3 days and a reminder appears on Follow-ups. At most 50 sends a day per workspace.
- Every send attempt is logged (who, which draft, which mailbox, to whom, outcome) without the subject or the text. Leads, drafts and the log are in **Export my data** and go with **Delete my workspace**.
- **Hostinger and Zoho** send over SMTP with the same app password, and a copy goes to the mailbox's Sent folder.
- **Gmail** keeps reading and sending as separate permissions. The first Send from a Gmail account shows **Allow sending**, which asks Google only for `gmail.send`. Add `https://www.googleapis.com/auth/gmail.send` to the consent screen in Google Cloud first.

## AI analysis

The AI scans **only mail received today** (in each tenant's own time zone, set in **Settings**), so older mail never uses credits. Mail is still fetched every 15 minutes, but the AI scan runs on its own interval, chosen by a **super admin** on the platform dashboard (`/admin`): 15 minutes, 30 minutes, or 1 to 10 hours (default 1 hour). Super admins are the emails listed in `SUPER_ADMIN_EMAILS`; anyone else gets a 404 on `/admin`.

Each inbound email gets one of seven categories (needs reply, follow-up needed, lead reply, invoice or payment, newsletter or promo, FYI, spam), a priority from 1 to 3, a summary, and a suggested action. Up to 3000 characters of each email are sent to the model.

On **Today**, a progress bar shows "Scanning your mail" with the date being scanned. **Cancel** beside the bar stops the scan (the email in flight finishes) and turns automatic scans off for that tenant until **Scan now** is pressed. **Scan now** also starts a scan at any time.

If the AI account has no credits or the key is rejected, analysis pauses without using up any email's attempts, the Today page shows a notice, and it resumes by itself once the problem is fixed.

## Notes

- Provider logos are trademarks of their owners and are used only to show compatibility. Sources are listed in `public/providers/SOURCES.md`.
- This project uses a recent Next.js with breaking changes. See `AGENTS.md` before changing framework-level code.
- `PLAN.md` and `PROGRESS.md` are local working notes and are git-ignored.
