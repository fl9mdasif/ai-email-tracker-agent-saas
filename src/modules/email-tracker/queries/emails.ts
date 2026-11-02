import { desc, eq } from "drizzle-orm";
import type { Database } from "@/core/db";
import { etEmails, etSyncRuns } from "../db/schema";

export type EmailPreview = {
  id: string;
  fromAddress: string;
  fromName: string | null;
  subject: string;
  snippet: string;
  receivedAt: Date;
  status: "unread" | "read";
};

/** The tenant's newest emails, without their full bodies. Always scoped to the tenant. */
export async function listLatestEmails(
  db: Database,
  tenantId: string,
  limit = 20,
): Promise<EmailPreview[]> {
  return db
    .select({
      id: etEmails.id,
      fromAddress: etEmails.fromAddress,
      fromName: etEmails.fromName,
      subject: etEmails.subject,
      snippet: etEmails.snippet,
      receivedAt: etEmails.receivedAt,
      status: etEmails.status,
    })
    .from(etEmails)
    .where(eq(etEmails.tenantId, tenantId))
    .orderBy(desc(etEmails.receivedAt))
    .limit(limit);
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
