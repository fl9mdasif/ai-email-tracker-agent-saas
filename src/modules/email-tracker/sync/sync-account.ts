import { and, eq } from "drizzle-orm";
import type { Database } from "@/core/db";
import {
  getAccount,
  getCredentials,
  markAccountSynced,
  setAccountStatus,
} from "@/core/vault";
import { mapImapError } from "../connectors/imap/errors";
import { type FetchEmails, type FetchResult, fetchImapEmails } from "../connectors/imap/fetch-messages";
import type { SyncCursor } from "../connectors/imap/plan-fetch";
import { imapCredentialsSchema } from "../connectors/imap/schema";
import { etEmails, etSyncRuns, etSyncState } from "../db/schema";

export type SyncOutcome =
  | { status: "success"; fetched: number; inserted: number }
  | { status: "error"; message: string }
  | { status: "not_found" };

export type SyncDeps = { fetchEmails: FetchEmails };

const defaultDeps: SyncDeps = { fetchEmails: fetchImapEmails };

const CREDENTIALS_MESSAGE =
  "The saved credentials could not be read. Disconnect this account and add it again.";
const STORE_MESSAGE = "Could not store the synced mail. It will be retried on the next sync.";
const INSERT_CHUNK = 50;

class CredentialsUnreadableError extends Error {}

/**
 * Syncs one account of one tenant. Idempotent: running it twice never creates duplicates
 * (emails are unique per account and message id). Failures are recorded in et_sync_runs and
 * on the account and returned, never thrown, so one bad account cannot stop the others.
 * Nothing here logs email content or credentials.
 */
export async function syncAccount(
  db: Database,
  tenantId: string,
  accountId: string,
  deps: SyncDeps = defaultDeps,
): Promise<SyncOutcome> {
  const account = await getAccount(db, tenantId, accountId);
  if (!account) return { status: "not_found" };

  const [run] = await db
    .insert(etSyncRuns)
    .values({ tenantId, accountId })
    .returning({ id: etSyncRuns.id });

  const fail = async (message: string): Promise<SyncOutcome> => {
    await db
      .update(etSyncRuns)
      .set({ status: "error", error: message, finishedAt: new Date() })
      .where(and(eq(etSyncRuns.id, run.id), eq(etSyncRuns.tenantId, tenantId)));
    await setAccountStatus(db, tenantId, accountId, "error", message);
    return { status: "error", message };
  };

  let result: FetchResult;
  try {
    const stored = await getCredentials(db, tenantId, accountId);
    const credentials = imapCredentialsSchema.safeParse(stored);
    if (!credentials.success) throw new CredentialsUnreadableError();
    const cursor = await loadCursor(db, tenantId, accountId);
    result = await deps.fetchEmails(credentials.data, cursor, account.identity);
  } catch (error) {
    if (error instanceof CredentialsUnreadableError) return fail(CREDENTIALS_MESSAGE);
    if (error instanceof Error && error.message === "Could not decrypt secret") {
      return fail(CREDENTIALS_MESSAGE);
    }
    return fail(mapImapError(error));
  }

  try {
    const inserted = await storeEmails(db, tenantId, accountId, account.provider, result);
    await saveCursor(db, tenantId, accountId, result.cursor);
    const finishedAt = new Date();
    await db
      .update(etSyncRuns)
      .set({ status: "success", finishedAt, fetchedCount: result.fetched, insertedCount: inserted })
      .where(and(eq(etSyncRuns.id, run.id), eq(etSyncRuns.tenantId, tenantId)));
    await markAccountSynced(db, tenantId, accountId, finishedAt);
    return { status: "success", fetched: result.fetched, inserted };
  } catch {
    return fail(STORE_MESSAGE);
  }
}

async function loadCursor(db: Database, tenantId: string, accountId: string): Promise<SyncCursor | null> {
  const [row] = await db
    .select({ uidValidity: etSyncState.uidValidity, lastUid: etSyncState.lastUid })
    .from(etSyncState)
    .where(and(eq(etSyncState.accountId, accountId), eq(etSyncState.tenantId, tenantId)))
    .limit(1);
  return row ?? null;
}

async function saveCursor(
  db: Database,
  tenantId: string,
  accountId: string,
  cursor: SyncCursor,
): Promise<void> {
  await db
    .insert(etSyncState)
    .values({ accountId, tenantId, uidValidity: cursor.uidValidity, lastUid: cursor.lastUid })
    .onConflictDoUpdate({
      target: etSyncState.accountId,
      set: { uidValidity: cursor.uidValidity, lastUid: cursor.lastUid, updatedAt: new Date() },
      setWhere: eq(etSyncState.tenantId, tenantId),
    });
}

/** Inserts new emails, skipping any already stored. Returns how many were actually new. */
async function storeEmails(
  db: Database,
  tenantId: string,
  accountId: string,
  provider: string,
  result: FetchResult,
): Promise<number> {
  let inserted = 0;
  for (let start = 0; start < result.emails.length; start += INSERT_CHUNK) {
    const rows = result.emails.slice(start, start + INSERT_CHUNK).map((email) => ({
      tenantId,
      accountId,
      provider,
      providerMessageId: email.providerMessageId,
      threadId: email.threadId,
      fromAddress: email.from.address,
      fromName: email.from.name,
      toAddresses: email.to,
      subject: email.subject,
      snippet: email.snippet,
      bodyText: email.bodyText,
      receivedAt: email.receivedAt,
      direction: email.direction,
      status: email.status,
      labels: email.labels,
    }));
    const added = await db
      .insert(etEmails)
      .values(rows)
      .onConflictDoNothing({ target: [etEmails.accountId, etEmails.providerMessageId] })
      .returning({ id: etEmails.id });
    inserted += added.length;
  }
  return inserted;
}
