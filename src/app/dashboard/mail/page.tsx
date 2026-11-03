import { SearchX } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { auth } from "@/core/auth";
import { getDb } from "@/core/db";
import { EmptyState } from "@/components/mail/empty-state";
import { MailRowItem } from "@/components/mail/mail-row";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CATEGORY_LABELS } from "@/modules/email-tracker/ai/labels";
import { EMAIL_CATEGORIES } from "@/modules/email-tracker/ai/schema";
import { listAccountOptions, searchMail } from "@/modules/email-tracker/queries/dashboard";
import { filtersToQuery, parseMailFilters } from "@/modules/email-tracker/queries/filters";
import { getTodayWindow } from "@/modules/email-tracker/scan/scan-state";
import { MailSkeleton } from "../mail-skeleton";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const field =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

async function MailList({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  if (!session?.tenantId) return null;
  const raw = await searchParams;
  const filters = parseMailFilters(raw);
  const cursor = typeof raw.cursor === "string" ? raw.cursor : null;
  const db = getDb();
  const [page, accounts, { timeZone }] = await Promise.all([
    searchMail(db, session.tenantId, filters, cursor),
    listAccountOptions(db, session.tenantId),
    getTodayWindow(db, session.tenantId),
  ]);
  const hasFilters = Object.keys(filters).length > 0;

  return (
    <>
      {/* A plain GET form: it works without JavaScript and keeps the filters in the address. */}
      <form method="get" className="grid gap-3 rounded-xl border bg-card p-3">
        <input type="search" name="q" defaultValue={filters.query ?? ""} placeholder="Search sender, subject or text" aria-label="Search mail" className={field} />
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <select name="account" defaultValue={filters.accountId ?? ""} aria-label="Account" className={field}>
            <option value="">All accounts</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.identity}
              </option>
            ))}
          </select>
          <select name="category" defaultValue={filters.category ?? ""} aria-label="Category" className={field}>
            <option value="">All categories</option>
            {EMAIL_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABELS[category].label}
              </option>
            ))}
          </select>
          <select name="priority" defaultValue={filters.priority ? String(filters.priority) : ""} aria-label="Priority" className={field}>
            <option value="">Any priority</option>
            <option value="1">P1 Today</option>
            <option value="2">P2 Soon</option>
            <option value="3">P3 Later</option>
          </select>
          <select name="handled" defaultValue={filters.handled ?? ""} aria-label="Handled" className={field}>
            <option value="">Handled or not</option>
            <option value="no">Not handled</option>
            <option value="yes">Handled</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="unread" value="1" defaultChecked={filters.unreadOnly} className="size-4" />
            Unread only
          </label>
          <div className="flex items-center gap-2">
            {hasFilters ? (
              <Link href="/dashboard/mail" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                Clear
              </Link>
            ) : null}
            <Button type="submit" size="sm">
              Apply
            </Button>
          </div>
        </div>
      </form>

      {page.rows.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={hasFilters ? "No mail matches these filters" : "No mail yet"}
          text={hasFilters ? "Try fewer filters or a different search." : "Connect an account and press Sync now to see your mail here."}
        />
      ) : (
        <ul className="grid gap-2">
          {page.rows.map((mail) => (
            <MailRowItem key={mail.id} mail={mail} timeZone={timeZone} />
          ))}
        </ul>
      )}

      {page.nextCursor ? (
        <div className="flex justify-center">
          <Link href={`/dashboard/mail${filtersToQuery(filters, page.nextCursor)}`} className={cn(buttonVariants({ variant: "outline" }))}>
            Older mail
          </Link>
        </div>
      ) : null}
    </>
  );
}

export default function MailPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-4">
      <header className="grid gap-1">
        <h1 className="font-display text-2xl font-semibold">Mail</h1>
        <p className="text-sm text-muted-foreground">
          All your synced mail, newest first. The AI scans only today&apos;s mail; open an older email to analyze it on request.
        </p>
      </header>
      <Suspense fallback={<MailSkeleton rows={6} />}>
        <MailList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
