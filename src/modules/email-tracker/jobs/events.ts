import { z } from "zod";

/** Asks for one account to be synced now. Sent by the scheduler and by the "Sync now" button. */
export const SYNC_ACCOUNT_EVENT = "email-tracker/account.sync";

export const syncAccountEventSchema = z.object({
  tenantId: z.uuid(),
  accountId: z.uuid(),
});

export type SyncAccountEventData = z.infer<typeof syncAccountEventSchema>;

/** Asks for a tenant's new mail to be analyzed. Sent after a sync found mail, and by the scheduler. */
export const ANALYZE_TENANT_EVENT = "email-tracker/tenant.analyze";

export const analyzeTenantEventSchema = z.object({ tenantId: z.uuid() });

export type AnalyzeTenantEventData = z.infer<typeof analyzeTenantEventSchema>;
