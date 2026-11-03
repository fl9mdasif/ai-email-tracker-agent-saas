"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/core/db";
import { tenants } from "@/core/db/schema";
import { isValidTimeZone } from "@/core/lib/time";
import { requireModule } from "@/core/modules/guard";

export type TimeZoneFormState = { status: "idle" | "success" | "error"; message: string };

export const initialTimeZoneFormState: TimeZoneFormState = { status: "idle", message: "" };

const timeZoneSchema = z.string().min(1).refine(isValidTimeZone, "Pick a time zone from the list.");

/** Saves the signed-in tenant's time zone, which decides where "today" starts for the AI scan. */
export async function saveTimeZoneAction(_previous: TimeZoneFormState, formData: FormData): Promise<TimeZoneFormState> {
  const session = await requireModule("email-tracker");
  const parsed = timeZoneSchema.safeParse(formData.get("timezone"));
  if (!parsed.success) return { status: "error", message: "Pick a time zone from the list." };

  await getDb().update(tenants).set({ timezone: parsed.data }).where(eq(tenants.id, session.tenantId));
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  return { status: "success", message: "Saved." };
}
