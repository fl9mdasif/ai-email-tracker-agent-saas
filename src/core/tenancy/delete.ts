import { eq } from "drizzle-orm";
import type { Database } from "@/core/db";
import { tenants } from "@/core/db/schema";

/**
 * Deletes a workspace and everything under it. Every table that holds tenant data references the
 * tenant with ON DELETE CASCADE, so one delete removes the users, accounts and their encrypted
 * credentials, mail, AI results, follow-ups and usage log. This cannot be undone.
 * Returns true when the tenant existed.
 */
export async function deleteTenant(db: Database, tenantId: string): Promise<boolean> {
  const deleted = await db.delete(tenants).where(eq(tenants.id, tenantId)).returning({ id: tenants.id });
  return deleted.length > 0;
}
