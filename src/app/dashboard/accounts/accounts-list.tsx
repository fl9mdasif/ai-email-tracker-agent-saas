import { MailPlus } from "lucide-react";
import { auth } from "@/core/auth";
import { getDb } from "@/core/db";
import { listAccounts } from "@/core/vault";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DisconnectButton } from "./disconnect-button";

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" });

/** The signed-in tenant's connected accounts. Shows metadata only, never any secret. */
export async function AccountsList() {
  const session = await auth();
  if (!session?.tenantId) return null;
  const accounts = await listAccounts(getDb(), session.tenantId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg">Connected accounts</CardTitle>
        <CardDescription>
          {accounts.length === 0
            ? "Nothing is connected yet."
            : `${accounts.length} connected ${accounts.length === 1 ? "account" : "accounts"}.`}
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
            {accounts.map((account) => (
              <li key={account.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{account.label}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {account.identity} · added {dateFormat.format(account.createdAt)}
                  </p>
                  {account.status === "error" && account.statusMessage ? (
                    <p className="mt-1 text-sm text-destructive">{account.statusMessage}</p>
                  ) : null}
                </div>
                <Badge variant={account.status === "connected" ? "secondary" : "destructive"}>
                  {account.status === "connected" ? "Connected" : "Needs attention"}
                </Badge>
                <DisconnectButton accountId={account.id} label={account.label} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
