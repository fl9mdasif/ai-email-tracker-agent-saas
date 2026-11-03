import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NormalizedEmail } from "../types";

// Runs against the real Neon database (env comes from vitest.config.mts); skipped when it is not configured.
const configured = Boolean(process.env.DATABASE_URL && process.env.CREDENTIALS_ENCRYPTION_KEY);

describe.skipIf(!configured)("export, usage and workspace delete (Neon)", () => {
  const suffix = Date.now();
  const tenantIds: string[] = [];
  const SECRET = `rt-secret-${suffix}`;
  let db: Awaited<ReturnType<typeof import("@/core/db").getDb>>;
  let core: typeof import("@/core/db/schema");
  let et: typeof import("../db/schema");
  let exportQ: typeof import("./export");
  let usageQ: typeof import("./usage");
  let m: typeof import("./mutations");
  let tenantA: string;
  let tenantB: string;
  let tenantC: string;

  const mail = (tag: string): NormalizedEmail => ({
    providerMessageId: `${tag}-${suffix}@test`,
    threadId: `${tag}-${suffix}@test`,
    from: { address: "maria@client.com", name: "Maria" },
    to: ["owner@example.com"],
    subject: `Subject ${tag}`,
    snippet: "s",
    bodyText: `body of ${tag}`,
    receivedAt: new Date(),
    direction: "inbound",
    status: "unread",
    labels: [],
  });

  /** A tenant with one Gmail account, one email, an AI result, a handled mark, a follow-up, usage and scan state. */
  async function fullTenant(email: string, tag: string) {
    const { ensureTenantUser } = await import("@/core/tenancy/provision");
    const { saveCredentials } = await import("@/core/vault");
    const { syncAccount } = await import("../sync/sync-account");
    const { tenantId, userId } = await ensureTenantUser(db, { email });
    tenantIds.push(tenantId);
    const account = await saveCredentials(db, {
      tenantId,
      provider: "gmail",
      authType: "oauth",
      label: "Gmail",
      identity: `${tag}-${suffix}@gmail.com`,
      brand: "gmail",
      credentials: { refreshToken: SECRET },
    });
    await syncAccount(db, tenantId, account.id, {
      fetchGmailEmails: async () => ({ emails: [mail(tag)], cursor: { lastInternalDateMs: 1 }, fetched: 1 }),
    });
    const [row] = await db.select({ id: et.etEmails.id }).from(et.etEmails).where(eq(et.etEmails.tenantId, tenantId));
    await db.insert(et.etEmailAnalysis).values({
      tenantId,
      emailId: row.id,
      status: "analyzed",
      category: "needs_reply",
      priority: 1,
      needsReply: true,
      summary: `summary ${tag}`,
      suggestedAction: `action ${tag}`,
      model: "test-model",
      attempts: 1,
    });
    await m.setHandled(db, tenantId, row.id, true);
    await m.createReminder(db, tenantId, row.id, new Date(Date.now() + 86_400_000), `remind ${tag}`);
    await db.insert(core.llmUsage).values({ tenantId, usageTag: "email-analysis", model: "test-model", status: "ok" });
    await db.insert(et.etScanState).values({ tenantId, paused: false });
    await db.insert(et.etChatMessages).values([
      { tenantId, userId, role: "user", content: `question ${tag}`, createdAt: new Date(Date.now() - 2000) },
      { tenantId, userId, role: "assistant", content: `answer ${tag}`, citedEmailIds: [row.id], createdAt: new Date(Date.now() - 1000) },
    ]);
    return { tenantId, emailId: row.id };
  }

  beforeAll(async () => {
    db = (await import("@/core/db")).getDb();
    core = await import("@/core/db/schema");
    et = await import("../db/schema");
    exportQ = await import("./export");
    usageQ = await import("./usage");
    m = await import("./mutations");
    tenantA = (await fullTenant(`pv-a-${suffix}@example.com`, "a")).tenantId;
    tenantB = (await fullTenant(`pv-b-${suffix}@example.com`, "b")).tenantId;
    tenantC = (await fullTenant(`pv-c-${suffix}@example.com`, "c")).tenantId;
  }, 180_000);

  afterAll(async () => {
    if (tenantIds.length > 0) await db.delete(core.tenants).where(inArray(core.tenants.id, tenantIds));
  }, 60_000);

  it("exports the workspace's own data and never a password, token or another tenant's mail", async () => {
    const data = await exportQ.exportTenantData(db, tenantA);
    expect(data?.truncated).toBe(false);
    expect(data?.accounts).toEqual([expect.objectContaining({ provider: "gmail", address: `a-${suffix}@gmail.com`, status: "connected" })]);
    expect(data?.emails).toHaveLength(1);
    expect(data?.emails[0]).toMatchObject({
      subject: "Subject a",
      body: "body of a",
      handled: true,
      ai: { category: "needs_reply", priority: 1, summary: "summary a" },
    });
    expect(data?.followUps).toEqual([expect.objectContaining({ reason: "remind a", source: "manual", status: "open" })]);
    // The saved chat is in the export, oldest first, and only this workspace's.
    expect(data?.chat.map((message) => [message.role, message.content])).toEqual([
      ["user", "question a"],
      ["assistant", "answer a"],
    ]);
    expect(JSON.stringify(data)).not.toContain("question b");

    const text = JSON.stringify(data);
    expect(text).not.toContain(SECRET);
    expect(text).not.toMatch(/encrypted|refreshToken|password/i);
    expect(text).not.toContain("Subject b");
  }, 90_000);

  it("counts only this workspace's successful AI calls, today and over 30 days", async () => {
    const old = new Date(Date.now() - 40 * 86_400_000);
    await db.insert(core.llmUsage).values([
      { tenantId: tenantA, usageTag: "email-analysis", model: "test-model", status: "ok", createdAt: old }, // too old
      { tenantId: tenantA, usageTag: "email-analysis", model: "test-model", status: "error" }, // failed call
      { tenantId: tenantA, usageTag: "chat", model: "test-model", status: "ok" }, // other feature
    ]);
    expect(await usageQ.getAiUsage(db, tenantA)).toEqual({ today: 1, last30Days: 1 });
    expect(await usageQ.getAiUsage(db, tenantB)).toEqual({ today: 1, last30Days: 1 }); // its own, not A's
  }, 90_000);

  it("deleting a workspace removes everything under it and nothing of anyone else's", async () => {
    const { deleteTenant } = await import("@/core/tenancy/delete");
    const countFor = async (tenantId: string) => ({
      tenants: (await db.select().from(core.tenants).where(eq(core.tenants.id, tenantId))).length,
      users: (await db.select().from(core.users).where(eq(core.users.tenantId, tenantId))).length,
      accounts: (await db.select().from(core.connectedAccounts).where(eq(core.connectedAccounts.tenantId, tenantId))).length,
      emails: (await db.select().from(et.etEmails).where(eq(et.etEmails.tenantId, tenantId))).length,
      analysis: (await db.select().from(et.etEmailAnalysis).where(eq(et.etEmailAnalysis.tenantId, tenantId))).length,
      state: (await db.select().from(et.etEmailState).where(eq(et.etEmailState.tenantId, tenantId))).length,
      followUps: (await db.select().from(et.etFollowups).where(eq(et.etFollowups.tenantId, tenantId))).length,
      scanState: (await db.select().from(et.etScanState).where(eq(et.etScanState.tenantId, tenantId))).length,
      chat: (await db.select().from(et.etChatMessages).where(eq(et.etChatMessages.tenantId, tenantId))).length,
      syncRuns: (await db.select().from(et.etSyncRuns).where(eq(et.etSyncRuns.tenantId, tenantId))).length,
      usage: (await db.select().from(core.llmUsage).where(eq(core.llmUsage.tenantId, tenantId))).length,
    });

    const before = await countFor(tenantC);
    expect(Object.values(before).every((n) => n > 0)).toBe(true); // it really had data in every table

    expect(await deleteTenant(db, tenantC)).toBe(true);
    expect(await countFor(tenantC)).toEqual({ tenants: 0, users: 0, accounts: 0, emails: 0, analysis: 0, state: 0, followUps: 0, scanState: 0, chat: 0, syncRuns: 0, usage: 0 });
    expect((await countFor(tenantB)).emails).toBe(1); // another workspace is untouched
    expect(await deleteTenant(db, tenantC)).toBe(false); // already gone
  }, 120_000);
});
