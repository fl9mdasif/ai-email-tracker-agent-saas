import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "@/core/db";
import { etEmailAnalysis, etEmails, etSyncRuns } from "../db/schema";

/** What the AI made of an email; null on the preview while it has not been analyzed. */
export type AnalysisPreview = {
  category:
    | "needs_reply"
    | "follow_up_needed"
    | "lead_reply"
    | "invoice_or_payment"
    | "newsletter_or_promo"
    | "fyi_only"
    | "spam";
  priority: number;
  needsReply: boolean;
  summary: string;
  suggestedAction: string;
};

export type EmailPreview = {
  id: string;
  fromAddress: string;
  fromName: string | null;
  subject: string;
  snippet: string;
  receivedAt: Date;
  status: "unread" | "read";
  analysis: AnalysisPreview | null;
};

/**
 * The tenant's newest emails with their AI analysis (when there is one), without full bodies.
 * Always scoped to the tenant, on both the emails and the analysis.
 */
export async function listLatestEmails(
  db: Database,
  tenantId: string,
  limit = 20,
): Promise<EmailPreview[]> {
  const rows = await db
    .select({
      id: etEmails.id,
      fromAddress: etEmails.fromAddress,
      fromName: etEmails.fromName,
      subject: etEmails.subject,
      snippet: etEmails.snippet,
      receivedAt: etEmails.receivedAt,
      status: etEmails.status,
      analysisStatus: etEmailAnalysis.status,
      category: etEmailAnalysis.category,
      priority: etEmailAnalysis.priority,
      needsReply: etEmailAnalysis.needsReply,
      summary: etEmailAnalysis.summary,
      suggestedAction: etEmailAnalysis.suggestedAction,
    })
    .from(etEmails)
    .leftJoin(
      etEmailAnalysis,
      and(eq(etEmailAnalysis.emailId, etEmails.id), eq(etEmailAnalysis.tenantId, tenantId)),
    )
    .where(eq(etEmails.tenantId, tenantId))
    .orderBy(desc(etEmails.receivedAt))
    .limit(limit);

  return rows.map(({ analysisStatus, category, priority, needsReply, summary, suggestedAction, ...email }) => ({
    ...email,
    analysis:
      analysisStatus === "analyzed" && category && priority !== null && summary && suggestedAction
        ? { category, priority, needsReply: needsReply ?? false, summary, suggestedAction }
        : null,
  }));
}

/** How many emails are stored for each of the tenant's accounts (account id to count). */
export async function countEmailsByAccount(
  db: Database,
  tenantId: string,
): Promise<Map<string, number>> {
  const rows = await db
    .select({ accountId: etEmails.accountId, total: sql<number>`count(*)::int` })
    .from(etEmails)
    .where(eq(etEmails.tenantId, tenantId))
    .groupBy(etEmails.accountId);
  return new Map(rows.map((row) => [row.accountId, row.total]));
}

export type SyncRunSummary = {
  accountId: string;
  startedAt: Date;
  finishedAt: Date | null;
  status: "running" | "success" | "error";
  error: string | null;
  fetchedCount: number;
  insertedCount: number;
};

/** The tenant's most recent sync attempts, newest first. */
export async function listRecentSyncRuns(
  db: Database,
  tenantId: string,
  limit = 50,
): Promise<SyncRunSummary[]> {
  return db
    .select({
      accountId: etSyncRuns.accountId,
      startedAt: etSyncRuns.startedAt,
      finishedAt: etSyncRuns.finishedAt,
      status: etSyncRuns.status,
      error: etSyncRuns.error,
      fetchedCount: etSyncRuns.fetchedCount,
      insertedCount: etSyncRuns.insertedCount,
    })
    .from(etSyncRuns)
    .where(eq(etSyncRuns.tenantId, tenantId))
    .orderBy(desc(etSyncRuns.startedAt))
    .limit(limit);
}
