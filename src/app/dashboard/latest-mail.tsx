import { Inbox } from "lucide-react";
import Link from "next/link";
import { auth } from "@/core/auth";
import { getDb } from "@/core/db";
import { listLatestEmails } from "@/modules/email-tracker/queries/emails";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/** A plain list of the newest synced mail. The real prioritised dashboard comes in Milestone 5. */
export async function LatestMail() {
  const session = await auth();
  if (!session?.tenantId) return null;
  const emails = await listLatestEmails(getDb(), session.tenantId, 20);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="font-display text-lg">Latest mail</CardTitle>
        <CardDescription>
          {emails.length === 0 ? "No mail has been synced yet." : "Your 20 newest emails from all connected accounts."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {emails.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-10 text-center">
            <Inbox className="size-8 text-muted-foreground" />
            <p className="max-w-sm text-sm text-muted-foreground">
              Connect a mailbox and run a sync to see your mail here.
            </p>
            <Link href="/dashboard/accounts" className={cn(buttonVariants({ size: "lg" }))}>
              Go to Accounts
            </Link>
          </div>
        ) : (
          <ul className="divide-y">
            {emails.map((email) => (
              <li key={email.id} className="grid gap-0.5 py-3 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <p className={cn("truncate text-sm", email.status === "unread" && "font-semibold")}>
                    {email.fromName ?? email.fromAddress}
                  </p>
                  <p className="shrink-0 text-xs text-muted-foreground">{timeFormat.format(email.receivedAt)} UTC</p>
                </div>
                <p className={cn("truncate text-sm", email.status === "unread" ? "font-medium" : "")}>
                  {email.subject || "(no subject)"}
                </p>
                <p className="truncate text-sm text-muted-foreground">{email.snippet}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
