import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Database } from "@/core/db";
import { platformSettings, plans, tenantModules, tenants, users } from "@/core/db/schema";

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
  if (existing) {
    await touchLastLogin(db, existing.userId);
    return existing;
  }

  const tenantId = randomUUID();
  const userId = randomUUID();
  const displayName = profile.name?.trim() || email;
  const planId = await findDefaultPlanId(db);

  try {
    await db.batch([
      db.insert(tenants).values({ id: tenantId, name: displayName, planId }),
      db.insert(users).values({
        id: userId,
        tenantId,
        email,
        name: profile.name ?? null,
        image: profile.image ?? null,
        role: "owner",
        lastLoginAt: new Date(),
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

/** Remembers when this person last signed in, for the platform dashboard. A failure here never blocks sign-in. */
async function touchLastLogin(db: Database, userId: string): Promise<void> {
  try {
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
  } catch {
    // Not worth failing a sign-in over.
  }
}

/** The plan new tenants start on: the one the platform settings name, else the plan marked default. */
export async function findDefaultPlanId(db: Database): Promise<string | null> {
  const [settings] = await db
    .select({ defaultPlanId: platformSettings.defaultPlanId })
    .from(platformSettings)
    .where(eq(platformSettings.id, "platform"))
    .limit(1);
  if (settings?.defaultPlanId) return settings.defaultPlanId;
  const [plan] = await db.select({ id: plans.id }).from(plans).where(and(eq(plans.isDefault, true), eq(plans.active, true))).limit(1);
  return plan?.id ?? null;
}

async function findUser(db: Database, email: string): Promise<TenantUser | null> {
  const [row] = await db
    .select({ userId: users.id, tenantId: users.tenantId })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return row ?? null;
}
