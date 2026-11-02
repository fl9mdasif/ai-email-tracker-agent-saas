import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { desc } from "drizzle-orm";
import type { Database } from "@/core/db";
import { connectedAccounts } from "@/core/db/schema";
import { etEmailAnalysis, etEmails } from "../db/schema";
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
};

export type AnalyzePendingOutcome = {
  analyzed: number;
  failed: number;
  /** True when the run stopped early because the AI service is not set up. */
  stoppedNotConfigured: boolean;
};

const defaultDeps: AnalyzeDeps = { analyze: (email, context) => analyzeEmail(email, context) };

/**
 * Analyzes the tenant's newest inbound emails that have no result yet, plus earlier failures
 * that still have attempts left. Results are stored per email, so running it twice never
 * analyzes the same email twice. One failing email never stops the others. Only this tenant's
 * mail is read, and only the AI gateway is called; the mailbox is never touched.
 */
export async function analyzePendingEmails(
  db: Database,
  tenantId: string,
  deps: AnalyzeDeps = defaultDeps,
  limit = BATCH_SIZE,
): Promise<AnalyzePendingOutcome> {
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
        or(
          isNull(etEmailAnalysis.id),
          and(eq(etEmailAnalysis.status, "failed"), lt(etEmailAnalysis.attempts, MAX_ATTEMPTS)),
        ),
      ),
    )
    .orderBy(desc(etEmails.receivedAt))
    .limit(limit);

  const outcome: AnalyzePendingOutcome = { analyzed: 0, failed: 0, stoppedNotConfigured: false };

  for (const row of pending) {
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

    if (!result.ok && result.reason === "not_configured") {
      // No key or model: do not burn attempts on every email, just stop and report it.
      outcome.stoppedNotConfigured = true;
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
