import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getDb } from "@/core/db";
import { formatUsd } from "@/core/platform/costs";
import { can } from "@/core/platform/permissions";
import { getPlan, listPlansWithUsage } from "@/core/platform/plans";
import { requirePermission } from "@/core/platform/require-permission";
import { listTenantModules } from "@/core/platform/tenant-admin";
import { BarChart } from "@/components/charts/bar-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { getTenantDetail } from "@/modules/email-tracker/queries/admin";
import { TenantControls } from "../tenant-controls";

const dateTime = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className="font-display text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

async function TenantDetailView({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePermission("tenants.view");
  const { id } = await params;
  const db = getDb();
  const tenant = await getTenantDetail(db, id);
  if (!tenant) notFound();

  const [plans, modules, ownPlan] = await Promise.all([listPlansWithUsage(db), listTenantModules(db, id), tenant.planId ? getPlan(db, tenant.planId) : Promise.resolve(null)]);
  const permissions = { manage: can(actor.role, "tenants.manage"), act: can(actor.role, "health.act"), delete: can(actor.role, "tenants.delete") };

  return (
    <div className="grid gap-6">
      <Link href="/admin/tenants" className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        All workspaces
      </Link>

      <header className="grid gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-semibold break-words">{tenant.name}</h1>
          {tenant.status === "suspended" ? (
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-300">Suspended</span>
          ) : (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">Active</span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {tenant.ownerEmail ?? "no owner"} · {tenant.planName ?? "no plan"} · time zone {tenant.timezone} · created {dateTime.format(tenant.createdAt)} UTC · last sign-in{" "}
          {tenant.lastLoginAt ? `${dateTime.format(tenant.lastLoginAt)} UTC` : "never"}
        </p>
      </header>

      <section aria-label="Numbers" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Accounts" value={tenant.accounts} />
        <Stat label="Mail stored" value={tenant.mailStored} />
        <Stat label="Mail, 24 h" value={tenant.mailLast24h} />
        <Stat label="Leads" value={tenant.leads} hint="AI-detected" />
        <Stat label="AI, 30 days" value={tenant.aiCalls30d} />
        <Stat label="Est. cost" value={formatUsd(tenant.estCostUsd)} hint="30 days" />
      </section>

      <BarChart title="AI analyses per day, last 30 days" unit="analyses" data={tenant.aiByDay.map((entry) => ({ label: entry.day, value: entry.calls }))} />

      <TenantControls
        tenantId={tenant.id}
        tenantName={tenant.name}
        status={tenant.status}
        planId={tenant.planId}
        plans={plans.filter((plan) => plan.active || plan.id === tenant.planId).map((plan) => ({ id: plan.id, name: plan.name }))}
        aiLimitOverride={tenant.aiDailyLimit}
        planAiLimit={ownPlan?.dailyAiLimit ?? null}
        modules={modules}
        scanPaused={tenant.scan.paused}
        isOwnTenant={actor.tenantId === tenant.id}
        can={permissions}
      />

      <section aria-label="Connected accounts" className="grid gap-2">
        <h2 className="font-display text-lg font-semibold">Connected accounts</h2>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Address</th>
                <th className="px-3 py-2 font-medium">Provider</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Last synced</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tenant.accountList.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                    No accounts connected.
                  </td>
                </tr>
              ) : (
                tenant.accountList.map((account) => (
                  <tr key={account.id}>
                    <td className="px-3 py-2">{account.identity}</td>
                    <td className="px-3 py-2">{account.provider}</td>
                    <td className="px-3 py-2">
                      {account.status === "connected" ? (
                        <span className="text-emerald-700 dark:text-emerald-300">Active</span>
                      ) : (
                        <span className="text-destructive">Needs attention{account.statusMessage ? `: ${account.statusMessage}` : ""}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{account.lastSyncedAt ? `${dateTime.format(account.lastSyncedAt)} UTC` : "not yet"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-label="Recent syncs" className="grid gap-2">
        <h2 className="font-display text-lg font-semibold">Recent syncs</h2>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Account</th>
                <th className="px-3 py-2 font-medium">Result</th>
                <th className="px-3 py-2 font-medium">Fetched / new</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tenant.recentRuns.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                    No syncs yet.
                  </td>
                </tr>
              ) : (
                tenant.recentRuns.map((run, index) => (
                  <tr key={`${run.startedAt.toISOString()}-${index}`}>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{dateTime.format(run.startedAt)} UTC</td>
                    <td className="px-3 py-2">{run.account}</td>
                    <td className="px-3 py-2">{run.status === "error" ? <span className="text-destructive">Error: {run.error ?? "unknown"}</span> : run.status === "running" ? "Running" : "Success"}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {run.fetched} / {run.inserted}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default function AdminTenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
      <TenantDetailView params={params} />
    </Suspense>
  );
}
