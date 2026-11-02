import { eq } from "drizzle-orm";
import type { Database } from "@/core/db";
import { connectedAccounts } from "@/core/db/schema";
import { IMAP_PROVIDER } from "../connectors/imap";

export type SyncableAccount = { tenantId: string; accountId: string };

/**
 * Every IMAP account across all tenants. This is the one deliberate cross-tenant query: the
 * scheduler uses it only to queue one job per account, and each job then runs scoped to that
 * account's own tenant.
 */
export async function listSyncableAccounts(db: Database): Promise<SyncableAccount[]> {
  return db
    .select({ tenantId: connectedAccounts.tenantId, accountId: connectedAccounts.id })
    .from(connectedAccounts)
    .where(eq(connectedAccounts.provider, IMAP_PROVIDER));
}
