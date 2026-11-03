"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/core/db";
import { writeAudit } from "@/core/platform/audit";
import { authorize } from "@/core/platform/require-permission";
import { formatInterval, scanIntervalSchema, setScanIntervalMinutes } from "@/core/settings/platform";

export type IntervalFormState = { status: "idle" | "success" | "error"; message: string };

export const initialIntervalFormState: IntervalFormState = { status: "idle", message: "" };

/** Saves how often the AI scans every tenant's mail. Needs the settings permission; the change is audited. */
export async function saveScanIntervalAction(_previous: IntervalFormState, formData: FormData): Promise<IntervalFormState> {
  const actor = await authorize("settings.manage");
  if (!actor) return { status: "error", message: "You do not have permission to change this." };

  const parsed = scanIntervalSchema.safeParse(formData.get("interval"));
  if (!parsed.success) return { status: "error", message: "Pick one of the listed intervals." };

  const db = getDb();
  await setScanIntervalMinutes(db, parsed.data, actor.email);
  await writeAudit(db, {
    actorEmail: actor.email,
    actorRole: actor.role,
    action: "settings.scan_interval",
    targetType: "platform",
    details: { minutes: parsed.data },
  });
  revalidatePath("/admin/settings");
  revalidatePath("/dashboard");
  return { status: "success", message: `Saved. The AI now scans every ${formatInterval(parsed.data)}.` };
}
