import { getDb } from "@/core/db";
import { inngest } from "@/core/jobs/client";
import { getScanIntervalMinutes } from "@/core/settings/platform";
import { BATCH_SIZE, analyzePendingEmails } from "../ai/analyze-pending";
import { listTenantsDueForScan, markScanStarted } from "../scan/scan-state";
import { listSyncableAccounts } from "../sync/list-syncable-accounts";
import { ANALYZE_TENANT_EVENT, analyzeTenantEventSchema } from "./events";

/**
 * Analyzes one batch of a tenant's mail from today. One run per tenant at a time, so the same
 * email is never analyzed twice at once. A full batch means there may be more, so it queues itself
 * again; failures stop being retried after a few attempts, and a Cancel or a paused AI service
 * stops the chain, so this always ends.
 */
export const analyzeTenantJob = inngest.createFunction(
  {
    id: "email-tracker-analyze-tenant",
    triggers: [{ event: ANALYZE_TENANT_EVENT }],
    concurrency: [{ limit: 1, key: "event.data.tenantId" }],
    retries: 1,
  },
  async ({ event, step }) => {
    const { tenantId } = analyzeTenantEventSchema.parse(event.data);
    const outcome = await step.run("analyze-batch", () => analyzePendingEmails(getDb(), tenantId));

    const handled = outcome.analyzed + outcome.failed;
    if (!outcome.stoppedBecause && handled >= BATCH_SIZE) {
      await step.sendEvent("continue", { name: ANALYZE_TENANT_EVENT, data: { tenantId } });
    }
    return outcome;
  },
);

/**
 * Inngest crons are fixed, but the scan interval is chosen by a super admin, so this ticks every
 * 15 minutes (the smallest choice) and only starts a scan for tenants that are due. A tenant that
 * pressed Cancel is skipped until they press "Scan now". The tick itself costs no model calls.
 */
export const scheduledAnalyzeJob = inngest.createFunction(
  {
    id: "email-tracker-scheduled-analyze",
    triggers: [{ cron: "*/15 * * * *" }],
    retries: 1,
  },
  async ({ step }) => {
    const due = await step.run("find-due-tenants", async () => {
      const db = getDb();
      const accounts = await listSyncableAccounts(db);
      const tenantIds = [...new Set(accounts.map((account) => account.tenantId))];
      const intervalMinutes = await getScanIntervalMinutes(db);
      const dueTenants = await listTenantsDueForScan(db, tenantIds, new Date(), intervalMinutes);
      const startedAt = new Date();
      for (const tenantId of dueTenants) await markScanStarted(db, tenantId, startedAt);
      return dueTenants;
    });

    if (due.length > 0) {
      await step.sendEvent(
        "queue-analysis",
        due.map((tenantId) => ({ name: ANALYZE_TENANT_EVENT, data: { tenantId } })),
      );
    }
    return { queued: due.length };
  },
);
