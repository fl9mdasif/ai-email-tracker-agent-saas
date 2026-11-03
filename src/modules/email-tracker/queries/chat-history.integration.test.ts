import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Runs against the real Neon database (env comes from vitest.config.mts); skipped when it is not configured.
const configured = Boolean(process.env.DATABASE_URL && process.env.CREDENTIALS_ENCRYPTION_KEY);

describe.skipIf(!configured)("chat history and quota (Neon)", () => {
  const suffix = Date.now();
  const tenantIds: string[] = [];
  let db: Awaited<ReturnType<typeof import("@/core/db").getDb>>;
  let core: typeof import("@/core/db/schema");
  let et: typeof import("../db/schema");
  let history: typeof import("./chat-history");
  let limit: typeof import("../ai/chat/rate-limit");
  let tenantA: string;
  let tenantB: string;
  let userA1: string;
  let userA2: string;
  let userB: string;

  beforeAll(async () => {
    db = (await import("@/core/db")).getDb();
    core = await import("@/core/db/schema");
    et = await import("../db/schema");
    history = await import("./chat-history");
    limit = await import("../ai/chat/rate-limit");
    const { ensureTenantUser } = await import("@/core/tenancy/provision");
    const a = await ensureTenantUser(db, { email: `chat-a1-${suffix}@example.com` });
    const b = await ensureTenantUser(db, { email: `chat-b-${suffix}@example.com` });
    tenantA = a.tenantId;
    tenantB = b.tenantId;
    userA1 = a.userId;
    userB = b.userId;
    tenantIds.push(tenantA, tenantB);
    // A second person in workspace A, to prove conversations belong to a person but the quota to the workspace.
    const [second] = await db.insert(core.users).values({ tenantId: tenantA, email: `chat-a2-${suffix}@example.com`, role: "member" }).returning({ id: core.users.id });
    userA2 = second.id;
  }, 90_000);

  afterAll(async () => {
    if (tenantIds.length > 0) await db.delete(core.tenants).where(inArray(core.tenants.id, tenantIds));
  }, 60_000);

  const ask = (tenantId: string, userId: string, content: string, extra: Partial<Parameters<typeof history.addChatMessage>[1]> = {}) =>
    history.addChatMessage(db, { tenantId, userId, role: "user", content, ...extra });

  it("keeps a conversation oldest first, and each person only sees their own", async () => {
    await ask(tenantA, userA1, "first question");
    await history.addChatMessage(db, { tenantId: tenantA, userId: userA1, role: "assistant", content: "first answer" });
    await ask(tenantA, userA1, "second question");
    await ask(tenantA, userA2, "colleague question");
    await ask(tenantB, userB, "other workspace question");

    const mine = await history.listChatMessages(db, tenantA, userA1);
    expect(mine.map((message) => message.content)).toEqual(["first question", "first answer", "second question"]);
    expect(mine.map((message) => message.role)).toEqual(["user", "assistant", "user"]);

    expect((await history.listChatMessages(db, tenantA, userA2)).map((message) => message.content)).toEqual(["colleague question"]);
    expect((await history.listChatMessages(db, tenantB, userB)).map((message) => message.content)).toEqual(["other workspace question"]);
    // Asking for a person's messages under another workspace finds nothing.
    expect(await history.listChatMessages(db, tenantB, userA1)).toEqual([]);
  }, 90_000);

  it("returns only the newest messages when there are more than the limit, still oldest first", async () => {
    expect((await history.listChatMessages(db, tenantA, userA1, 2)).map((message) => message.content)).toEqual(["first answer", "second question"]);
  }, 60_000);

  it("stores only real email ids as citations and cuts very long text", async () => {
    const id = await history.addChatMessage(db, {
      tenantId: tenantA,
      userId: userA2,
      role: "assistant",
      content: "x".repeat(10_000),
      citedEmailIds: ["3f8c2c0e-7a5b-4d58-9f0e-2b6f1f3b7a11", "not-an-id", "'; drop table"],
    });
    const stored = (await history.listChatMessages(db, tenantA, userA2)).find((message) => message.id === id);
    expect(stored?.citedEmailIds).toEqual(["3f8c2c0e-7a5b-4d58-9f0e-2b6f1f3b7a11"]);
    expect(stored?.content).toHaveLength(history.MAX_STORED_CHARS);
  }, 60_000);

  it("gives follow-up context from answered turns only, never from failed or paused attempts", async () => {
    await ask(tenantA, userA1, "this one failed", { status: "error" });
    await ask(tenantA, userA1, "this one was paused", { status: "paused" });
    const turns = await history.recentTurns(db, tenantA, userA1, 10);
    expect(turns.map((turn) => turn.content)).toEqual(["first question", "first answer", "second question"]);
    expect((await history.recentTurns(db, tenantA, userA1, 2)).map((turn) => turn.content)).toEqual(["first answer", "second question"]);
  }, 60_000);

  it("counts a workspace's questions for the rate limit: user messages in the last day, not paused, shared by everyone there", async () => {
    // Workspace A so far: user questions "first", "second", "colleague", "this one failed" (counted: it is a real attempt); paused is not.
    const before = await limit.getChatQuota(db, tenantA);
    expect(before.usedLastHour).toBe(4);
    expect(before.usedLastDay).toBe(4);
    expect(before.leftThisHour).toBe(limit.CHAT_LIMITS.perHour - 4);

    // Old questions and assistant messages never count.
    await db.insert(et.etChatMessages).values({ tenantId: tenantA, userId: userA1, role: "user", content: "ancient", createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) });
    expect((await limit.getChatQuota(db, tenantA)).usedLastDay).toBe(4);

    // Another workspace's questions do not count here.
    expect((await limit.getChatQuota(db, tenantB)).usedLastDay).toBe(1);
  }, 90_000);

  it("refuses once the hour is full, and a paused attempt does not push a workspace over", async () => {
    for (let index = 0; index < limit.CHAT_LIMITS.perHour; index += 1) await ask(tenantB, userB, `q${index}`);
    const full = await limit.getChatQuota(db, tenantB);
    expect(full.allowed).toBe(false);
    expect(full.blockedBy).toBe("hour");
    expect(full.retryAfterMinutes).toBeGreaterThanOrEqual(1);
    expect(limit.describeBlock(full)).toMatch(/all 20 questions/);

    await db.delete(et.etChatMessages).where(inArray(et.etChatMessages.tenantId, [tenantB]));
    for (let index = 0; index < 25; index += 1) await ask(tenantB, userB, `paused${index}`, { status: "paused" });
    expect((await limit.getChatQuota(db, tenantB)).allowed).toBe(true);
  }, 180_000);

  it("clearing a conversation removes only that person's messages", async () => {
    const removed = await history.clearChat(db, tenantA, userA1);
    expect(removed).toBeGreaterThanOrEqual(5);
    expect(await history.listChatMessages(db, tenantA, userA1)).toEqual([]);
    expect((await history.listChatMessages(db, tenantA, userA2)).length).toBeGreaterThanOrEqual(2); // colleague untouched
    expect((await history.listChatMessages(db, tenantB, userB)).length).toBeGreaterThan(0); // other workspace untouched
    expect(await history.clearChat(db, tenantB, userA1)).toBe(0); // wrong workspace removes nothing
  }, 90_000);
});
