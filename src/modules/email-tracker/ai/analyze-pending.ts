import { and, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import type { Database } from "@/core/db";
import { connectedAccounts } from "@/core/db/schema";
import type { ModelFailureReason } from "@/core/llm/gateway";
import { etEmailAnalysis, etEmails } from "../db/schema";
import { recordAiFollowUp } from "../queries/mutations";
import { getTodayWindow, isScanPaused } from "../scan/scan-state";
import { type AnalyzeEmailResult, analyzeEmail } from "./analyze-email";
import type { PromptEmail } from "./prompts";

/** Emails analyzed per run, so a run stays short and the model bill predictable. */
export const BATCH_SIZE = 20;
/** After this many failed attempts an email stays unanalyzed instead of being retried forever. */
export const MAX_ATTEMPTS = 3;

export type AnalyzeDeps = {
  analyze: (
    email: PromptEmail,
    context: { tenantId: string; mailboxOwner: string },
  ) => Promise<AnalyzeEmailResult>;
  /** Asked before each email: true when the user pressed Cancel. Defaults to reading the tenant's scan state. */
  isCancelled?: () => Promise<boolean>;
};

/** Failures of the service itself (not of one email): the run stops and no attempt is used up. */
const PAUSING_REASONS = new Set<ModelFailureReason>(["not_configured", "quota_exhausted", "auth_failed"]);

export type AnalyzePendingOutcome = {
  analyzed: number;
  failed: number;
  /** Set when the run stopped early: the AI service is unavailable, or the user pressed Cancel. */
  stoppedBecause: "not_configured" | "quota_exhausted" | "auth_failed" | "cancelled" | null;
};

const defaultDeps: AnalyzeDeps = { analyze: (email, context) => analyzeEmail(email, context) };

/**
 * Analyzes the tenant's inbound emails from today (in the tenant's own time zone) that have no
 * result yet, plus earlier failures that still have attempts left. Older mail is never scanned,
 * which keeps the model bill small. Results are stored per email, so running it twice never
 * analyzes the same email twice. One failing email never stops the others. Only this tenant's
 * mail is read, and only the AI gateway is called; the mailbox is never touched.
 */
export async function analyzePendingEmails(
  db: Database,
  tenantId: string,
  deps: AnalyzeDeps = defaultDeps,
  limit = BATCH_SIZE,
): Promise<AnalyzePendingOutcome> {
  const { startOfToday } = await getTodayWindow(db, tenantId);
  const isCancelled = deps.isCancelled ?? (() => isScanPaused(db, tenantId));

  const pending = await db
    .select({
      id: etEmails.id,
      fromAddress: etEmails.fromAddress,
      fromName: etEmails.fromName,
      to: etEmails.toAddresses,
      subject: etEmails.subject,
      bodyText: etEmails.bodyText,
      receivedAt: etEmails.receivedAt,
      mailboxOwner: connectedAccounts.identity,
      previousAttempts: etEmailAnalysis.attempts,
    })
    .from(etEmails)
    .innerJoin(
      connectedAccounts,
      and(eq(connectedAccounts.id, etEmails.accountId), eq(connectedAccounts.tenantId, tenantId)),
    )
    .leftJoin(etEmailAnalysis, eq(etEmailAnalysis.emailId, etEmails.id))
    .where(
      and(
        eq(etEmails.tenantId, tenantId),
        eq(etEmails.direction, "inbound"),
        gte(etEmails.receivedAt, startOfToday),
        or(
          isNull(etEmailAnalysis.id),
          and(eq(etEmailAnalysis.status, "failed"), lt(etEmailAnalysis.attempts, MAX_ATTEMPTS)),
        ),
      ),
    )
    .orderBy(desc(etEmails.receivedAt))
    .limit(limit);

  const outcome: AnalyzePendingOutcome = { analyzed: 0, failed: 0, stoppedBecause: null };

  for (const row of pending) {
    // Cancel is honoured between emails; the one call already in flight is allowed to finish.
    if (await isCancelled()) {
      outcome.stoppedBecause = "cancelled";
      break;
    }

    const result = await deps.analyze(
      {
        fromAddress: row.fromAddress,
        fromName: row.fromName,
        to: row.to,
        subject: row.subject,
        bodyText: row.bodyText,
        receivedAt: row.receivedAt,
      },
      { tenantId, mailboxOwner: row.mailboxOwner },
    );

    if (!result.ok && PAUSING_REASONS.has(result.reason)) {
      // No key, no credits or a rejected key: every email would fail the same way, so do not
      // use up their attempts. Stop here; the next run picks the same emails up again.
      outcome.stoppedBecause = result.reason as NonNullable<AnalyzePendingOutcome["stoppedBecause"]>;
      break;
    }

    if (result.ok) {
      await storeResult(db, tenantId, row.id, {
        status: "analyzed",
        category: result.analysis.category,
        priority: result.analysis.priority,
        needsReply: result.analysis.needs_reply,
        summary: result.analysis.summary,
        suggestedAction: result.analysis.suggested_action,
        model: result.model,
        error: null,
      });
      // A mail the AI says needs a follow-up also shows up on the Follow-ups page.
      if (result.analysis.category === "follow_up_needed") {
        await recordAiFollowUp(db, tenantId, row.id, result.analysis.suggested_action);
      }
      outcome.analyzed += 1;
    } else {
      await storeResult(db, tenantId, row.id, {
        status: "failed",
        category: null,
        priority: null,
        needsReply: null,
        summary: null,
        suggestedAction: null,
        model: null,
        error: result.message,
      });
      outcome.failed += 1;
    }
  }

  return outcome;
}

type StoredResult = {
  status: "analyzed" | "failed";
  category: "needs_reply" | "follow_up_needed" | "lead_reply" | "invoice_or_payment" | "newsletter_or_promo" | "fyi_only" | "spam" | null;
  priority: number | null;
  needsReply: boolean | null;
  summary: string | null;
  suggestedAction: string | null;
  model: string | null;
  error: string | null;
};

async function storeResult(db: Database, tenantId: string, emailId: string, result: StoredResult): Promise<void> {
  await db
    .insert(etEmailAnalysis)
    .values({ tenantId, emailId, attempts: 1, ...result })
    .onConflictDoUpdate({
      target: etEmailAnalysis.emailId,
      set: { ...result, attempts: sql`${etEmailAnalysis.attempts} + 1`, updatedAt: new Date() },
      setWhere: eq(etEmailAnalysis.tenantId, tenantId),
    });
}
