"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/core/auth/super-admin";
import { getDb } from "@/core/db";
import { formatInterval, scanIntervalSchema, setScanIntervalMinutes } from "@/core/settings/platform";

export type IntervalFormState = { status: "idle" | "success" | "error"; message: string };

export const initialIntervalFormState: IntervalFormState = { status: "idle", message: "" };

/** Saves how often the AI scans every tenant's mail. Only a super admin can call this. */
export async function saveScanIntervalAction(_previous: IntervalFormState, formData: FormData): Promise<IntervalFormState> {
  const adminEmail = await requireSuperAdmin();

  const parsed = scanIntervalSchema.safeParse(formData.get("interval"));
  if (!parsed.success) return { status: "error", message: "Pick one of the listed intervals." };

  await setScanIntervalMinutes(getDb(), parsed.data, adminEmail);
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  return { status: "success", message: `Saved. The AI now scans every ${formatInterval(parsed.data)}.` };
}
