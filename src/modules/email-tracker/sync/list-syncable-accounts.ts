import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@/core/db";
import { connectedAccounts, tenants } from "@/core/db/schema";
import { GMAIL_PROVIDER } from "../connectors/gmail";
import { IMAP_PROVIDER } from "../connectors/imap";

export type SyncableAccount = { tenantId: string; accountId: string };

/** The providers whose accounts the scheduler syncs. */
const SYNCABLE_PROVIDERS = [IMAP_PROVIDER, GMAIL_PROVIDER];

/**
 * Every IMAP and Gmail account of every active (not suspended) tenant. This is the one deliberate
 * cross-tenant query: the scheduler uses it only to queue one job per account, and each job then
 * runs scoped to that account's own tenant. Suspended workspaces are left out, so nothing is
 * fetched or analyzed for them.
 */
export async function listSyncableAccounts(db: Database): Promise<SyncableAccount[]> {
  return db
    .select({ tenantId: connectedAccounts.tenantId, accountId: connectedAccounts.id })
    .from(connectedAccounts)
    .innerJoin(tenants, eq(tenants.id, connectedAccounts.tenantId))
    .where(and(inArray(connectedAccounts.provider, SYNCABLE_PROVIDERS), eq(tenants.status, "active")));
}
