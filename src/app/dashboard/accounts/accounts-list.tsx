import { MailPlus } from "lucide-react";
import { auth } from "@/core/auth";
import { getDb } from "@/core/db";
import { listAccounts } from "@/core/vault";
import {
  countEmailsByAccount,
  listRecentSyncRuns,
  type SyncRunSummary,
} from "@/modules/email-tracker/queries/emails";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountCard } from "./account-card";
import { ConnectedProviders } from "./connected-providers";

/** What the most recent check found. This is about new mail only, not the total stored. */
function describeLastRun(run: SyncRunSummary | undefined): string | null {
  if (!run) return null;
  if (run.status === "running") return "Checking now...";
  if (run.status === "error") return null; // the account's error message is shown instead
  return run.insertedCount === 0
    ? "No new mail"
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
    <div className="grid gap-6">
      <ConnectedProviders accounts={accounts} />

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
            <ul className="grid gap-4">
              {accounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  storedCount={storedCounts.get(account.id) ?? 0}
                  lastRun={describeLastRun(latestRun.get(account.id))}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
