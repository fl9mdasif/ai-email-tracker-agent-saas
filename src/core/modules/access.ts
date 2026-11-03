import { and, eq } from "drizzle-orm";
import type { Database } from "@/core/db";
import { tenantModules, tenants } from "@/core/db/schema";

/** True only when the tenant has an enabled row for the module. */
export async function isModuleEnabled(db: Database, tenantId: string, moduleKey: string): Promise<boolean> {
  const [row] = await db
    .select({ enabled: tenantModules.enabled })
    .from(tenantModules)
    .where(and(eq(tenantModules.tenantId, tenantId), eq(tenantModules.moduleKey, moduleKey)))
    .limit(1);
  return row?.enabled === true;
}

export type TenantAccess = "ok" | "suspended" | "module_disabled" | "missing";

/** Whether a workspace may use a module right now: it exists, is not suspended, and has the module switched on. */
export async function getTenantAccess(db: Database, tenantId: string, moduleKey: string): Promise<TenantAccess> {
  const [tenant] = await db.select({ status: tenants.status }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) return "missing";
  if (tenant.status === "suspended") return "suspended";
  return (await isModuleEnabled(db, tenantId, moduleKey)) ? "ok" : "module_disabled";
}
