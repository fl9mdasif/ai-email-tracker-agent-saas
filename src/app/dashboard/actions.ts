"use server";

import { revalidatePath } from "next/cache";
import { getConfig } from "@/core/config";
import { getDb } from "@/core/db";
import { inngest } from "@/core/jobs/client";
import { requireModule } from "@/core/modules/guard";
import { ANALYZE_TENANT_EVENT } from "@/modules/email-tracker/jobs/events";
import { markScanStarted, pauseScan } from "@/modules/email-tracker/scan/scan-state";

const MODULE_KEY = "email-tracker";

/**
 * Stops this tenant's running AI scan and keeps automatic scans off until "Scan now" is pressed.
 * The scan checks the flag between emails, so at most one more email is finished.
 */
export async function cancelScanAction(): Promise<{ ok: boolean; message: string }> {
  const session = await requireModule(MODULE_KEY);
  await pauseScan(getDb(), session.tenantId);
  revalidatePath("/dashboard");
  return { ok: true, message: "Scanning stopped." };
}

/** Starts a scan of today's mail now, and turns automatic scans back on if they were stopped. */
export async function scanNowAction(): Promise<{ ok: boolean; message: string }> {
  const session = await requireModule(MODULE_KEY);
  const db = getDb();
  await markScanStarted(db, session.tenantId);

  try {
    await inngest.send({ name: ANALYZE_TENANT_EVENT, data: { tenantId: session.tenantId } });
  } catch {
    const message =
      getConfig().NODE_ENV === "production"
        ? "Could not start the scan. Please try again in a moment."
        : "Could not reach the background worker. Start it with npm run inngest:dev and try again.";
    return { ok: false, message };
  }
  revalidatePath("/dashboard");
  return { ok: true, message: "Scan started." };
}
