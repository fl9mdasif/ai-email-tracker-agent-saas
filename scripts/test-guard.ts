import { loadEnvConfig } from "@next/env";
import { and, eq } from "drizzle-orm";

loadEnvConfig(process.cwd());

async function main() {
  const { getDb } = await import("../src/core/db");
  const { tenants, tenantModules } = await import("../src/core/db/schema");
  const { ensureTenantUser } = await import("../src/core/tenancy/provision");
  const { isModuleEnabled } = await import("../src/core/modules/guard");
  const db = getDb();
  const { tenantId } = await ensureTenantUser(db, { email: `guard-test-${Date.now()}@example.com` });

  const checks: Array<[string, boolean, boolean]> = [];
  checks.push(["enabled module", await isModuleEnabled(db, tenantId, "email-tracker"), true]);
  checks.push(["unknown module", await isModuleEnabled(db, tenantId, "jobai"), false]);

  await db
    .update(tenantModules)
    .set({ enabled: false })
    .where(and(eq(tenantModules.tenantId, tenantId), eq(tenantModules.moduleKey, "email-tracker")));
  checks.push(["disabled module", await isModuleEnabled(db, tenantId, "email-tracker"), false]);

  await db.delete(tenants).where(eq(tenants.id, tenantId));
  const failed = checks.filter(([, actual, expected]) => actual !== expected);
  for (const [name, actual, expected] of checks) console.log(`${actual === expected ? "ok  " : "FAIL"} ${name}`);
  if (failed.length > 0) process.exit(1);
}

main().catch((error: unknown) => {
  console.error("guard test failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
