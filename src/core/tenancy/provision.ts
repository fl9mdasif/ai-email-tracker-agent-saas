import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "@/core/db";
import { tenantModules, tenants, users } from "@/core/db/schema";

export type SignedInProfile = {
  email: string;
  name?: string | null;
  image?: string | null;
};

export type TenantUser = { userId: string; tenantId: string };

/** Modules a brand-new tenant gets enabled. */
const DEFAULT_MODULES = ["email-tracker"] as const;

/**
 * Finds the user for a verified email, or creates a tenant, its owner and the
 * default module flags in one atomic batch. Safe to call on every sign-in.
 */
export async function ensureTenantUser(
  db: Database,
  profile: SignedInProfile,
): Promise<TenantUser> {
  const email = profile.email.trim().toLowerCase();

  const existing = await findUser(db, email);
  if (existing) return existing;

  const tenantId = randomUUID();
  const userId = randomUUID();
  const displayName = profile.name?.trim() || email;

  try {
    await db.batch([
      db.insert(tenants).values({ id: tenantId, name: displayName }),
      db.insert(users).values({
        id: userId,
        tenantId,
        email,
        name: profile.name ?? null,
        image: profile.image ?? null,
        role: "owner",
      }),
      db
        .insert(tenantModules)
        .values(DEFAULT_MODULES.map((moduleKey) => ({ tenantId, moduleKey, enabled: true }))),
    ]);
  } catch (error) {
    // A concurrent first sign-in may have won the race on the unique email.
    const winner = await findUser(db, email);
    if (winner) return winner;
    throw error;
  }

  return { userId, tenantId };
}

async function findUser(db: Database, email: string): Promise<TenantUser | null> {
  const [row] = await db
    .select({ userId: users.id, tenantId: users.tenantId })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return row ?? null;
}
