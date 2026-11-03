import { AlertTriangle, CheckCircle2, Clock, Inbox, Loader2, PauseCircle, Square } from "lucide-react";
import Link from "next/link";
import { auth } from "@/core/auth";
import { getDb } from "@/core/db";
import { formatInterval, getScanIntervalMinutes } from "@/core/settings/platform";
import { CATEGORY_LABELS, PRIORITY_LABELS } from "@/modules/email-tracker/ai/labels";
import { getAnalysisSummary, type AnalysisSummary } from "@/modules/email-tracker/queries/analysis";
import { listLatestEmails } from "@/modules/email-tracker/queries/emails";
import { getScanStatus, type ScanStatus } from "@/modules/email-tracker/scan/scan-state";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AutoRefresh } from "./auto-refresh";
import { CancelScanButton, ScanNowButton } from "./scan-controls";

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

type NoticeProps = {
  summary: AnalysisSummary;
  scan: ScanStatus;
  intervalLabel: string;
};

const noticeBase = "rounded-lg border p-3 text-sm";

function AnalysisNotice({ summary, scan, intervalLabel }: NoticeProps) {
  if (summary.problem) {
    return (
      <div role="status" className={cn(noticeBase, "flex items-start gap-2 border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300")}>
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

  const total = summary.analyzed + summary.waiting + summary.gaveUp;

  if (scan.paused) {
    return (
      <div role="status" className={cn(noticeBase, "flex flex-wrap items-center justify-between gap-3 bg-muted/40 text-muted-foreground")}>
        <div className="flex items-center gap-2">
          <Square className="size-4 shrink-0" />
          <p>
            Scanning stopped.
            {summary.waiting > 0
              ? ` ${summary.waiting} email${summary.waiting === 1 ? "" : "s"} from ${scan.todayLabel} ${summary.waiting === 1 ? "was" : "were"} not scanned.`
              : ""}{" "}
            Automatic scans are off until you press Scan now.
          </p>
        </div>
        <ScanNowButton />
      </div>
    );
  }

  if (summary.waiting > 0 && scan.startedRecently) {
    const percent = total === 0 ? 0 : Math.round((summary.analyzed / total) * 100);
    return (
      <div role="status" className={cn(noticeBase, "grid gap-2 bg-muted/40 text-muted-foreground")}>
        <div className="flex items-start gap-2">
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
          <div>
            <p className="font-medium text-foreground">
              Scanning your mail <span className="font-normal text-muted-foreground">· {scan.todayLabel}</span>
            </p>
            <p>
              {summary.analyzed} of {total} done · {summary.waiting} left
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
          </div>
          <CancelScanButton />
        </div>
      </div>
    );
  }

  if (summary.waiting > 0) {
    return (
      <div role="status" className={cn(noticeBase, "flex flex-wrap items-center justify-between gap-3 bg-muted/40 text-muted-foreground")}>
        <div className="flex items-center gap-2">
          <Clock className="size-4 shrink-0" />
          <p>
            {summary.waiting} email{summary.waiting === 1 ? "" : "s"} from {scan.todayLabel} will be scanned at the next
            automatic scan (every {intervalLabel}).
          </p>
        </div>
        <ScanNowButton />
      </div>
    );
  }

  if (summary.gaveUp > 0) {
    return (
      <div role="status" className={cn(noticeBase, "flex items-center gap-2 border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300")}>
        <AlertTriangle className="size-4 shrink-0" />
        <p>
          AI scan finished: {summary.analyzed} analyzed, {summary.gaveUp} could not be analyzed after 3 tries.
        </p>
      </div>
    );
  }

  return (
    <div role="status" className={cn(noticeBase, "flex flex-wrap items-center justify-between gap-3 border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300")}>
      <div className="flex items-center gap-2">
        <CheckCircle2 className="size-4 shrink-0" />
        <p>
          {summary.analyzed > 0
            ? `All ${summary.analyzed} email${summary.analyzed === 1 ? "" : "s"} from ${scan.todayLabel} ${summary.analyzed === 1 ? "is" : "are"} scanned.`
            : `No mail from ${scan.todayLabel} to scan yet.`}{" "}
          Scanned automatically every {intervalLabel}.
        </p>
      </div>
      <ScanNowButton />
    </div>
  );
}

/** The newest synced mail with what the AI made of each email. The full prioritised dashboard comes in Milestone 5. */
export async function LatestMail() {
  const session = await auth();
  if (!session?.tenantId) return null;
  const db = getDb();
  const [emails, summary, scan, intervalMinutes] = await Promise.all([
    listLatestEmails(db, session.tenantId, 20),
    getAnalysisSummary(db, session.tenantId),
    getScanStatus(db, session.tenantId),
    getScanIntervalMinutes(db),
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
        <AutoRefresh active={summary.waiting > 0 && scan.startedRecently && !scan.paused && !summary.problem} />
        <AnalysisNotice summary={summary} scan={scan} intervalLabel={formatInterval(intervalMinutes)} />
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
