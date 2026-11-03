import { AlertTriangle, CheckCircle2, Clock, Loader2, PauseCircle, Square } from "lucide-react";
import { auth } from "@/core/auth";
import { getDb } from "@/core/db";
import { formatInterval, getScanIntervalMinutes } from "@/core/settings/platform";
import { cn } from "@/lib/utils";
import { type AnalysisSummary, getAnalysisSummary } from "@/modules/email-tracker/queries/analysis";
import { type ScanStatus, getScanStatus } from "@/modules/email-tracker/scan/scan-state";
import { AutoRefresh } from "./auto-refresh";
import { CancelScanButton, ScanNowButton } from "./scan-controls";

const noticeBase = "rounded-lg border p-3 text-sm";

function Notice({ summary, scan, intervalLabel }: { summary: AnalysisSummary; scan: ScanStatus; intervalLabel: string }) {
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

/** The AI scan status for today's mail: progress with Cancel, paused, waiting, done, or a problem. */
export async function ScanNotice() {
  const session = await auth();
  if (!session?.tenantId) return null;
  const db = getDb();
  const [summary, scan, intervalMinutes] = await Promise.all([
    getAnalysisSummary(db, session.tenantId),
    getScanStatus(db, session.tenantId),
    getScanIntervalMinutes(db),
  ]);

  return (
    <>
      <AutoRefresh active={summary.waiting > 0 && scan.startedRecently && !scan.paused && !summary.problem} />
      <Notice summary={summary} scan={scan} intervalLabel={formatInterval(intervalMinutes)} />
    </>
  );
}
