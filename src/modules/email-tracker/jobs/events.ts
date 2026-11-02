import { z } from "zod";

/** Asks for one account to be synced now. Sent by the scheduler and by the "Sync now" button. */
export const SYNC_ACCOUNT_EVENT = "email-tracker/account.sync";

export const syncAccountEventSchema = z.object({
  tenantId: z.uuid(),
  accountId: z.uuid(),
});

export type SyncAccountEventData = z.infer<typeof syncAccountEventSchema>;
