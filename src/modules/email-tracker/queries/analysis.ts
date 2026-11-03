import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "@/core/db";
import { llmUsage } from "@/core/db/schema";
import { MAX_ATTEMPTS } from "../ai/analyze-pending";
import { ANALYSIS_USAGE_TAG } from "../ai/analyze-email";
import { getTodayWindow } from "../scan/scan-state";

export type AnalysisSummary = {
  /** Today's inbound emails that have an AI result. */
  analyzed: number;
  /** Inbound emails still waiting (new, or failed with attempts left). */
  waiting: number;
  /** Inbound emails the AI gave up on after repeated failures. */
  gaveUp: number;
  /** Set when the most recent analysis call failed for a reason only the owner can fix. */
  problem: "quota_exhausted" | "auth_failed" | null;
};

/**
 * Where the tenant's AI analysis stands for today's mail (the only mail the AI scans). Always
 * scoped to the tenant.
 */
export async function getAnalysisSummary(db: Database, tenantId: string): Promise<AnalysisSummary> {
  const { startOfToday } = await getTodayWindow(db, tenantId);
  const counts = await db.execute(sql`
    select
      count(*) filter (where a.status = 'analyzed')::int as analyzed,
      count(*) filter (where a.id is null or (a.status = 'failed' and a.attempts < ${MAX_ATTEMPTS}))::int as waiting,
      count(*) filter (where a.status = 'failed' and a.attempts >= ${MAX_ATTEMPTS})::int as gave_up
    from et_emails e
    left join et_email_analysis a on a.email_id = e.id and a.tenant_id = ${tenantId}
    where e.tenant_id = ${tenantId} and e.direction = 'inbound' and e.received_at >= ${startOfToday.toISOString()}
  `);
  const row = (counts.rows[0] ?? {}) as { analyzed?: number; waiting?: number; gave_up?: number };

  const [latest] = await db
    .select({ status: llmUsage.status })
    .from(llmUsage)
    .where(and(eq(llmUsage.tenantId, tenantId), eq(llmUsage.usageTag, ANALYSIS_USAGE_TAG)))
    .orderBy(desc(llmUsage.createdAt))
    .limit(1);

  return {
    analyzed: row.analyzed ?? 0,
    waiting: row.waiting ?? 0,
    gaveUp: row.gave_up ?? 0,
    problem: latest?.status === "quota_exhausted" || latest?.status === "auth_failed" ? latest.status : null,
  };
}
