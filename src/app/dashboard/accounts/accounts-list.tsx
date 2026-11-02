import { MailPlus } from "lucide-react";
import { auth } from "@/core/auth";
import { getDb } from "@/core/db";
import { listAccounts } from "@/core/vault";
import {
  countEmailsByAccount,
  listRecentSyncRuns,
  type SyncRunSummary,
} from "@/modules/email-tracker/queries/emails";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DisconnectButton } from "./disconnect-button";
import { SyncNowButton } from "./sync-now-button";

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" });
const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/** What the most recent check found. This is about new mail only, not the total stored. */
function describeLastRun(run: SyncRunSummary | undefined): string | null {
  if (!run) return null;
  if (run.status === "running") return "checking now...";
  if (run.status === "error") return null; // the account's error message is shown instead
  return run.insertedCount === 0
    ? "no new mail"
    : `${run.insertedCount} new ${run.insertedCount === 1 ? "email" : "emails"}`;
}

/** The signed-in tenant's connected accounts. Shows metadata only, never any secret. */
export async function AccountsList() {
  const session = await auth();
  if (!session?.tenantId) return null;
  const db = getDb();
  const [accounts, runs, storedCounts] = await Promise.all([
    listAccounts(db, session.tenantId),
    listRecentSyncRuns(db, session.tenantId),
    countEmailsByAccount(db, session.tenantId),
  ]);
  // Runs are newest first, so the first one seen for an account is its latest.
  const latestRun = new Map<string, SyncRunSummary>();
  for (const run of runs) if (!latestRun.has(run.accountId)) latestRun.set(run.accountId, run);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg">Connected accounts</CardTitle>
        <CardDescription>
          {accounts.length === 0
            ? "Nothing is connected yet."
            : `${accounts.length} connected ${accounts.length === 1 ? "account" : "accounts"}. Mail is checked every 15 minutes.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {accounts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-10 text-center">
            <MailPlus className="size-8 text-muted-foreground" />
            <p className="font-medium">Connect your first mailbox</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Add a Hostinger or Zoho account below to start seeing what needs your reply.
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {accounts.map((account) => {
              const lastRun = describeLastRun(latestRun.get(account.id));
              const storedCount = storedCounts.get(account.id) ?? 0;
              return (
                <li key={account.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{account.label}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {account.identity} · added {dateFormat.format(account.createdAt)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {account.lastSyncedAt
                        ? `Last checked ${dateTimeFormat.format(account.lastSyncedAt)} UTC`
                        : "Not synced yet."}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {storedCount} {storedCount === 1 ? "email" : "emails"} stored
                      </span>
                      {lastRun ? ` · last check: ${lastRun}` : ""}
                    </p>
                    {account.status === "error" && account.statusMessage ? (
                      <p className="mt-1 text-sm text-destructive">{account.statusMessage}</p>
                    ) : null}
                  </div>
                  <Badge variant={account.status === "connected" ? "secondary" : "destructive"}>
                    {account.status === "connected" ? "Connected" : "Needs attention"}
                  </Badge>
                  <SyncNowButton accountId={account.id} />
                  <DisconnectButton accountId={account.id} label={account.label} />
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
