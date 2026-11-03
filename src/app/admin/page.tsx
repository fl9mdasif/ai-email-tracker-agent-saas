import { getDb } from "@/core/db";
import { SCAN_INTERVAL_OPTIONS_MINUTES, formatInterval, getScanIntervalInfo } from "@/core/settings/platform";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IntervalForm } from "./interval-form";

const updatedFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

const options = SCAN_INTERVAL_OPTIONS_MINUTES.map((minutes) => ({ minutes, label: formatInterval(minutes) }));

export default async function AdminPage() {
  const info = await getScanIntervalInfo(getDb());

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="font-display text-2xl font-semibold">Platform dashboard</h1>
        <p className="text-sm text-muted-foreground">Settings that apply to every tenant. Only super admins can see this page.</p>
      </header>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="font-display text-lg">AI scan interval</CardTitle>
          <CardDescription>
            How often the AI scans each tenant&apos;s mail from today. Older mail is never scanned, which keeps AI credit use
            low. A shorter interval means fresher results and more credits used. Mail itself is still fetched every 15 minutes.
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
