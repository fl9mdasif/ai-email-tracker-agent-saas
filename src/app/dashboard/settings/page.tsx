import { Download } from "lucide-react";
import { eq } from "drizzle-orm";
import { auth } from "@/core/auth";
import { getDb } from "@/core/db";
import { tenants } from "@/core/db/schema";
import { DEFAULT_TIME_ZONE } from "@/core/lib/time";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getAiUsage } from "@/modules/email-tracker/queries/usage";
import { DeleteWorkspace } from "./delete-workspace";
import { TimeZoneForm } from "./timezone-form";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.tenantId) return null;
  const db = getDb();

  const [[tenant], usage] = await Promise.all([
    db.select({ name: tenants.name, timezone: tenants.timezone }).from(tenants).where(eq(tenants.id, session.tenantId)).limit(1),
    getAiUsage(db, session.tenantId),
  ]);
  const current = tenant?.timezone ?? DEFAULT_TIME_ZONE;
  // The current zone is always in the list, even if the runtime does not list it by that name.
  const zones = [...new Set([current, ...Intl.supportedValuesOf("timeZone")])].sort();

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <header className="grid gap-1">
        <h1 className="font-display text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Preferences and data for your workspace.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">Time zone</CardTitle>
          <CardDescription>
            Decides where &quot;today&quot; starts. The AI scans only mail received today in this time zone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TimeZoneForm zones={zones} current={current} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">AI usage</CardTitle>
          <CardDescription>How many emails the AI has analyzed for you. Each one is a single AI call.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">Today</dt>
              <dd className="font-display text-2xl font-semibold tabular-nums">{usage.today}</dd>
            </div>
            <div>
              <dt className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">Last 30 days</dt>
              <dd className="font-display text-2xl font-semibold tabular-nums">{usage.last30Days}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">Your data</CardTitle>
          <CardDescription>
            Download a copy of your workspace: accounts (never passwords), mail, AI results, follow-ups and your chat, as one JSON file.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* A plain link so the browser downloads the file. */}
          <a href="/api/export" className={cn(buttonVariants({ variant: "outline" }))}>
            <Download className="size-4" />
            Export my data
          </a>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="font-display text-lg text-destructive">Delete my workspace</CardTitle>
          <CardDescription>
            This removes your workspace, every connected account, all synced mail, your chat and everything the AI made of it. Gmail access is
            cancelled with Google. It cannot be undone. Export your data first if you want a copy.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteWorkspace workspaceName={tenant?.name ?? ""} />
        </CardContent>
      </Card>
    </div>
  );
}
