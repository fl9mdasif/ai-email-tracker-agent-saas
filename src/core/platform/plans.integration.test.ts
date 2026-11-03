import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PlanInput } from "./plans-pure";

// Runs against the real Neon database (env comes from vitest.config.mts); skipped when it is not configured.
const configured = Boolean(process.env.DATABASE_URL && process.env.CREDENTIALS_ENCRYPTION_KEY);

describe.skipIf(!configured)("plans (Neon)", () => {
  const suffix = Date.now();
  const tenantIds: string[] = [];
  const planKeys: string[] = [];
  let db: Awaited<ReturnType<typeof import("@/core/db").getDb>>;
  let core: typeof import("@/core/db/schema");
  let plans: typeof import("./plans");
  /** The real default plan, put back at the end whatever happens. */
  let originalDefaultId: string;

  const input = (name: string, overrides: Partial<PlanInput> = {}): PlanInput => {
    const key = `t-${name}-${suffix}`;
    planKeys.push(key);
    return { key, name: `Test ${name}`, priceMonthlyCents: 1000, currency: "USD", maxAccounts: 2, dailyAiLimit: 100, active: true, ...overrides };
  };

  /** The part of a plan that can be edited: everything except the key. */
  const editable = (data: PlanInput): Omit<PlanInput, "key"> => ({
    name: data.name,
    priceMonthlyCents: data.priceMonthlyCents,
    currency: data.currency,
    maxAccounts: data.maxAccounts,
    dailyAiLimit: data.dailyAiLimit,
    active: data.active,
  });

  beforeAll(async () => {
    db = (await import("@/core/db")).getDb();
    core = await import("@/core/db/schema");
    plans = await import("./plans");
    const { findDefaultPlanId } = await import("@/core/tenancy/provision");
    const current = await findDefaultPlanId(db);
    if (!current) throw new Error("no default plan to restore; run the migration first");
    originalDefaultId = current;
  }, 60_000);

  afterAll(async () => {
    // Put the real default back first, then remove the test plans and workspaces.
    await plans.setDefaultPlan(db, originalDefaultId, "test-cleanup");
    if (tenantIds.length > 0) await db.delete(core.tenants).where(inArray(core.tenants.id, tenantIds));
    if (planKeys.length > 0) await db.delete(core.plans).where(inArray(core.plans.key, planKeys));
  }, 60_000);

  it("creates a plan that is not the default, and refuses a key that is already taken", async () => {
    const data = input("create");
    const created = await plans.createPlan(db, data);
    expect(created.ok).toBe(true);
    const stored = created.ok ? await plans.getPlan(db, created.id) : null;
    expect(stored).toMatchObject({ key: data.key, name: "Test create", priceMonthlyCents: 1000, maxAccounts: 2, dailyAiLimit: 100, isDefault: false, active: true });

    expect(await plans.createPlan(db, data)).toEqual({ ok: false, message: "A plan with this key already exists." });
  }, 60_000);

  it("edits everything except the key", async () => {
    const data = input("edit");
    const created = await plans.createPlan(db, data);
    if (!created.ok) throw new Error("setup failed");
    const rest = editable(data);
    expect(await plans.updatePlan(db, created.id, { ...rest, name: "Renamed", priceMonthlyCents: 2500, maxAccounts: 5, dailyAiLimit: 700, active: false })).toEqual({ ok: true, id: created.id });
    expect(await plans.getPlan(db, created.id)).toMatchObject({ key: data.key, name: "Renamed", priceMonthlyCents: 2500, maxAccounts: 5, dailyAiLimit: 700, active: false });
    expect(await plans.updatePlan(db, "00000000-0000-0000-0000-000000000000", rest)).toMatchObject({ ok: false });
    expect(await plans.updatePlan(db, "not-an-id", rest)).toMatchObject({ ok: false });
  }, 60_000);

  it("the default plan is exactly one, active, and cannot be switched off", async () => {
    const created = await plans.createPlan(db, input("default"));
    if (!created.ok) throw new Error("setup failed");

    expect(await plans.setDefaultPlan(db, created.id, "tester")).toEqual({ ok: true, id: created.id });
    const all = await db.select().from(core.plans);
    expect(all.filter((plan) => plan.isDefault).map((plan) => plan.id)).toEqual([created.id]); // only this one

    // Both places that remember the default agree, so a new workspace really starts on it.
    const { findDefaultPlanId } = await import("@/core/tenancy/provision");
    expect(await findDefaultPlanId(db)).toBe(created.id);
    const { ensureTenantUser } = await import("@/core/tenancy/provision");
    const { tenantId } = await ensureTenantUser(db, { email: `plans-${suffix}@example.com` });
    tenantIds.push(tenantId);
    const [tenant] = await db.select({ planId: core.tenants.planId }).from(core.tenants).where(eq(core.tenants.id, tenantId));
    expect(tenant.planId).toBe(created.id);

    expect(await plans.updatePlan(db, created.id, { ...editable(input("default-again")), active: false })).toMatchObject({ ok: false });
    expect((await plans.getPlan(db, created.id))?.active).toBe(true);
  }, 90_000);

  it("a switched-off plan cannot become the default", async () => {
    const created = await plans.createPlan(db, input("off", { active: false }));
    if (!created.ok) throw new Error("setup failed");
    expect(await plans.setDefaultPlan(db, created.id, "tester")).toMatchObject({ ok: false });
    expect(await plans.setDefaultPlan(db, "nope", "tester")).toMatchObject({ ok: false });
    const defaults = (await db.select().from(core.plans)).filter((plan) => plan.isDefault);
    expect(defaults).toHaveLength(1); // still exactly one
  }, 60_000);

  it("counts active workspaces per plan, and a suspended workspace is not counted", async () => {
    const created = await plans.createPlan(db, input("count"));
    if (!created.ok) throw new Error("setup failed");
    const { ensureTenantUser } = await import("@/core/tenancy/provision");
    const a = (await ensureTenantUser(db, { email: `count-a-${suffix}@example.com` })).tenantId;
    const b = (await ensureTenantUser(db, { email: `count-b-${suffix}@example.com` })).tenantId;
    tenantIds.push(a, b);
    await db.update(core.tenants).set({ planId: created.id }).where(inArray(core.tenants.id, [a, b]));

    const listed = await plans.listPlansWithUsage(db);
    expect(listed.find((plan) => plan.id === created.id)?.tenants).toBe(2);

    await db.update(core.tenants).set({ status: "suspended" }).where(eq(core.tenants.id, b));
    expect((await plans.listPlansWithUsage(db)).find((plan) => plan.id === created.id)?.tenants).toBe(1);
    expect((await plans.countTenantsByPlan(db)).find((entry) => entry.planId === created.id)?.tenants).toBe(1);
  }, 90_000);

  it("lists plans cheapest first", async () => {
    const prices = (await plans.listPlansWithUsage(db)).map((plan) => plan.priceMonthlyCents);
    expect(prices).toEqual([...prices].sort((x, y) => x - y));
  }, 60_000);
});
