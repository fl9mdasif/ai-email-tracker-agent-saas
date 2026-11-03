import { Suspense } from "react";
import { getDb } from "@/core/db";
import { requirePermission } from "@/core/platform/require-permission";
import { SCAN_INTERVAL_OPTIONS_MINUTES, formatInterval, getScanIntervalInfo } from "@/core/settings/platform";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { IntervalForm } from "../interval-form";

const updatedFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

const options = SCAN_INTERVAL_OPTIONS_MINUTES.map((minutes) => ({ minutes, label: formatInterval(minutes) }));

async function SettingsContent() {
  await requirePermission("settings.manage");
  const info = await getScanIntervalInfo(getDb());

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="font-display text-2xl font-semibold">Platform settings</h1>
        <p className="text-sm text-muted-foreground">Settings that apply to every workspace.</p>
      </header>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="font-display text-lg">AI scan interval</CardTitle>
          <CardDescription>
            How often the AI scans each workspace&apos;s mail from today. Older mail is never scanned, which keeps AI credit use low. A shorter
            interval means fresher results and more credits used. Mail itself is still fetched every 15 minutes.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <IntervalForm options={options} current={info.minutes} />
          <p className="text-xs text-muted-foreground">
            {info.updatedAt && info.updatedBy
              ? `Last changed by ${info.updatedBy} on ${updatedFormat.format(info.updatedAt)} UTC.`
              : "Using the default of 1 hour. Nobody has changed it yet."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminSettingsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
      <SettingsContent />
    </Suspense>
  );
}
