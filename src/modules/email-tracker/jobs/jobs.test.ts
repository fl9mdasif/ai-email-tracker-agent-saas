import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ANALYZE_TENANT_EVENT,
  SYNC_ACCOUNT_EVENT,
  analyzeTenantEventSchema,
  syncAccountEventSchema,
} from "./events";

describe("sync event", () => {
  const ids = {
    tenantId: "3f8c2c0e-7a5b-4d58-9f0e-2b6f1f3b7a11",
    accountId: "9a1d5c52-0f3e-4c1b-8d77-5e6a2b9c4d22",
  };

  it("has a stable name", () => {
    expect(SYNC_ACCOUNT_EVENT).toBe("email-tracker/account.sync");
  });

  it("accepts a tenant id and an account id", () => {
    expect(syncAccountEventSchema.parse(ids)).toEqual(ids);
  });

  it("rejects missing or malformed ids", () => {
    expect(syncAccountEventSchema.safeParse({ tenantId: ids.tenantId }).success).toBe(false);
    expect(syncAccountEventSchema.safeParse({ ...ids, accountId: "not-a-uuid" }).success).toBe(false);
    expect(syncAccountEventSchema.safeParse({}).success).toBe(false);
  });
});

describe("analyze event and job list", () => {
  it("accepts a tenant id only", () => {
    expect(ANALYZE_TENANT_EVENT).toBe("email-tracker/tenant.analyze");
    const tenantId = "3f8c2c0e-7a5b-4d58-9f0e-2b6f1f3b7a11";
    expect(analyzeTenantEventSchema.parse({ tenantId })).toEqual({ tenantId });
    expect(analyzeTenantEventSchema.safeParse({}).success).toBe(false);
    expect(analyzeTenantEventSchema.safeParse({ tenantId: "nope" }).success).toBe(false);
  });

  it("registers the sync jobs and the analysis job", async () => {
    const { emailTrackerJobs } = await import("./index");
    const ids = emailTrackerJobs.map((job) => (job as unknown as { id: () => string }).id());
    expect(ids).toEqual([
      "email-tracker-sync-account",
      "email-tracker-scheduled-sync",
      "email-tracker-analyze-tenant",
      "email-tracker-scheduled-analyze",
    ]);
  }, 30_000); // the first import loads the Inngest client and the database layer
});

// Runs against the real Neon database (env comes from vitest.config.mts); skipped when it is not configured.
const configured = Boolean(process.env.DATABASE_URL && process.env.CREDENTIALS_ENCRYPTION_KEY);

describe.skipIf(!configured)("listSyncableAccounts (Neon)", () => {
  const suffix = Date.now();
  const tenantIds: string[] = [];
  let db: Awaited<ReturnType<typeof import("@/core/db").getDb>>;
  let core: typeof import("@/core/db/schema");

  beforeAll(async () => {
    db = (await import("@/core/db")).getDb();
    core = await import("@/core/db/schema");
  }, 60_000);

  afterAll(async () => {
    if (tenantIds.length > 0) {
      await db.delete(core.tenants).where(inArray(core.tenants.id, tenantIds));
    }
  }, 60_000);

  it("lists IMAP accounts of every tenant, each with its own tenant id", async () => {
    const { ensureTenantUser } = await import("@/core/tenancy/provision");
    const { saveCredentials } = await import("@/core/vault");
    const { listSyncableAccounts } = await import("../sync/list-syncable-accounts");

    const a = (await ensureTenantUser(db, { email: `jobs-a-${suffix}@example.com` })).tenantId;
    const b = (await ensureTenantUser(db, { email: `jobs-b-${suffix}@example.com` })).tenantId;
    tenantIds.push(a, b);

    const make = (tenantId: string, provider: string, identity: string) =>
      saveCredentials(db, {
        tenantId,
        provider,
        authType: "app_password",
        label: "Test",
        identity,
        credentials: { password: "x" },
      });
    const accountA = await make(a, "imap", `a-${suffix}@example.com`);
    const accountB = await make(b, "imap", `b-${suffix}@example.com`);
    const other = await make(a, "some-other-provider", `c-${suffix}@example.com`);

    const listed = await listSyncableAccounts(db);
    expect(listed).toContainEqual({ tenantId: a, accountId: accountA.id });
    expect(listed).toContainEqual({ tenantId: b, accountId: accountB.id });
    expect(listed.map((item) => item.accountId)).not.toContain(other.id); // only IMAP for now
  }, 60_000);
});
