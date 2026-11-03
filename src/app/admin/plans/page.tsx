import { Suspense } from "react";
import { getDb } from "@/core/db";
import { can } from "@/core/platform/permissions";
import { listPlansWithUsage } from "@/core/platform/plans";
import { estimateMonthlyRevenue, formatMoney } from "@/core/platform/plans-pure";
import { requirePermission } from "@/core/platform/require-permission";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DefaultButton } from "./default-button";
import { PlanForm } from "./plan-form";

async function Plans() {
  const actor = await requirePermission("plans.view");
  const canManage = can(actor.role, "plans.manage");
  const plans = await listPlansWithUsage(getDb());
  const revenue = estimateMonthlyRevenue(plans, plans.map((plan) => ({ planId: plan.id, tenants: plan.tenants })));
  const paying = plans.filter((plan) => plan.priceMonthlyCents > 0).reduce((sum, plan) => sum + plan.tenants, 0);
  const activeWorkspaces = plans.reduce((sum, plan) => sum + plan.tenants, 0);

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="font-display text-2xl font-semibold">Plans and pricing</h1>
        <p className="text-sm text-muted-foreground">
          What each plan costs and allows. Plans set limits and a price only: nothing here takes a payment. {canManage ? "" : "You can view plans but not change them."}
        </p>
      </header>

      <section aria-label="Estimated revenue" className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="font-mono text-[11px] font-normal tracking-wider text-muted-foreground uppercase">Estimated per month</CardTitle>
          </CardHeader>
          <CardContent>
            {revenue.length === 0 ? (
              <p className="font-display text-3xl font-semibold">{formatMoney(0, "USD")}</p>
            ) : (
              revenue.map((entry) => (
                <p key={entry.currency} className="font-display text-3xl font-semibold tabular-nums">
                  {formatMoney(entry.monthlyCents, entry.currency)}
                </p>
              ))
            )}
            <p className="text-xs text-muted-foreground">each active workspace at its plan price</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="font-mono text-[11px] font-normal tracking-wider text-muted-foreground uppercase">On a paid plan</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-semibold tabular-nums">{paying}</p>
            <p className="text-xs text-muted-foreground">of {activeWorkspaces} active workspaces</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="font-mono text-[11px] font-normal tracking-wider text-muted-foreground uppercase">Plans</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-3xl font-semibold tabular-nums">{plans.length}</p>
            <p className="text-xs text-muted-foreground">{plans.filter((plan) => plan.active).length} available to assign</p>
          </CardContent>
        </Card>
      </section>

      <section aria-label="Plans" className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Plan</th>
              <th className="px-3 py-2 font-medium">Price / month</th>
              <th className="px-3 py-2 font-medium">Accounts</th>
              <th className="px-3 py-2 font-medium">AI / day</th>
              <th className="px-3 py-2 font-medium">Workspaces</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {plans.map((plan) => (
              <tr key={plan.id}>
                <td className="px-3 py-2">
                  <span className="font-medium">{plan.name}</span> <span className="text-xs text-muted-foreground">{plan.key}</span>
                  {plan.isDefault ? <span className="ml-2 rounded-full bg-brand/15 px-2 py-0.5 text-xs font-medium text-brand dark:text-brand-light">Default</span> : null}
                  {!plan.active ? <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Off</span> : null}
                </td>
                <td className="px-3 py-2 tabular-nums">{formatMoney(plan.priceMonthlyCents, plan.currency)}</td>
                <td className="px-3 py-2 tabular-nums">{plan.maxAccounts}</td>
                <td className="px-3 py-2 tabular-nums">{plan.dailyAiLimit.toLocaleString("en-US")}</td>
                <td className="px-3 py-2 tabular-nums">{plan.tenants}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {canManage ? (
        <>
          <section aria-label="Edit plans" className="grid gap-3">
            <h2 className="font-display text-lg font-semibold">Edit a plan</h2>
            {plans.map((plan) => (
              <details key={plan.id} className="rounded-xl border bg-card p-4">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                  <span className="font-medium">
                    {plan.name} <span className="text-xs font-normal text-muted-foreground">{plan.key}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">Open to edit</span>
                </summary>
                <div className="mt-4 grid gap-4">
                  <PlanForm plan={plan} />
                  {!plan.isDefault && plan.active ? <DefaultButton planId={plan.id} /> : null}
                </div>
              </details>
            ))}
          </section>

          <Card className="max-w-3xl">
            <CardHeader>
              <CardTitle className="font-display text-lg">New plan</CardTitle>
              <CardDescription>It starts switched on but is not the default until you make it so.</CardDescription>
            </CardHeader>
            <CardContent>
              <PlanForm />
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

export default function AdminPlansPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
      <Plans />
    </Suspense>
  );
}
