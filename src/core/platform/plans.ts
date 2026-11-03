import { asc, eq, sql } from "drizzle-orm";
import type { Database } from "@/core/db";
import { platformSettings, plans, tenants } from "@/core/db/schema";
import type { PlanInput, PlanUsage } from "./plans-pure";

export type PlanRow = {
  id: string;
  key: string;
  name: string;
  priceMonthlyCents: number;
  currency: string;
  maxAccounts: number;
  dailyAiLimit: number;
  isDefault: boolean;
  active: boolean;
};

export type PlanWithUsage = PlanRow & { tenants: number };

export type PlanChange = { ok: true; id: string } | { ok: false; message: string };

const planColumns = {
  id: plans.id,
  key: plans.key,
  name: plans.name,
  priceMonthlyCents: plans.priceMonthlyCents,
  currency: plans.currency,
  maxAccounts: plans.maxAccounts,
  dailyAiLimit: plans.dailyAiLimit,
  isDefault: plans.isDefault,
  active: plans.active,
};

/** How many active workspaces are on each plan (workspaces without a plan are counted under null). */
export async function countTenantsByPlan(db: Database): Promise<PlanUsage[]> {
  const rows = await db
    .select({ planId: tenants.planId, total: sql<number>`count(*)::int` })
    .from(tenants)
    .where(eq(tenants.status, "active"))
    .groupBy(tenants.planId);
  return rows.map((row) => ({ planId: row.planId, tenants: row.total }));
}

/** Every plan, cheapest first, with the number of active workspaces on it. */
export async function listPlansWithUsage(db: Database): Promise<PlanWithUsage[]> {
  const [all, usage] = await Promise.all([db.select(planColumns).from(plans).orderBy(asc(plans.priceMonthlyCents), asc(plans.name)), countTenantsByPlan(db)]);
  const byPlan = new Map(usage.map((entry) => [entry.planId, entry.tenants]));
  return all.map((plan) => ({ ...plan, tenants: byPlan.get(plan.id) ?? 0 }));
}

export async function getPlan(db: Database, planId: string): Promise<PlanRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(planId)) return null;
  const [row] = await db.select(planColumns).from(plans).where(eq(plans.id, planId)).limit(1);
  return row ?? null;
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const causeCode = (error as { cause?: { code?: string } } | null)?.cause?.code;
  return code === "23505" || causeCode === "23505";
}

/** Adds a plan. The key must be new. A new plan is never the default until someone makes it so. */
export async function createPlan(db: Database, input: PlanInput): Promise<PlanChange> {
  try {
    const [row] = await db
      .insert(plans)
      .values({ ...input, isDefault: false })
      .returning({ id: plans.id });
    return { ok: true, id: row.id };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, message: "A plan with this key already exists." };
    throw error;
  }
}

/** Edits a plan. The key never changes after creation, and the default plan cannot be switched off. */
export async function updatePlan(db: Database, planId: string, input: Omit<PlanInput, "key">): Promise<PlanChange> {
  const current = await getPlan(db, planId);
  if (!current) return { ok: false, message: "Plan not found." };
  if (current.isDefault && !input.active) return { ok: false, message: "Make another plan the default before switching this one off." };
  await db
    .update(plans)
    .set({
      name: input.name,
      priceMonthlyCents: input.priceMonthlyCents,
      currency: input.currency,
      maxAccounts: input.maxAccounts,
      dailyAiLimit: input.dailyAiLimit,
      active: input.active,
    })
    .where(eq(plans.id, planId));
  return { ok: true, id: planId };
}

/**
 * Makes one active plan the one new workspaces start on, and only that one. Both places that
 * remember the default are changed together so they can never disagree.
 */
export async function setDefaultPlan(db: Database, planId: string, updatedBy: string): Promise<PlanChange> {
  const plan = await getPlan(db, planId);
  if (!plan) return { ok: false, message: "Plan not found." };
  if (!plan.active) return { ok: false, message: "Switch the plan on before making it the default." };
  await db.batch([
    db.update(plans).set({ isDefault: false }).where(eq(plans.isDefault, true)),
    db.update(plans).set({ isDefault: true }).where(eq(plans.id, planId)),
    db
      .insert(platformSettings)
      .values({ id: "platform", defaultPlanId: planId, updatedBy })
      .onConflictDoUpdate({ target: platformSettings.id, set: { defaultPlanId: planId, updatedBy, updatedAt: new Date() } }),
  ]);
  return { ok: true, id: planId };
}
