import { and, eq } from "drizzle-orm";
import type { Database } from "@/core/db";
import {
  getAccount,
  getCredentials,
  markAccountSynced,
  setAccountStatus,
} from "@/core/vault";
import { mapGmailError } from "../connectors/gmail/errors";
import { type FetchGmailEmails, fetchGmailEmails } from "../connectors/gmail/fetch-messages";
import { GMAIL_PROVIDER } from "../connectors/gmail";
import { readGmailCursor } from "../connectors/gmail/plan-fetch";
import { gmailCredentialsSchema } from "../connectors/gmail/schema";
import { mapImapError } from "../connectors/imap/errors";
import { type FetchEmails, fetchImapEmails } from "../connectors/imap/fetch-messages";
import type { SyncCursor } from "../connectors/imap/plan-fetch";
import { IMAP_PROVIDER } from "../connectors/imap";
import { imapCredentialsSchema } from "../connectors/imap/schema";
import { etEmails, etSyncRuns, etSyncState } from "../db/schema";
import type { NormalizedEmail } from "../types";

export type SyncOutcome =
  | { status: "success"; fetched: number; inserted: number }
  | { status: "error"; message: string }
  | { status: "not_found" };

/** The readers for each provider. Tests pass fakes; production uses the real ones. */
export type SyncDeps = { fetchEmails: FetchEmails; fetchGmailEmails: FetchGmailEmails };

const defaultDeps: SyncDeps = { fetchEmails: fetchImapEmails, fetchGmailEmails };

const CREDENTIALS_MESSAGE =
  "The saved credentials could not be read. Disconnect this account and add it again.";
const STORE_MESSAGE = "Could not store the synced mail. It will be retried on the next sync.";
const UNSUPPORTED_MESSAGE = "This kind of account cannot be synced yet.";
const INSERT_CHUNK = 50;

class CredentialsUnreadableError extends Error {}

/** What one provider's reader hands back: the mail, and how to remember where it stopped. */
type Read = {
  emails: NormalizedEmail[];
  fetched: number;
  saveCursor: () => Promise<void>;
};

/**
 * Syncs one account of one tenant, IMAP or Gmail. Idempotent: running it twice never creates
 * duplicates (emails are unique per account and message id). Failures are recorded in
 * et_sync_runs and on the account and returned, never thrown, so one bad account cannot stop the
 * others. Nothing here logs email content or credentials.
 */
export async function syncAccount(
  db: Database,
  tenantId: string,
  accountId: string,
  deps: Partial<SyncDeps> = {},
): Promise<SyncOutcome> {
  const readers: SyncDeps = { ...defaultDeps, ...deps };
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

  let read: Read;
  try {
    if (account.provider === IMAP_PROVIDER) {
      read = await readImap(db, tenantId, accountId, account.identity, readers.fetchEmails);
    } else if (account.provider === GMAIL_PROVIDER) {
      read = await readGmail(db, tenantId, accountId, account.identity, readers.fetchGmailEmails);
    } else {
      return fail(UNSUPPORTED_MESSAGE);
    }
  } catch (error) {
    if (error instanceof CredentialsUnreadableError) return fail(CREDENTIALS_MESSAGE);
    if (error instanceof Error && error.message === "Could not decrypt secret") {
      return fail(CREDENTIALS_MESSAGE);
    }
    return fail(account.provider === GMAIL_PROVIDER ? mapGmailError(error) : mapImapError(error));
  }

  try {
    const inserted = await storeEmails(db, tenantId, accountId, account.provider, read.emails);
    await read.saveCursor();
    const finishedAt = new Date();
    await db
      .update(etSyncRuns)
      .set({ status: "success", finishedAt, fetchedCount: read.fetched, insertedCount: inserted })
      .where(and(eq(etSyncRuns.id, run.id), eq(etSyncRuns.tenantId, tenantId)));
    await markAccountSynced(db, tenantId, accountId, finishedAt);
    return { status: "success", fetched: read.fetched, inserted };
  } catch {
    return fail(STORE_MESSAGE);
  }
}

async function readImap(
  db: Database,
  tenantId: string,
  accountId: string,
  identity: string,
  fetchEmails: FetchEmails,
): Promise<Read> {
  const stored = await getCredentials(db, tenantId, accountId);
  const credentials = imapCredentialsSchema.safeParse(stored);
  if (!credentials.success) throw new CredentialsUnreadableError();
  const cursor = await loadImapCursor(db, tenantId, accountId);
  const result = await fetchEmails(credentials.data, cursor, identity);
  return {
    emails: result.emails,
    fetched: result.fetched,
    saveCursor: () => saveImapCursor(db, tenantId, accountId, result.cursor),
  };
}

async function readGmail(
  db: Database,
  tenantId: string,
  accountId: string,
  identity: string,
  fetchGmail: FetchGmailEmails,
): Promise<Read> {
  const stored = await getCredentials(db, tenantId, accountId);
  const credentials = gmailCredentialsSchema.safeParse(stored);
  if (!credentials.success) throw new CredentialsUnreadableError();
  const cursor = readGmailCursor(await loadJsonCursor(db, tenantId, accountId));
  const result = await fetchGmail(credentials.data, cursor, identity);
  return {
    emails: result.emails,
    fetched: result.fetched,
    saveCursor: () => saveJsonCursor(db, tenantId, accountId, { ...result.cursor }),
  };
}

async function loadImapCursor(db: Database, tenantId: string, accountId: string): Promise<SyncCursor | null> {
  const [row] = await db
    .select({ uidValidity: etSyncState.uidValidity, lastUid: etSyncState.lastUid })
    .from(etSyncState)
    .where(and(eq(etSyncState.accountId, accountId), eq(etSyncState.tenantId, tenantId)))
    .limit(1);
  return row ?? null;
}

async function saveImapCursor(
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

async function loadJsonCursor(db: Database, tenantId: string, accountId: string): Promise<unknown> {
  const [row] = await db
    .select({ cursor: etSyncState.cursor })
    .from(etSyncState)
    .where(and(eq(etSyncState.accountId, accountId), eq(etSyncState.tenantId, tenantId)))
    .limit(1);
  return row?.cursor ?? null;
}

/** Providers other than IMAP keep their position as JSON; the IMAP columns just hold placeholders. */
async function saveJsonCursor(
  db: Database,
  tenantId: string,
  accountId: string,
  cursor: Record<string, unknown>,
): Promise<void> {
  await db
    .insert(etSyncState)
    .values({ accountId, tenantId, uidValidity: "json", lastUid: 0, cursor })
    .onConflictDoUpdate({
      target: etSyncState.accountId,
      set: { cursor, updatedAt: new Date() },
      setWhere: eq(etSyncState.tenantId, tenantId),
    });
}

/** Inserts new emails, skipping any already stored. Returns how many were actually new. */
async function storeEmails(
  db: Database,
  tenantId: string,
  accountId: string,
  provider: string,
  emails: NormalizedEmail[],
): Promise<number> {
  let inserted = 0;
  for (let start = 0; start < emails.length; start += INSERT_CHUNK) {
    const rows = emails.slice(start, start + INSERT_CHUNK).map((email) => ({
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
