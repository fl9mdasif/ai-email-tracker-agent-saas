import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Runs against the real Neon database (env comes from vitest.config.mts); skipped when it is not configured.
const configured = Boolean(process.env.DATABASE_URL && process.env.CREDENTIALS_ENCRYPTION_KEY);

describe.skipIf(!configured)("email queries (Neon)", () => {
  const suffix = Date.now();
  const tenantIds: string[] = [];
  let db: Awaited<ReturnType<typeof import("@/core/db").getDb>>;
  let core: typeof import("@/core/db/schema");
  let queries: typeof import("./emails");
  let sync: typeof import("../sync/sync-account");
  let tenantA: string;
  let tenantB: string;
  let accountA: string;

  beforeAll(async () => {
    db = (await import("@/core/db")).getDb();
    core = await import("@/core/db/schema");
    queries = await import("./emails");
    sync = await import("../sync/sync-account");
    const { ensureTenantUser } = await import("@/core/tenancy/provision");
    const { saveCredentials } = await import("@/core/vault");
    tenantA = (await ensureTenantUser(db, { email: `q-a-${suffix}@example.com` })).tenantId;
    tenantB = (await ensureTenantUser(db, { email: `q-b-${suffix}@example.com` })).tenantId;
    tenantIds.push(tenantA, tenantB);
    accountA = (
      await saveCredentials(db, {
        tenantId: tenantA,
        provider: "imap",
        authType: "app_password",
        label: "Test",
        identity: `q-${suffix}@example.com`,
        credentials: {
          preset: "hostinger",
          host: "imap.hostinger.com",
          port: 993,
          secure: true,
          user: `q-${suffix}@example.com`,
          password: "x",
        },
      })
    ).id;

    const mail = (n: number) => ({
      providerMessageId: `q${n}-${suffix}@test`,
      threadId: `q${n}-${suffix}@test`,
      from: { address: "maria@client.com", name: "Maria" },
      to: ["owner@example.com"],
      subject: `Query test ${n}`,
      snippet: "snippet",
      bodyText: "a long body that previews must not include",
      receivedAt: new Date(`2026-10-0${n}T08:00:00Z`),
      direction: "inbound" as const,
      status: "unread" as const,
      labels: [],
    });
    await sync.syncAccount(db, tenantA, accountA, {
      fetchEmails: async () => ({
        emails: [mail(1), mail(2), mail(3)],
        cursor: { uidValidity: "1", lastUid: 3 },
        fetched: 3,
      }),
    });
  }, 90_000);

  afterAll(async () => {
    if (tenantIds.length > 0) {
      await db.delete(core.tenants).where(inArray(core.tenants.id, tenantIds));
    }
  }, 60_000);

  it("lists the newest mail first and never includes the body", async () => {
    const emails = await queries.listLatestEmails(db, tenantA, 20);
    expect(emails.map((email) => email.subject)).toEqual(["Query test 3", "Query test 2", "Query test 1"]);
    expect(emails[0]).not.toHaveProperty("bodyText");
  }, 60_000);

  it("respects the limit", async () => {
    expect(await queries.listLatestEmails(db, tenantA, 2)).toHaveLength(2);
  }, 60_000);

  it("shows another tenant nothing", async () => {
    expect(await queries.listLatestEmails(db, tenantB, 20)).toEqual([]);
    expect(await queries.listRecentSyncRuns(db, tenantB)).toEqual([]);
  }, 60_000);

  it("lists the tenant's own sync runs", async () => {
    const runs = await queries.listRecentSyncRuns(db, tenantA);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ accountId: accountA, status: "success", insertedCount: 3, fetchedCount: 3 });
  }, 60_000);
});
