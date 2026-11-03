import { eq } from "drizzle-orm";
import { auth } from "@/core/auth";
import { getDb } from "@/core/db";
import { tenants } from "@/core/db/schema";
import { DEFAULT_TIME_ZONE } from "@/core/lib/time";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TimeZoneForm } from "./timezone-form";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.tenantId) return null;

  const [tenant] = await getDb()
    .select({ timezone: tenants.timezone })
    .from(tenants)
    .where(eq(tenants.id, session.tenantId))
    .limit(1);
  const current = tenant?.timezone ?? DEFAULT_TIME_ZONE;
  // The current zone is always in the list, even if the runtime does not list it by that name.
  const zones = [...new Set([current, ...Intl.supportedValuesOf("timeZone")])].sort();

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="font-display text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Preferences for your workspace.</p>
      </header>

      <Card className="max-w-2xl">
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
    </div>
  );
}
