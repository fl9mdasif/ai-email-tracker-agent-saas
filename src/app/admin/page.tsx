import { Suspense } from "react";
import Link from "next/link";
import { getDb } from "@/core/db";
import { ROLE_LABELS } from "@/core/platform/permissions";
import { requirePermission } from "@/core/platform/require-permission";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getPlatformTotals } from "@/modules/email-tracker/queries/admin";

function Stat({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: "alert" }) {
  return (
    <Card className={tone === "alert" && value > 0 ? "border-red-500/40" : undefined}>
      <CardHeader className="pb-1">
        <CardTitle className="font-mono text-[11px] font-normal tracking-wider text-muted-foreground uppercase">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="font-display text-3xl font-semibold tabular-nums">{value}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

async function Overview() {
  const actor = await requirePermission("overview.view");
  const totals = await getPlatformTotals(getDb());

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="font-display text-2xl font-semibold">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as {actor.email} ({ROLE_LABELS[actor.role]}). Counts only: you never see anyone&apos;s email text or passwords.
        </p>
      </header>

      <section aria-label="Workspaces" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Workspaces" value={totals.tenants} hint={`${totals.newTenants7d} new this week`} />
        <Stat label="Active, 7 days" value={totals.activeTenants7d} hint="someone signed in" />
        <Stat label="Connected accounts" value={totals.accounts} />
        <Stat label="Accounts in error" value={totals.accountsInError} hint="need reconnecting or fixing" tone="alert" />
      </section>

      <section aria-label="Mail and AI, last 24 hours" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Mail stored" value={totals.emailsStored} />
        <Stat label="New mail, 24 h" value={totals.emailsLast24h} />
        <Stat label="AI analyses, 24 h" value={totals.analysesOkLast24h} hint="successful" />
        <Stat label="AI failures, 24 h" value={totals.analysesFailedLast24h} tone="alert" />
      </section>

      <p className="text-sm text-muted-foreground">
        More sections arrive in the next steps: tenants, plans and pricing, leads, usage and cost, health, staff and the audit log. The AI scan
        interval is under{" "}
        <Link href="/admin/settings" className="underline underline-offset-4">
          Settings
        </Link>
        .
      </p>
    </div>
  );
}

export default function AdminOverviewPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
      <Overview />
    </Suspense>
  );
}
