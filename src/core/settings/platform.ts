import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/core/db";
import { platformSettings } from "@/core/db/schema";

/** What a super admin can pick, in minutes: 15, 30, then every hour from 1 to 10 hours. */
export const SCAN_INTERVAL_OPTIONS_MINUTES = [15, 30, 60, 120, 180, 240, 300, 360, 420, 480, 540, 600] as const;

export const DEFAULT_SCAN_INTERVAL_MINUTES = 60;

export const scanIntervalSchema = z.coerce
  .number()
  .refine((value) => (SCAN_INTERVAL_OPTIONS_MINUTES as readonly number[]).includes(value), "Pick one of the listed intervals.");

/** "15 minutes", "30 minutes", "1 hour", "2 hours" ... */
export function formatInterval(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = minutes / 60;
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

/** The interval a super admin chose, or the default when none was ever saved. */
export async function getScanIntervalMinutes(db: Database): Promise<number> {
  const [row] = await db
    .select({ minutes: platformSettings.aiScanIntervalMinutes })
    .from(platformSettings)
    .where(eq(platformSettings.id, "platform"))
    .limit(1);
  return row?.minutes ?? DEFAULT_SCAN_INTERVAL_MINUTES;
}

/** Saves the interval. Callers must have passed the super-admin check first. */
export async function setScanIntervalMinutes(db: Database, minutes: number, updatedBy: string): Promise<void> {
  await db
    .insert(platformSettings)
    .values({ id: "platform", aiScanIntervalMinutes: minutes, updatedBy })
    .onConflictDoUpdate({
      target: platformSettings.id,
      set: { aiScanIntervalMinutes: minutes, updatedBy, updatedAt: new Date() },
    });
}

/** Who last changed the interval, for the admin page. */
export async function getScanIntervalInfo(db: Database): Promise<{ minutes: number; updatedBy: string | null; updatedAt: Date | null }> {
  const [row] = await db
    .select({
      minutes: platformSettings.aiScanIntervalMinutes,
      updatedBy: platformSettings.updatedBy,
      updatedAt: platformSettings.updatedAt,
    })
    .from(platformSettings)
    .where(eq(platformSettings.id, "platform"))
    .limit(1);
  return row ?? { minutes: DEFAULT_SCAN_INTERVAL_MINUTES, updatedBy: null, updatedAt: null };
}
