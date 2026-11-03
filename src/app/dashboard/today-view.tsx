import { AlertTriangle, CalendarClock, Check, Circle, Inbox, Mail, Reply, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import { auth } from "@/core/auth";
import { getDb } from "@/core/db";
import { EmptyState } from "@/components/mail/empty-state";
import { MailRowItem } from "@/components/mail/mail-row";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  type MailRow,
  getOnboardingState,
  getTodayOverview,
  listAccountsNeedingAttention,
  listTodayByPriority,
} from "@/modules/email-tracker/queries/dashboard";
import { getTodayWindow } from "@/modules/email-tracker/scan/scan-state";
import { HandledButton, RemindMenu } from "./mail-controls";

function StatCard({ href, label, value, icon: Icon, tone }: { href: string; label: string; value: number; icon: typeof Mail; tone?: "alert" }) {
  return (
    <Link
      href={href}
      className={cn(
        "grid gap-1 rounded-xl border bg-card p-3 transition-colors hover:bg-muted/50",
        tone === "alert" && value > 0 && "border-brand/40 bg-brand/5",
      )}
    >
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </span>
      <span className="font-display text-2xl font-semibold tabular-nums">{value}</span>
    </Link>
  );
}

function Step({ done, title, text, href, cta }: { done: boolean; title: string; text: string; href?: string; cta?: string }) {
  return (
    <li className="flex items-start gap-3">
      {done ? <Check className="mt-0.5 size-5 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium", done && "text-muted-foreground line-through")}>{title}</p>
        {!done ? <p className="text-sm text-muted-foreground">{text}</p> : null}
      </div>
      {!done && href && cta ? (
        <Link href={href} className={cn(buttonVariants({ size: "sm" }))}>
          {cta}
        </Link>
      ) : null}
    </li>
  );
}

function Group({ title, hint, rows, timeZone }: { title: string; hint: string; rows: MailRow[]; timeZone: string }) {
  if (rows.length === 0) return null;
  return (
    <section className="grid gap-2" aria-label={title}>
      <header className="flex items-baseline gap-2">
        <h2 className="font-display text-base font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">
          {rows.length} · {hint}
        </span>
      </header>
      <ul className="grid gap-2">
        {rows.map((mail) => (
          <MailRowItem
            key={mail.id}
            mail={mail}
            timeZone={timeZone}
            actions={
              <>
                <RemindMenu emailId={mail.id} />
                <HandledButton emailId={mail.id} handled={false} />
              </>
            }
          />
        ))}
      </ul>
    </section>
  );
}

/** The Today page body: onboarding, account problems, the numbers, then today's mail by priority. */
export async function TodayView() {
  const session = await auth();
  if (!session?.tenantId) return null;
  const db = getDb();
  const tenantId = session.tenantId;

  const [overview, groups, onboarding, problems, window] = await Promise.all([
    getTodayOverview(db, tenantId),
    listTodayByPriority(db, tenantId),
    getOnboardingState(db, tenantId),
    listAccountsNeedingAttention(db, tenantId),
    getTodayWindow(db, tenantId),
  ]);
  const { timeZone } = window;
  const showChecklist = onboarding.accounts === 0 || onboarding.emails === 0 || onboarding.analyzed === 0;
  const total = groups.p1.length + groups.p2.length + groups.p3.length + groups.unscanned.length;

  return (
    <div className="grid gap-5">
      {problems.length > 0 ? (
        <div role="alert" className="grid gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
          {problems.map((problem) => (
            <div key={problem.id} className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  <span className="font-medium">{problem.identity}</span> stopped syncing. {problem.message ?? "Please check the account."}
                </span>
              </p>
              {problem.provider === "gmail" ? (
                // A plain link: it starts a sign-in with Google and must not be prefetched.
                <a
                  href={`/api/connect/google/start?hint=${encodeURIComponent(problem.identity)}`}
                  className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
                >
                  Reconnect
                </a>
              ) : (
                <Link href="/dashboard/accounts" className={cn(buttonVariants({ size: "sm", variant: "outline" }))}>
                  Open Accounts
                </Link>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {showChecklist ? (
        <section aria-label="Getting started" className="grid gap-3 rounded-xl border bg-card p-4">
          <h2 className="font-display text-base font-semibold">Get started</h2>
          <ul className="grid gap-3">
            <Step done={onboarding.accounts > 0} title="Connect a mailbox" text="Add Gmail, Hostinger or Zoho so Loopify can read your mail." href="/dashboard/accounts" cta="Connect" />
            <Step done={onboarding.emails > 0} title="Fetch your first mail" text="Press Sync now on the account. New mail is also fetched every 15 minutes." href="/dashboard/accounts" cta="Sync now" />
            <Step done={onboarding.analyzed > 0} title="Let the AI scan today's mail" text="Press Scan now below, or wait for the next automatic scan." />
          </ul>
        </section>
      ) : null}

      <section aria-label="Today in numbers" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard href="/dashboard/mail" label="New today" value={overview.newToday} icon={Inbox} />
        <StatCard href="/dashboard/needs-reply" label="Needs reply" value={overview.needsReply} icon={Reply} tone="alert" />
        <StatCard href="/dashboard/mail?priority=1" label="Priority 1" value={overview.highPriority} icon={Zap} tone="alert" />
        <StatCard href="/dashboard/mail?category=lead_reply" label="Leads replied" value={overview.leadReplies} icon={Sparkles} />
        <StatCard href="/dashboard/follow-ups" label="Follow-ups due" value={overview.followUpsDue} icon={CalendarClock} tone="alert" />
      </section>

      {total === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Nothing waiting today"
          text="Mail from today that still needs you will show up here, grouped by priority. Older mail is in the Mail page."
        >
          <Link href="/dashboard/mail" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-2")}>
            Open Mail
          </Link>
        </EmptyState>
      ) : (
        <div className="grid gap-6">
          <Group title="Priority 1: today" hint="needs you today" rows={groups.p1} timeZone={timeZone} />
          <Group title="Priority 2: soon" hint="handle soon" rows={groups.p2} timeZone={timeZone} />
          <Group title="Priority 3: later" hint="can wait" rows={groups.p3} timeZone={timeZone} />
          <Group title="Not scanned yet" hint="waiting for the AI scan" rows={groups.unscanned} timeZone={timeZone} />
        </div>
      )}
    </div>
  );
}
