import { redirect } from "next/navigation";
import { auth } from "@/core/auth";
import { getDb } from "@/core/db";
import { getTenantAccess } from "./access";

export { getTenantAccess, isModuleEnabled, type TenantAccess } from "./access";

/**
 * Route guard for a module's pages. Signed-out users go to /login, suspended workspaces to
 * /suspended, tenants without the module to /module-disabled. The tenant comes from the
 * session, never from the request.
 */
export async function requireModule(moduleKey: string) {
  const session = await auth();
  if (!session?.tenantId) redirect("/login");
  const access = await getTenantAccess(getDb(), session.tenantId, moduleKey);
  if (access === "missing") redirect("/login");
  if (access === "suspended") redirect("/suspended");
  if (access === "module_disabled") redirect(`/module-disabled?module=${encodeURIComponent(moduleKey)}`);
  return session;
}
