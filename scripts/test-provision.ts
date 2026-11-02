import { loadEnvConfig } from "@next/env";
import { eq } from "drizzle-orm";

loadEnvConfig(process.cwd());

async function main() {
  const { getDb } = await import("../src/core/db");
  const { tenants, tenantModules, users } = await import("../src/core/db/schema");
  const { ensureTenantUser } = await import("../src/core/tenancy/provision");
  const db = getDb();
  const email = `provision-test-${Date.now()}@example.com`;

  const a = await ensureTenantUser(db, { email, name: "Test User" });
  const b = await ensureTenantUser(db, { email: email.toUpperCase() });
  if (a.tenantId !== b.tenantId || a.userId !== b.userId) throw new Error("second sign-in created a duplicate");

  const mods = await db.select().from(tenantModules).where(eq(tenantModules.tenantId, a.tenantId));
  if (mods.length !== 1 || mods[0].moduleKey !== "email-tracker" || !mods[0].enabled) {
    throw new Error("default module not enabled");
  }
  const owners = await db.select().from(users).where(eq(users.tenantId, a.tenantId));
  if (owners.length !== 1 || owners[0].role !== "owner") throw new Error("owner not created");

  await db.delete(tenants).where(eq(tenants.id, a.tenantId)); // cascades
  console.log("provision test: ok (tenant+owner+module created once, repeat sign-in reused, cleaned up)");
}

main().catch((error: unknown) => {
  console.error("provision test failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
