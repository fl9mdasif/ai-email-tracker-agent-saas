import { getDb } from "@/core/db";
import { inngest } from "@/core/jobs/client";
import { BATCH_SIZE, analyzePendingEmails } from "../ai/analyze-pending";
import { ANALYZE_TENANT_EVENT, analyzeTenantEventSchema } from "./events";

/**
 * Analyzes one batch of a tenant's new mail. One run per tenant at a time, so the same email is
 * never analyzed twice at once. A full batch means there may be more, so it queues itself
 * again; failures stop being retried after a few attempts, so this always ends.
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
