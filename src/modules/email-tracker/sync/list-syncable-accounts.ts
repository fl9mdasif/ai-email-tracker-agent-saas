import { inArray } from "drizzle-orm";
import type { Database } from "@/core/db";
import { connectedAccounts } from "@/core/db/schema";
import { GMAIL_PROVIDER } from "../connectors/gmail";
import { IMAP_PROVIDER } from "../connectors/imap";

export type SyncableAccount = { tenantId: string; accountId: string };

/** The providers whose accounts the scheduler syncs. */
const SYNCABLE_PROVIDERS = [IMAP_PROVIDER, GMAIL_PROVIDER];

/**
 * Every IMAP and Gmail account across all tenants. This is the one deliberate cross-tenant
 * query: the scheduler uses it only to queue one job per account, and each job then runs scoped
 * to that account's own tenant.
 */
export async function listSyncableAccounts(db: Database): Promise<SyncableAccount[]> {
  return db
    .select({ tenantId: connectedAccounts.tenantId, accountId: connectedAccounts.id })
    .from(connectedAccounts)
    .where(inArray(connectedAccounts.provider, SYNCABLE_PROVIDERS));
}
