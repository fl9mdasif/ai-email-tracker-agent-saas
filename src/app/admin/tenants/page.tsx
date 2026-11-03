import Link from "next/link";
import { Search } from "lucide-react";
import { Suspense } from "react";
import { getDb } from "@/core/db";
import { formatUsd } from "@/core/platform/costs";
import { requirePermission } from "@/core/platform/require-permission";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listTenantsOverview } from "@/modules/email-tracker/queries/admin";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" });

async function TenantTable({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission("tenants.view");
  const raw = await searchParams;
  const q = typeof raw.q === "string" ? raw.q.trim().slice(0, 100) : "";
  const rows = await listTenantsOverview(getDb(), { search: q || undefined });

  return (
    <div className="grid gap-4">
      <form method="get" className="flex max-w-md gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by workspace name or owner email"
          aria-label="Search workspaces"
          className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
        />
        <Button type="submit" size="sm">
          <Search className="size-3.5" />
          Search
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        {rows.length} {rows.length === 1 ? "workspace" : "workspaces"}
        {q ? ` matching "${q}"` : ""}. Leads are AI-detected: different senders of mail the AI marked &quot;Lead replied&quot;. Cost is an estimate.
      </p>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Workspace</th>
              <th className="px-3 py-2 font-medium">Plan</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Accounts</th>
              <th className="px-3 py-2 font-medium">Mail, 24 h</th>
              <th className="px-3 py-2 font-medium">Leads</th>
              <th className="px-3 py-2 font-medium">AI, 30 d</th>
              <th className="px-3 py-2 font-medium">Est. cost</th>
              <th className="px-3 py-2 font-medium">Last sign-in</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                  No workspaces match.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <Link href={`/admin/tenants/${row.id}`} className="font-medium hover:underline">
                      {row.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{row.ownerEmail ?? "no owner"}</p>
                  </td>
                  <td className="px-3 py-2">{row.planName ?? <span className="text-muted-foreground">none</span>}</td>
                  <td className="px-3 py-2">
                    {row.status === "suspended" ? (
                      <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-300">Suspended</span>
                    ) : (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">Active</span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{row.accounts}</td>
                  <td className="px-3 py-2 tabular-nums">{row.mailLast24h}</td>
                  <td className="px-3 py-2 tabular-nums">{row.leads}</td>
                  <td className="px-3 py-2 tabular-nums">{row.aiCalls30d}</td>
                  <td className="px-3 py-2 tabular-nums">{formatUsd(row.estCostUsd)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{row.lastLoginAt ? dateFormat.format(row.lastLoginAt) : "never"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AdminTenantsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="font-display text-2xl font-semibold">Workspaces</h1>
        <p className="text-sm text-muted-foreground">Every customer workspace. Counts and status only: never anyone&apos;s email text or passwords.</p>
      </header>
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
        <TenantTable searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
