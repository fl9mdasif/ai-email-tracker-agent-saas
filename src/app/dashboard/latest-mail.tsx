import { Inbox, PauseCircle, Sparkles } from "lucide-react";
import Link from "next/link";
import { auth } from "@/core/auth";
import { getDb } from "@/core/db";
import { CATEGORY_LABELS, PRIORITY_LABELS } from "@/modules/email-tracker/ai/labels";
import { getAnalysisSummary, type AnalysisSummary } from "@/modules/email-tracker/queries/analysis";
import { listLatestEmails } from "@/modules/email-tracker/queries/emails";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function AnalysisNotice({ summary }: { summary: AnalysisSummary }) {
  if (summary.problem) {
    return (
      <div role="status" className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
        <PauseCircle className="mt-0.5 size-4 shrink-0" />
        <p>
          {summary.problem === "quota_exhausted"
            ? "AI analysis is paused: the AI account has no credits left. Add credits and it resumes by itself."
            : "AI analysis is paused: the AI service rejected the API key. Check the key and it resumes by itself."}
          {summary.waiting > 0 && ` ${summary.waiting} email${summary.waiting === 1 ? " is" : "s are"} waiting.`}
        </p>
      </div>
    );
  }
  if (summary.waiting > 0) {
    return (
      <div role="status" className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Sparkles className="size-4 shrink-0" />
        <p>
          {summary.waiting} email{summary.waiting === 1 ? " is" : "s are"} waiting for AI analysis.
        </p>
      </div>
    );
  }
  return null;
}

/** The newest synced mail with what the AI made of each email. The full prioritised dashboard comes in Milestone 5. */
export async function LatestMail() {
  const session = await auth();
  if (!session?.tenantId) return null;
  const db = getDb();
  const [emails, summary] = await Promise.all([
    listLatestEmails(db, session.tenantId, 20),
    getAnalysisSummary(db, session.tenantId),
  ]);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="font-display text-lg">Latest mail</CardTitle>
        <CardDescription>
          {emails.length === 0 ? "No mail has been synced yet." : "Your 20 newest emails from all connected accounts."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <AnalysisNotice summary={summary} />
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
            {emails.map((email) => {
              const category = email.analysis ? CATEGORY_LABELS[email.analysis.category] : null;
              const priority = email.analysis ? PRIORITY_LABELS[email.analysis.priority] : null;
              return (
                <li key={email.id} className="grid gap-1 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className={cn("truncate text-sm", email.status === "unread" && "font-semibold")}>
                      {email.fromName ?? email.fromAddress}
                    </p>
                    <p className="shrink-0 text-xs text-muted-foreground">{timeFormat.format(email.receivedAt)} UTC</p>
                  </div>
                  <p className={cn("truncate text-sm", email.status === "unread" ? "font-medium" : "")}>
                    {email.subject || "(no subject)"}
                  </p>
                  {email.analysis && category ? (
                    <div className="grid gap-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", category.chip)}>
                          {category.label}
                        </span>
                        {priority && (
                          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", priority.chip)}>
                            {priority.label}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{email.analysis.summary}</p>
                      <p className="text-sm">
                        <span className="font-medium">Next: </span>
                        {email.analysis.suggestedAction}
                      </p>
                    </div>
                  ) : (
                    <p className="truncate text-sm text-muted-foreground">{email.snippet}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
