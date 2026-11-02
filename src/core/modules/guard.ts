import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/core/auth";
import { getDb, type Database } from "@/core/db";
import { tenantModules } from "@/core/db/schema";

/** True only when the tenant has an enabled row for the module. */
export async function isModuleEnabled(
  db: Database,
  tenantId: string,
  moduleKey: string,
): Promise<boolean> {
  const [row] = await db
    .select({ enabled: tenantModules.enabled })
    .from(tenantModules)
    .where(and(eq(tenantModules.tenantId, tenantId), eq(tenantModules.moduleKey, moduleKey)))
    .limit(1);
  return row?.enabled === true;
}

/**
 * Route guard for a module's pages. Signed-out users go to /login, tenants
 * without the module go to /module-disabled. The tenant comes from the
 * session, never from the request.
 */
export async function requireModule(moduleKey: string) {
  const session = await auth();
  if (!session?.tenantId) redirect("/login");
  if (!(await isModuleEnabled(getDb(), session.tenantId, moduleKey))) {
    redirect(`/module-disabled?module=${encodeURIComponent(moduleKey)}`);
  }
  return session;
}
