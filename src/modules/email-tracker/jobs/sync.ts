import { getDb } from "@/core/db";
import { inngest } from "@/core/jobs/client";
import { listSyncableAccounts } from "../sync/list-syncable-accounts";
import { syncAccount } from "../sync/sync-account";
import { ANALYZE_TENANT_EVENT, SYNC_ACCOUNT_EVENT, syncAccountEventSchema } from "./events";

/** Syncs one account. At most one run per account at a time. */
export const syncAccountJob = inngest.createFunction(
  {
    id: "email-tracker-sync-account",
    triggers: [{ event: SYNC_ACCOUNT_EVENT }],
    concurrency: [{ limit: 1, key: "event.data.accountId" }],
    retries: 1,
  },
  async ({ event, step }) => {
    const { tenantId, accountId } = syncAccountEventSchema.parse(event.data);
    // syncAccount records failures itself and returns them, so a bad mailbox never fails the job.
    const outcome = await step.run("sync-account", () => syncAccount(getDb(), tenantId, accountId));

    // New mail was stored, so have it analyzed.
    if (outcome.status === "success" && outcome.inserted > 0) {
      await step.sendEvent("queue-analysis", { name: ANALYZE_TENANT_EVENT, data: { tenantId } });
    }
    return outcome;
  },
);

/** Every 15 minutes, queues one sync job per connected account. */
export const scheduledSyncJob = inngest.createFunction(
  {
    id: "email-tracker-scheduled-sync",
    triggers: [{ cron: "*/15 * * * *" }],
    retries: 1,
  },
  async ({ step }) => {
    const accounts = await step.run("list-accounts", () => listSyncableAccounts(getDb()));
    if (accounts.length > 0) {
      await step.sendEvent(
        "queue-syncs",
        accounts.map((account) => ({ name: SYNC_ACCOUNT_EVENT, data: account })),
      );
      // Also catch up on analysis (retries of earlier failures, mail stored before AI was on).
      // It costs nothing when there is nothing pending.
      const tenantIds = [...new Set(accounts.map((account) => account.tenantId))];
      await step.sendEvent(
        "queue-analysis",
        tenantIds.map((tenantId) => ({ name: ANALYZE_TENANT_EVENT, data: { tenantId } })),
      );
    }
    return { queued: accounts.length };
  },
);

export const syncJobs = [syncAccountJob, scheduledSyncJob];
