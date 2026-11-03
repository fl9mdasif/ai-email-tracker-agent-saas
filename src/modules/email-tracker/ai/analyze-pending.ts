import { and, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import type { Database } from "@/core/db";
import { connectedAccounts } from "@/core/db/schema";
import type { ModelFailureReason } from "@/core/llm/gateway";
import { type LeadTemperature, etEmailAnalysis, etEmails } from "../db/schema";
import { upsertLeadFromAnalysis } from "../queries/leads";
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
      await saveAnalysis(db, tenantId, row.id, result);
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
        leadTemperature: null,
        leadReason: null,
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
  leadTemperature: LeadTemperature | null;
  leadReason: string | null;
  error: string | null;
};

/**
 * Stores a successful analysis and what follows from it: a "follow-up needed" mail shows up on
 * the Follow-ups page, and a prospect's mail updates their lead.
 */
async function saveAnalysis(db: Database, tenantId: string, emailId: string, result: Extract<AnalyzeEmailResult, { ok: true }>): Promise<void> {
  const { analysis } = result;
  const leadTemperature = analysis.lead_temperature === "none" ? null : analysis.lead_temperature;
  await storeResult(db, tenantId, emailId, {
    status: "analyzed",
    category: analysis.category,
    priority: analysis.priority,
    needsReply: analysis.needs_reply,
    summary: analysis.summary,
    suggestedAction: analysis.suggested_action,
    model: result.model,
    leadTemperature,
    leadReason: leadTemperature ? analysis.lead_reason : null,
    error: null,
  });
  if (analysis.category === "follow_up_needed") {
    await recordAiFollowUp(db, tenantId, emailId, analysis.suggested_action);
  }
  if (leadTemperature) {
    await upsertLeadFromAnalysis(db, tenantId, emailId, leadTemperature, analysis.lead_reason);
  }
}

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

/** Most lead replies scored by one press of "Score older leads". */
export const SCORE_OLDER_LIMIT = 50;
const SCORE_OLDER_DAYS = 30;

export type ScoreOlderOutcome = { scored: number; failed: number; stoppedBecause: "not_configured" | "quota_exhausted" | "auth_failed" | null };

/**
 * Scores lead replies from the last 30 days that were analysed before lead scoring existed.
 * Each one is analysed again (one AI call each, at most 50 per press), which stores its
 * temperature and updates the lead. Only this tenant's inbound mail is read.
 */
export async function scoreOlderLeads(
  db: Database,
  tenantId: string,
  deps: Pick<AnalyzeDeps, "analyze"> = defaultDeps,
  now = new Date(),
  limit = SCORE_OLDER_LIMIT,
): Promise<ScoreOlderOutcome> {
  const since = new Date(now.getTime() - SCORE_OLDER_DAYS * 86_400_000);
  const rows = await db
    .select({
      id: etEmails.id,
      fromAddress: etEmails.fromAddress,
      fromName: etEmails.fromName,
      to: etEmails.toAddresses,
      subject: etEmails.subject,
      bodyText: etEmails.bodyText,
      receivedAt: etEmails.receivedAt,
      mailboxOwner: connectedAccounts.identity,
    })
    .from(etEmails)
    .innerJoin(connectedAccounts, and(eq(connectedAccounts.id, etEmails.accountId), eq(connectedAccounts.tenantId, tenantId)))
    .innerJoin(etEmailAnalysis, and(eq(etEmailAnalysis.emailId, etEmails.id), eq(etEmailAnalysis.tenantId, tenantId)))
    .where(
      and(
        eq(etEmails.tenantId, tenantId),
        eq(etEmails.direction, "inbound"),
        gte(etEmails.receivedAt, since),
        eq(etEmailAnalysis.status, "analyzed"),
        eq(etEmailAnalysis.category, "lead_reply"),
        isNull(etEmailAnalysis.leadTemperature),
      ),
    )
    .orderBy(desc(etEmails.receivedAt))
    .limit(limit);

  const outcome: ScoreOlderOutcome = { scored: 0, failed: 0, stoppedBecause: null };
  for (const row of rows) {
    const result = await deps.analyze(
      { fromAddress: row.fromAddress, fromName: row.fromName, to: row.to, subject: row.subject, bodyText: row.bodyText, receivedAt: row.receivedAt },
      { tenantId, mailboxOwner: row.mailboxOwner },
    );
    if (!result.ok) {
      if (PAUSING_REASONS.has(result.reason)) {
        outcome.stoppedBecause = result.reason as NonNullable<ScoreOlderOutcome["stoppedBecause"]>;
        break;
      }
      // The earlier result stays as it was; this email is simply not scored this time.
      outcome.failed += 1;
      continue;
    }
    await saveAnalysis(db, tenantId, row.id, result);
    outcome.scored += 1;
  }
  return outcome;
}

export type AnalyzeOneOutcome = { ok: true } | { ok: false; message: string };

/**
 * Analyzes one inbound email of this tenant on request, whatever its date (this is how older mail,
 * which the automatic scan skips, gets an AI result). Same storage and follow-up rules as the
 * scan. Only this tenant's mail is read.
 */
export async function analyzeSingleEmail(
  db: Database,
  tenantId: string,
  emailId: string,
  deps: Pick<AnalyzeDeps, "analyze"> = defaultDeps,
): Promise<AnalyzeOneOutcome> {
  if (!/^[0-9a-f-]{36}$/i.test(emailId)) return { ok: false, message: "Email not found." };

  const [row] = await db
    .select({
      id: etEmails.id,
      fromAddress: etEmails.fromAddress,
      fromName: etEmails.fromName,
      to: etEmails.toAddresses,
      subject: etEmails.subject,
      bodyText: etEmails.bodyText,
      receivedAt: etEmails.receivedAt,
      mailboxOwner: connectedAccounts.identity,
    })
    .from(etEmails)
    .innerJoin(connectedAccounts, and(eq(connectedAccounts.id, etEmails.accountId), eq(connectedAccounts.tenantId, tenantId)))
    .where(and(eq(etEmails.id, emailId), eq(etEmails.tenantId, tenantId), eq(etEmails.direction, "inbound")))
    .limit(1);
  if (!row) return { ok: false, message: "Email not found." };

  const result = await deps.analyze(
    { fromAddress: row.fromAddress, fromName: row.fromName, to: row.to, subject: row.subject, bodyText: row.bodyText, receivedAt: row.receivedAt },
    { tenantId, mailboxOwner: row.mailboxOwner },
  );
  if (!result.ok) return { ok: false, message: result.message };

  await saveAnalysis(db, tenantId, row.id, result);
  return { ok: true };
}
