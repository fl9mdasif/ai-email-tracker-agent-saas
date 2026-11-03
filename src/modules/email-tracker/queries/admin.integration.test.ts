import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NormalizedEmail } from "../types";

// Runs against the real Neon database (env comes from vitest.config.mts); skipped when it is not configured.
const configured = Boolean(process.env.DATABASE_URL && process.env.CREDENTIALS_ENCRYPTION_KEY);

describe.skipIf(!configured)("platform staff view of workspaces (Neon)", () => {
  const suffix = Date.now();
  const tenantIds: string[] = [];
  let db: Awaited<ReturnType<typeof import("@/core/db").getDb>>;
  let core: typeof import("@/core/db/schema");
  let et: typeof import("../db/schema");
  let admin: typeof import("./admin");
  let ta: typeof import("@/core/platform/tenant-admin");
  let tenantA: string;
  let tenantB: string;
  const SECRET_SUBJECT = `Private subject ${suffix}`;
  const SECRET_BODY = `Private body ${suffix}`;

  const mail = (tag: string, from: string): NormalizedEmail => ({
    providerMessageId: `${tag}-${suffix}@test`,
    threadId: `${tag}-${suffix}@test`,
    from: { address: from, name: "Sender" },
    to: ["owner@example.com"],
    subject: SECRET_SUBJECT,
    snippet: "s",
    bodyText: SECRET_BODY,
    receivedAt: new Date(Date.now() - 60_000),
    direction: "inbound",
    status: "unread",
    labels: [],
  });

  beforeAll(async () => {
    db = (await import("@/core/db")).getDb();
    core = await import("@/core/db/schema");
    et = await import("../db/schema");
    admin = await import("./admin");
    ta = await import("@/core/platform/tenant-admin");
    const { ensureTenantUser } = await import("@/core/tenancy/provision");
    const { saveCredentials } = await import("@/core/vault");
    const { syncAccount } = await import("../sync/sync-account");

    tenantA = (await ensureTenantUser(db, { email: `adm-a-${suffix}@example.com`, name: `Alpha ${suffix}` })).tenantId;
    tenantB = (await ensureTenantUser(db, { email: `adm-b-${suffix}@example.com`, name: `Beta ${suffix}` })).tenantId;
    tenantIds.push(tenantA, tenantB);

    const account = await saveCredentials(db, {
      tenantId: tenantA,
      provider: "imap",
      authType: "app_password",
      label: "Test",
      identity: `adm-${suffix}@example.com`,
      brand: "hostinger",
      credentials: { preset: "hostinger", host: "imap.hostinger.com", port: 993, secure: true, user: `adm-${suffix}@example.com`, password: "x" },
    });
    await saveCredentials(db, {
      tenantId: tenantB,
      provider: "imap",
      authType: "app_password",
      label: "Test",
      identity: `adm-b-${suffix}@example.com`,
      credentials: { preset: "hostinger", host: "imap.hostinger.com", port: 993, secure: true, user: `adm-b-${suffix}@example.com`, password: "x" },
    });
    await syncAccount(db, tenantA, account.id, {
      fetchEmails: async () => ({
        emails: [mail("l1", "lead1@client.com"), mail("l2", "lead1@client.com"), mail("l3", "lead2@client.com"), mail("n1", "news@promo.com")],
        cursor: { uidValidity: "1", lastUid: 4 },
        fetched: 4,
      }),
    });

    // Three "Lead replied" mails from two different senders, one newsletter.
    const emails = await db.select({ id: et.etEmails.id, subject: et.etEmails.subject, provider: et.etEmails.providerMessageId }).from(et.etEmails).where(eq(et.etEmails.tenantId, tenantA));
    for (const email of emails) {
      const isLead = email.provider.startsWith("l");
      await db.insert(et.etEmailAnalysis).values({
        tenantId: tenantA,
        emailId: email.id,
        status: "analyzed",
        category: isLead ? "lead_reply" : "newsletter_or_promo",
        priority: isLead ? 1 : 3,
        needsReply: isLead,
        summary: "s",
        suggestedAction: "a",
        model: "m",
        attempts: 1,
      });
    }

    // Usage: a paid-model call (counted, costs money), a free-tier call (counted, costs nothing) and a failed call (not counted).
    await db.insert(core.llmUsage).values([
      { tenantId: tenantA, usageTag: "email-analysis", model: "gpt-4.1-mini", status: "ok", inputTokens: 1_000_000, outputTokens: 0 },
      { tenantId: tenantA, usageTag: "email-analysis", model: "openai/gpt-oss-20b", status: "ok", inputTokens: 5_000_000, outputTokens: 5_000_000 },
      { tenantId: tenantA, usageTag: "email-analysis", model: "gpt-4.1-mini", status: "error", inputTokens: 9_000_000, outputTokens: 0 },
    ]);
  }, 180_000);

  afterAll(async () => {
    if (tenantIds.length > 0) await db.delete(core.tenants).where(inArray(core.tenants.id, tenantIds));
  }, 60_000);

  it("lists workspaces with accurate counts, AI-detected leads as different senders, and estimated cost", async () => {
    const rows = await admin.listTenantsOverview(db, { search: `adm-a-${suffix}` });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: tenantA,
      name: `Alpha ${suffix}`,
      ownerEmail: `adm-a-${suffix}@example.com`,
      status: "active",
      accounts: 1,
      mailLast24h: 4,
      leads: 2, // three lead mails, but only two different senders
      aiCalls30d: 2, // the failed call is not counted
    });
    expect(rows[0].estCostUsd).toBeCloseTo(0.4, 6); // 1M input tokens of gpt-4.1-mini; the Groq call is free
    expect(rows[0].planName).not.toBeNull();
    expect(rows[0].lastLoginAt).not.toBeNull();
  }, 90_000);

  it("search matches the workspace name or the owner email, and finds nothing for a stranger", async () => {
    expect((await admin.listTenantsOverview(db, { search: `Beta ${suffix}` })).map((row) => row.id)).toEqual([tenantB]);
    expect((await admin.listTenantsOverview(db, { search: `ADM-B-${suffix}` })).map((row) => row.id)).toEqual([tenantB]);
    expect(await admin.listTenantsOverview(db, { search: `nobody-${suffix}` })).toEqual([]);
    expect(await admin.listTenantsOverview(db, { search: "100%_" })).toEqual([]); // % and _ are matched literally
  }, 90_000);

  it("one workspace in detail, and nothing that reveals email text or credentials", async () => {
    const detail = await admin.getTenantDetail(db, tenantA);
    expect(detail).toMatchObject({ id: tenantA, mailStored: 4, leads: 2, aiCalls30d: 2 });
    expect(detail?.accountList).toEqual([expect.objectContaining({ identity: `adm-${suffix}@example.com`, provider: "imap", status: "connected" })]);
    expect(detail?.recentRuns[0]).toMatchObject({ account: `adm-${suffix}@example.com`, status: "success", fetched: 4, inserted: 4 });
    expect(detail?.aiByDay).toHaveLength(30);
    expect(detail?.aiByDay[29].calls).toBe(2); // today
    expect(detail?.scan).toEqual({ paused: false, lastScanStartedAt: null });

    const everything = JSON.stringify([detail, await admin.listTenantsOverview(db, {}), await admin.getPlatformTotals(db)]);
    expect(everything).not.toContain(SECRET_SUBJECT);
    expect(everything).not.toContain(SECRET_BODY);
    expect(everything).not.toMatch(/encrypted|password|lead1@client\.com|news@promo\.com/);
  }, 90_000);

  it("returns nothing for a bad or unknown id", async () => {
    expect(await admin.getTenantDetail(db, "not-an-id")).toBeNull();
    expect(await admin.getTenantDetail(db, "00000000-0000-0000-0000-000000000000")).toBeNull();
  }, 60_000);

  it("changes status, plan, AI limit and modules, and refuses bad input", async () => {
    expect(await ta.setTenantStatus(db, tenantA, "suspended")).toEqual({ ok: true });
    expect((await admin.getTenantDetail(db, tenantA))?.status).toBe("suspended");
    expect(await ta.setTenantStatus(db, tenantA, "active")).toEqual({ ok: true });
    expect(await ta.setTenantStatus(db, "00000000-0000-0000-0000-000000000000", "suspended")).toMatchObject({ ok: false });

    const [pro] = await db.select({ id: core.plans.id }).from(core.plans).where(eq(core.plans.key, "pro"));
    expect(await ta.setTenantPlan(db, tenantA, pro.id)).toEqual({ ok: true });
    expect((await admin.getTenantDetail(db, tenantA))?.planId).toBe(pro.id);
    expect(await ta.setTenantPlan(db, tenantA, "nope")).toMatchObject({ ok: false });
    expect(await ta.setTenantPlan(db, tenantA, "00000000-0000-0000-0000-000000000000")).toMatchObject({ ok: false });

    expect(await ta.setTenantAiLimit(db, tenantA, 120)).toEqual({ ok: true });
    expect((await admin.getTenantDetail(db, tenantA))?.aiDailyLimit).toBe(120);
    expect(await ta.setTenantAiLimit(db, tenantA, null)).toEqual({ ok: true });
    expect((await admin.getTenantDetail(db, tenantA))?.aiDailyLimit).toBeNull();
    for (const bad of [-1, 1.5, 100_001]) expect(await ta.setTenantAiLimit(db, tenantA, bad)).toMatchObject({ ok: false });

    expect(await ta.setTenantModule(db, tenantA, "email-tracker", false)).toEqual({ ok: true });
    expect((await ta.listTenantModules(db, tenantA)).find((module) => module.key === "email-tracker")?.enabled).toBe(false);
    expect(await ta.setTenantModule(db, tenantA, "email-tracker", true)).toEqual({ ok: true });
    expect(await ta.setTenantModule(db, tenantA, "no-such-module", true)).toMatchObject({ ok: false });
  }, 120_000);

  it("a suspended workspace is blocked by the access guard and skipped by the sync scheduler", async () => {
    const { getTenantAccess } = await import("@/core/modules/access");
    const { listSyncableAccounts } = await import("../sync/list-syncable-accounts");

    expect(await getTenantAccess(db, tenantA, "email-tracker")).toBe("ok");
    expect((await listSyncableAccounts(db)).some((account) => account.tenantId === tenantA)).toBe(true);

    await ta.setTenantStatus(db, tenantA, "suspended");
    expect(await getTenantAccess(db, tenantA, "email-tracker")).toBe("suspended");
    expect((await listSyncableAccounts(db)).some((account) => account.tenantId === tenantA)).toBe(false);
    expect((await listSyncableAccounts(db)).some((account) => account.tenantId === tenantB)).toBe(true); // others unaffected

    await ta.setTenantStatus(db, tenantA, "active");
    await ta.setTenantModule(db, tenantA, "email-tracker", false);
    expect(await getTenantAccess(db, tenantA, "email-tracker")).toBe("module_disabled");
    await ta.setTenantModule(db, tenantA, "email-tracker", true);

    expect(await getTenantAccess(db, "00000000-0000-0000-0000-000000000000", "email-tracker")).toBe("missing");
  }, 120_000);

  it("clears a paused scan without starting one, for that workspace only", async () => {
    const scan = await import("../scan/scan-state");
    await scan.pauseScan(db, tenantA);
    await scan.pauseScan(db, tenantB);
    await scan.clearPause(db, tenantA);
    expect(await scan.isScanPaused(db, tenantA)).toBe(false);
    expect(await scan.isScanPaused(db, tenantB)).toBe(true);
    expect((await admin.getTenantDetail(db, tenantA))?.scan.lastScanStartedAt).toBeNull(); // nothing was started
  }, 90_000);

  it("platform totals count real things", async () => {
    const totals = await admin.getPlatformTotals(db);
    expect(totals.tenants).toBeGreaterThanOrEqual(2);
    expect(totals.accounts).toBeGreaterThanOrEqual(2);
    expect(totals.emailsStored).toBeGreaterThanOrEqual(4);
    expect(totals.analysesOkLast24h).toBeGreaterThanOrEqual(2);
    expect(totals.analysesFailedLast24h).toBeGreaterThanOrEqual(1);
  }, 60_000);
});
