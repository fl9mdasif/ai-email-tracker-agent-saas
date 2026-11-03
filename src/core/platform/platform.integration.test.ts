import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sanitizeDetails } from "./audit";

describe("sanitizeDetails", () => {
  it("keeps short plain values and drops anything that looks like a secret or mail text", () => {
    expect(
      sanitizeDetails({ plan: "pro", limit: 300, active: true, none: null, password: "x", refreshToken: "y", subject: "hi", body: "text", nested: { a: 1 }, list: [1] }),
    ).toEqual({ plan: "pro", limit: 300, active: true, none: null });
  });

  it("caps long text and the number of keys", () => {
    expect(sanitizeDetails({ note: "x".repeat(500) }).note).toHaveLength(200);
    const many = Object.fromEntries(Array.from({ length: 50 }, (_, index) => [`k${index}`, index]));
    expect(Object.keys(sanitizeDetails(many))).toHaveLength(20);
  });

  it("copes with nothing", () => {
    expect(sanitizeDetails(undefined)).toEqual({});
  });
});

// Runs against the real Neon database (env comes from vitest.config.mts); skipped when it is not configured.
const configured = Boolean(process.env.DATABASE_URL && process.env.CREDENTIALS_ENCRYPTION_KEY);

describe.skipIf(!configured)("platform staff, audit and plans (Neon)", () => {
  const suffix = Date.now();
  const tenantIds: string[] = [];
  const staffEmails: string[] = [];
  const ENV_LIST = `boss-${suffix}@example.com`;
  let db: Awaited<ReturnType<typeof import("@/core/db").getDb>>;
  let core: typeof import("@/core/db/schema");
  let staff: typeof import("./staff");
  let audit: typeof import("./audit");
  const addr = (name: string) => {
    const email = `${name}-${suffix}@example.com`;
    staffEmails.push(email);
    return email;
  };

  beforeAll(async () => {
    db = (await import("@/core/db")).getDb();
    core = await import("@/core/db/schema");
    staff = await import("./staff");
    audit = await import("./audit");
  }, 60_000);

  afterAll(async () => {
    if (tenantIds.length > 0) await db.delete(core.tenants).where(inArray(core.tenants.id, tenantIds));
    if (staffEmails.length > 0) {
      await db.delete(core.platformStaff).where(inArray(core.platformStaff.email, staffEmails));
      await db.delete(core.platformAuditLog).where(inArray(core.platformAuditLog.actorEmail, staffEmails));
    }
  }, 60_000);

  it("the shared role list matches the one stored in the database schema", async () => {
    const { STAFF_ROLES } = await import("./permissions");
    expect([...STAFF_ROLES]).toEqual([...core.STAFF_ROLES]);
  });

  it("adds staff, finds their role, and refuses a duplicate, a bad email and a bad role", async () => {
    const sam = addr("sam");
    expect(await staff.addStaff(db, { email: sam.toUpperCase(), role: "support", addedBy: ENV_LIST }, ENV_LIST)).toEqual({ ok: true });
    expect(await staff.getStaffRole(db, sam, ENV_LIST)).toEqual({ role: "support", locked: false });
    expect(await staff.addStaff(db, { email: sam, role: "admin", addedBy: ENV_LIST }, ENV_LIST)).toMatchObject({ ok: false });
    expect(await staff.addStaff(db, { email: "not-an-email", role: "admin", addedBy: ENV_LIST }, ENV_LIST)).toMatchObject({ ok: false });
    expect(await staff.addStaff(db, { email: addr("x"), role: "emperor" as never, addedBy: ENV_LIST }, ENV_LIST)).toMatchObject({ ok: false });
    expect(await staff.getStaffRole(db, `stranger-${suffix}@example.com`, ENV_LIST)).toBeNull();
  }, 60_000);

  it("changes a role and switches a person off and on", async () => {
    const lee = addr("lee");
    await staff.addStaff(db, { email: lee, role: "analyst", addedBy: ENV_LIST }, ENV_LIST);
    expect(await staff.setStaffRole(db, lee, "admin", ENV_LIST)).toEqual({ ok: true });
    expect(await staff.getStaffRole(db, lee, ENV_LIST)).toEqual({ role: "admin", locked: false });

    expect(await staff.setStaffDisabled(db, lee, true, ENV_LIST)).toEqual({ ok: true });
    expect(await staff.getStaffRole(db, lee, ENV_LIST)).toBeNull(); // disabled: no access at all
    expect(await staff.setStaffDisabled(db, lee, false, ENV_LIST)).toEqual({ ok: true });
    expect(await staff.getStaffRole(db, lee, ENV_LIST)).toEqual({ role: "admin", locked: false });

    expect(await staff.setStaffRole(db, `nobody-${suffix}@example.com`, "admin", ENV_LIST)).toMatchObject({ ok: false });
  }, 60_000);

  it("the super admins from the server settings can never be added, changed, disabled or locked out", async () => {
    expect(await staff.getStaffRole(db, ENV_LIST, ENV_LIST)).toEqual({ role: "super_admin", locked: true });
    expect(await staff.addStaff(db, { email: ENV_LIST, role: "support", addedBy: ENV_LIST }, ENV_LIST)).toMatchObject({ ok: false });
    expect(await staff.setStaffRole(db, ENV_LIST, "support", ENV_LIST)).toMatchObject({ ok: false });
    expect(await staff.setStaffDisabled(db, ENV_LIST, true, ENV_LIST)).toMatchObject({ ok: false });
    expect(await staff.getStaffRole(db, ENV_LIST, ENV_LIST)).toEqual({ role: "super_admin", locked: true });
  }, 60_000);

  it("lists the locked super admins first, then stored staff", async () => {
    const list = await staff.listStaff(db, ENV_LIST);
    expect(list[0]).toMatchObject({ email: ENV_LIST, role: "super_admin", locked: true });
    expect(list.some((member) => member.email === `sam-${suffix}@example.com` && !member.locked)).toBe(true);
  }, 60_000);

  it("writes audit rows without secrets and lists them per person, newest first", async () => {
    const actor = addr("auditor");
    await audit.writeAudit(db, { actorEmail: actor.toUpperCase(), actorRole: "admin", action: "tenant.suspend", targetType: "tenant", targetId: "t-1", details: { reason: "test", password: "hunter2", subject: "private" } });
    await audit.writeAudit(db, { actorEmail: actor, actorRole: "admin", action: "tenant.reactivate", targetType: "tenant", targetId: "t-1" });

    const rows = await audit.listAudit(db, { actorEmail: actor });
    expect(rows.map((row) => row.action)).toEqual(["tenant.reactivate", "tenant.suspend"]);
    expect(rows[1].details).toEqual({ reason: "test" });
    expect(JSON.stringify(rows)).not.toMatch(/hunter2|private/);
    expect(rows.every((row) => row.actorEmail === actor)).toBe(true);
  }, 60_000);

  it("ships three plans with exactly one default, and a new workspace starts on it", async () => {
    const all = await db.select().from(core.plans);
    expect(all.map((plan) => plan.key).sort()).toEqual(expect.arrayContaining(["free", "pro", "starter"]));
    expect(all.filter((plan) => plan.isDefault)).toHaveLength(1);

    const { ensureTenantUser, findDefaultPlanId } = await import("@/core/tenancy/provision");
    const { tenantId } = await ensureTenantUser(db, { email: `plan-${suffix}@example.com` });
    tenantIds.push(tenantId);
    const [tenant] = await db.select({ planId: core.tenants.planId, status: core.tenants.status }).from(core.tenants).where(eq(core.tenants.id, tenantId));
    expect(tenant.status).toBe("active");
    expect(tenant.planId).toBe(await findDefaultPlanId(db));
    expect(tenant.planId).not.toBeNull();
  }, 60_000);

  it("signing in again records the last sign-in time", async () => {
    const { ensureTenantUser } = await import("@/core/tenancy/provision");
    const email = `login-${suffix}@example.com`;
    const { tenantId, userId } = await ensureTenantUser(db, { email });
    tenantIds.push(tenantId);
    await db.update(core.users).set({ lastLoginAt: new Date("2020-01-01T00:00:00Z") }).where(eq(core.users.id, userId));
    await ensureTenantUser(db, { email });
    const [user] = await db.select({ lastLoginAt: core.users.lastLoginAt }).from(core.users).where(eq(core.users.id, userId));
    expect(user.lastLoginAt!.getTime()).toBeGreaterThan(Date.now() - 60_000);
  }, 60_000);
});
