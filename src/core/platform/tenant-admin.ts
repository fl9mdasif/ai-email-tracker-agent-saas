import { and, eq } from "drizzle-orm";
import type { Database } from "@/core/db";
import { modules, plans, tenantModules, tenants } from "@/core/db/schema";

export type TenantChange = { ok: true } | { ok: false; message: string };

const ID = /^[0-9a-f-]{36}$/i;

async function tenantExists(db: Database, tenantId: string): Promise<boolean> {
  if (!ID.test(tenantId)) return false;
  const [row] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  return Boolean(row);
}

/** Suspends or reactivates a workspace. A suspended workspace cannot use the app and is skipped by the schedulers. */
export async function setTenantStatus(db: Database, tenantId: string, status: "active" | "suspended"): Promise<TenantChange> {
  if (!(await tenantExists(db, tenantId))) return { ok: false, message: "Workspace not found." };
  await db.update(tenants).set({ status }).where(eq(tenants.id, tenantId));
  return { ok: true };
}

/** Moves a workspace to another plan. The plan must exist and be switched on. */
export async function setTenantPlan(db: Database, tenantId: string, planId: string): Promise<TenantChange> {
  if (!(await tenantExists(db, tenantId))) return { ok: false, message: "Workspace not found." };
  if (!ID.test(planId)) return { ok: false, message: "Plan not found." };
  const [plan] = await db.select({ active: plans.active }).from(plans).where(eq(plans.id, planId)).limit(1);
  if (!plan) return { ok: false, message: "Plan not found." };
  if (!plan.active) return { ok: false, message: "That plan is switched off." };
  await db.update(tenants).set({ planId }).where(eq(tenants.id, tenantId));
  return { ok: true };
}

/** Sets this workspace's own daily AI limit, or clears it (null) so the plan's limit applies again. */
export async function setTenantAiLimit(db: Database, tenantId: string, limit: number | null): Promise<TenantChange> {
  if (limit !== null && (!Number.isInteger(limit) || limit < 0 || limit > 100_000)) return { ok: false, message: "Enter a whole number from 0 to 100,000, or leave it empty." };
  if (!(await tenantExists(db, tenantId))) return { ok: false, message: "Workspace not found." };
  await db.update(tenants).set({ aiDailyLimit: limit }).where(eq(tenants.id, tenantId));
  return { ok: true };
}

/** Switches a product module on or off for one workspace. */
export async function setTenantModule(db: Database, tenantId: string, moduleKey: string, enabled: boolean): Promise<TenantChange> {
  if (!(await tenantExists(db, tenantId))) return { ok: false, message: "Workspace not found." };
  const [known] = await db.select({ key: modules.key }).from(modules).where(eq(modules.key, moduleKey)).limit(1);
  if (!known) return { ok: false, message: "Module not found." };
  await db
    .insert(tenantModules)
    .values({ tenantId, moduleKey, enabled })
    .onConflictDoUpdate({ target: [tenantModules.tenantId, tenantModules.moduleKey], set: { enabled } });
  return { ok: true };
}

export async function listTenantModules(db: Database, tenantId: string): Promise<Array<{ key: string; name: string; enabled: boolean }>> {
  const rows = await db
    .select({ key: modules.key, name: modules.name, enabled: tenantModules.enabled })
    .from(modules)
    .leftJoin(tenantModules, and(eq(tenantModules.moduleKey, modules.key), eq(tenantModules.tenantId, tenantId)));
  return rows.map((row) => ({ key: row.key, name: row.name, enabled: row.enabled === true }));
}
