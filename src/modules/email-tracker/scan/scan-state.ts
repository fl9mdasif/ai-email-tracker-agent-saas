import { eq, inArray } from "drizzle-orm";
import type { Database } from "@/core/db";
import { tenants } from "@/core/db/schema";
import { isValidTimeZone, startOfTodayIn } from "@/core/lib/time";
import { etScanState } from "../db/schema";

const MINUTE_MS = 60_000;
/** The scheduler ticks every 15 minutes, so a scan is due a little before the interval has fully passed. */
const TICK_SLACK_MS = 60_000;

/** Pure: is it time to scan again? A tenant that never scanned is always due. */
export function isScanDue(lastStartedAt: Date | null, now: Date, intervalMinutes: number): boolean {
  if (!lastStartedAt) return true;
  return now.getTime() - lastStartedAt.getTime() >= intervalMinutes * MINUTE_MS - TICK_SLACK_MS;
}

/** The tenant's time zone and where today began there. Always scoped to the tenant. */
export async function getTodayWindow(db: Database, tenantId: string, now: Date = new Date()): Promise<{ timeZone: string; startOfToday: Date }> {
  const [row] = await db.select({ timezone: tenants.timezone }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const timeZone = row?.timezone ?? "UTC";
  return { timeZone, startOfToday: startOfTodayIn(timeZone, now) };
}

/** True when the user pressed Cancel and has not pressed Scan now since. */
export async function isScanPaused(db: Database, tenantId: string): Promise<boolean> {
  const [row] = await db.select({ paused: etScanState.paused }).from(etScanState).where(eq(etScanState.tenantId, tenantId)).limit(1);
  return row?.paused ?? false;
}

/** Stops the running scan and keeps automatic scans off until the user starts one again. */
export async function pauseScan(db: Database, tenantId: string): Promise<void> {
  await db
    .insert(etScanState)
    .values({ tenantId, paused: true })
    .onConflictDoUpdate({ target: etScanState.tenantId, set: { paused: true, updatedAt: new Date() } });
}

/** Clears the pause and records that a scan starts now. Used by "Scan now" and by the scheduler. */
export async function markScanStarted(db: Database, tenantId: string, now: Date = new Date()): Promise<void> {
  await db
    .insert(etScanState)
    .values({ tenantId, paused: false, lastScanStartedAt: now })
    .onConflictDoUpdate({
      target: etScanState.tenantId,
      set: { paused: false, lastScanStartedAt: now, updatedAt: now },
    });
}

/**
 * Of the given tenants, the ones whose automatic scan is due: not paused, and never scanned or
 * last scanned longer ago than the interval. This is cross-tenant on purpose (the scheduler needs
 * to see everyone); each scan it queues then runs scoped to one tenant.
 */
export async function listTenantsDueForScan(db: Database, tenantIds: string[], now: Date, intervalMinutes: number): Promise<string[]> {
  if (tenantIds.length === 0) return [];
  const rows = await db
    .select({ tenantId: etScanState.tenantId, paused: etScanState.paused, lastScanStartedAt: etScanState.lastScanStartedAt })
    .from(etScanState)
    .where(inArray(etScanState.tenantId, tenantIds));
  const byTenant = new Map(rows.map((row) => [row.tenantId, row]));

  return tenantIds.filter((tenantId) => {
    const state = byTenant.get(tenantId);
    if (state?.paused) return false;
    return isScanDue(state?.lastScanStartedAt ?? null, now, intervalMinutes);
  });
}

/** A scan that started this recently, with mail still waiting, is treated as still running. */
const RECENT_SCAN_MS = 10 * MINUTE_MS;

export type ScanStatus = {
  /** The user pressed Cancel and has not started a scan since. */
  paused: boolean;
  /** A scan started within the last few minutes, so it is probably still working through mail. */
  startedRecently: boolean;
  /** The date being scanned, in the tenant's time zone, e.g. "Tue, 3 Nov 2026". */
  todayLabel: string;
};

/** The scan state shown on Today. Scoped to the tenant. */
export async function getScanStatus(db: Database, tenantId: string, now: Date = new Date()): Promise<ScanStatus> {
  const [[row], { timeZone }] = await Promise.all([
    db
      .select({ paused: etScanState.paused, lastScanStartedAt: etScanState.lastScanStartedAt })
      .from(etScanState)
      .where(eq(etScanState.tenantId, tenantId))
      .limit(1),
    getTodayWindow(db, tenantId, now),
  ]);
  const started = row?.lastScanStartedAt ?? null;
  return {
    paused: row?.paused ?? false,
    startedRecently: started !== null && now.getTime() - started.getTime() < RECENT_SCAN_MS,
    todayLabel: new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: isValidTimeZone(timeZone) ? timeZone : "UTC",
    }).format(now),
  };
}
