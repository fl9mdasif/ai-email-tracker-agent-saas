import { and, eq, gte, sql } from "drizzle-orm";
import type { Database } from "@/core/db";
import { llmUsage } from "@/core/db/schema";
import { startOfTodayIn } from "@/core/lib/time";
import { ANALYSIS_USAGE_TAG } from "../ai/analyze-email";
import { getTodayWindow } from "../scan/scan-state";

export type AiUsage = {
  /** Emails analyzed today (successful AI calls since local midnight). */
  today: number;
  /** Emails analyzed in the last 30 days. */
  last30Days: number;
};

/** How much AI the workspace has used. Counts successful calls only, from the usage log. Scoped to the tenant. */
export async function getAiUsage(db: Database, tenantId: string, now: Date = new Date()): Promise<AiUsage> {
  const { timeZone } = await getTodayWindow(db, tenantId, now);
  const todayStart = startOfTodayIn(timeZone, now);
  const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [row] = await db
    .select({
      today: sql<number>`count(*) filter (where ${llmUsage.createdAt} >= ${todayStart.toISOString()})::int`,
      last30: sql<number>`count(*)::int`,
    })
    .from(llmUsage)
    .where(
      and(
        eq(llmUsage.tenantId, tenantId),
        eq(llmUsage.usageTag, ANALYSIS_USAGE_TAG),
        eq(llmUsage.status, "ok"),
        gte(llmUsage.createdAt, since30),
      ),
    );
  return { today: row?.today ?? 0, last30Days: row?.last30 ?? 0 };
}
