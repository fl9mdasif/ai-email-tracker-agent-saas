import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AnalyzeEmailResult } from "../ai/analyze-email";
import type { NormalizedEmail } from "../types";

// Runs against the real Neon database (env comes from vitest.config.mts); skipped when it is not configured.
const configured = Boolean(process.env.DATABASE_URL && process.env.CREDENTIALS_ENCRYPTION_KEY);

describe.skipIf(!configured)("dashboard queries (Neon)", () => {
  const suffix = Date.now();
  const tenantIds: string[] = [];
  let db: Awaited<ReturnType<typeof import("@/core/db").getDb>>;
  let core: typeof import("@/core/db/schema");
  let et: typeof import("../db/schema");
  let q: typeof import("./dashboard");
  let m: typeof import("./mutations");
  let pending: typeof import("../ai/analyze-pending");
  let tenantA: string;
  let tenantB: string;
  let accountA: string;
  let accountA2: string;
  const ids: Record<string, string> = {};

  const mail = (n: number, tag: string, minutesAgo: number, from = "maria@client.com"): NormalizedEmail => ({
    providerMessageId: `${tag}${n}-${suffix}@test`,
    threadId: `${tag}${n}-${suffix}@test`,
    from: { address: from, name: "Maria" },
    to: ["owner@example.com"],
    subject: `Subject ${tag}${n}`,
    snippet: `snippet ${tag}${n} invoice`,
    bodyText: "the full body",
    receivedAt: new Date(Date.now() - minutesAgo * 60_000),
    direction: "inbound",
    status: "unread",
    labels: [],
  });

  const analysis = (category: AnalyzeEmailResult extends infer R ? (R extends { ok: true; analysis: infer A } ? (A extends { category: infer C } ? C : never) : never) : never, priority: 1 | 2 | 3, needsReply: boolean): AnalyzeEmailResult => ({
    ok: true,
    model: "test-model",
    analysis: { category, priority, needs_reply: needsReply, summary: `summary ${category}`, suggested_action: `action ${category}` },
  });

  beforeAll(async () => {
    db = (await import("@/core/db")).getDb();
    core = await import("@/core/db/schema");
    et = await import("../db/schema");
    q = await import("./dashboard");
    m = await import("./mutations");
    pending = await import("../ai/analyze-pending");
    const { ensureTenantUser } = await import("@/core/tenancy/provision");
    const { saveCredentials } = await import("@/core/vault");
    const { syncAccount } = await import("../sync/sync-account");

    tenantA = (await ensureTenantUser(db, { email: `dash-a-${suffix}@example.com` })).tenantId;
    tenantB = (await ensureTenantUser(db, { email: `dash-b-${suffix}@example.com` })).tenantId;
    tenantIds.push(tenantA, tenantB);

    const add = (identity: string) =>
      saveCredentials(db, {
        tenantId: tenantA,
        provider: "imap",
        authType: "app_password",
        label: "Test",
        identity,
        brand: "hostinger",
        credentials: { preset: "hostinger", host: "imap.hostinger.com", port: 993, secure: true, user: identity, password: "x" },
      });
    accountA = (await add(`one-${suffix}@example.com`)).id;
    accountA2 = (await add(`two-${suffix}@example.com`)).id;

    // Account one: 1 minute and 2 minutes old (today), plus one from long ago. Account two: one fresh mail.
    await syncAccount(db, tenantA, accountA, {
      fetchEmails: async () => ({
        emails: [mail(1, "a", 1), mail(2, "a", 2), mail(3, "a", 60 * 24 * 40)],
        cursor: { uidValidity: "1", lastUid: 3 },
        fetched: 3,
      }),
    });
    await syncAccount(db, tenantA, accountA2, {
      fetchEmails: async () => ({ emails: [mail(1, "b", 3)], cursor: { uidValidity: "1", lastUid: 1 }, fetched: 1 }),
    });

    const all = await db.select({ id: et.etEmails.id, subject: et.etEmails.subject }).from(et.etEmails).where(eq(et.etEmails.tenantId, tenantA));
    for (const row of all) ids[row.subject.replace("Subject ", "")] = row.id;
  }, 120_000);

  afterAll(async () => {
    if (tenantIds.length > 0) await db.delete(core.tenants).where(inArray(core.tenants.id, tenantIds));
  }, 60_000);

  it("the AI scan fills the Today groups, and a follow-up mail creates exactly one AI follow-up", async () => {
    const results: Record<string, AnalyzeEmailResult> = {
      "Subject a1": analysis("needs_reply", 1, true),
      "Subject a2": analysis("follow_up_needed", 2, false),
      "Subject b1": analysis("fyi_only", 3, false),
    };
    const analyze = vi.fn(async (email: { subject: string }) => results[email.subject]);
    const outcome = await pending.analyzePendingEmails(db, tenantA, { analyze, isCancelled: async () => false });
    expect(outcome).toMatchObject({ analyzed: 3, failed: 0 });

    // A second scan changes nothing: still one AI follow-up.
    await pending.analyzePendingEmails(db, tenantA, { analyze, isCancelled: async () => false });
    const followUps = await db.select().from(et.etFollowups).where(eq(et.etFollowups.tenantId, tenantA));
    expect(followUps).toHaveLength(1);
    expect(followUps[0]).toMatchObject({ source: "ai", status: "open", emailId: ids.a2, reason: "action follow_up_needed" });
  }, 120_000);

  it("groups today's mail by priority and shows the account on each row", async () => {
    const groups = await q.listTodayByPriority(db, tenantA);
    expect(groups.p1.map((row) => row.subject)).toEqual(["Subject a1"]);
    expect(groups.p2.map((row) => row.subject)).toEqual(["Subject a2"]);
    expect(groups.p3.map((row) => row.subject)).toEqual(["Subject b1"]);
    expect(groups.unscanned).toEqual([]); // the 40-day-old mail is not "today"
    expect(groups.p1[0].account).toMatchObject({ id: accountA, identity: `one-${suffix}@example.com`, brand: "hostinger" });
    expect(groups.p3[0].account.id).toBe(accountA2);
  }, 60_000);

  it("counts the Today cards", async () => {
    expect(await q.getTodayOverview(db, tenantA)).toEqual({ newToday: 3, needsReply: 1, highPriority: 1, leadReplies: 0, followUpsDue: 1 });
  }, 60_000);

  it("lists needs-reply mail, and marking handled removes it everywhere, and undo brings it back", async () => {
    expect((await q.listNeedsReply(db, tenantA)).map((row) => row.subject)).toEqual(["Subject a1"]);

    expect(await m.setHandled(db, tenantA, ids.a1, true)).toBe(true);
    expect(await m.setHandled(db, tenantA, ids.a1, true)).toBe(true); // twice is fine
    expect(await q.listNeedsReply(db, tenantA)).toEqual([]);
    expect((await q.listTodayByPriority(db, tenantA)).p1).toEqual([]);
    expect(await q.getTodayOverview(db, tenantA)).toMatchObject({ needsReply: 0, highPriority: 0 });

    expect(await m.setHandled(db, tenantA, ids.a1, false)).toBe(true);
    expect((await q.listNeedsReply(db, tenantA)).map((row) => row.subject)).toEqual(["Subject a1"]);
  }, 90_000);

  it("reminders and follow-up status: overdue, today and upcoming, done removes it", async () => {
    const now = new Date();
    const upcoming = await m.createReminder(db, tenantA, ids.a1, new Date(now.getTime() + 3 * 86_400_000), "  call Maria  ");
    const overdue = await m.createReminder(db, tenantA, ids.b1, new Date(now.getTime() - 3 * 86_400_000), "late");
    expect(upcoming && overdue).toBeTruthy();

    const groups = await q.listFollowUps(db, tenantA, now);
    expect(groups.overdue.map((item) => item.reason)).toEqual(["late"]);
    expect(groups.today.map((item) => item.source)).toEqual(["ai"]);
    expect(groups.upcoming.map((item) => item.reason)).toEqual(["call Maria"]);
    expect(groups.upcoming[0].mail.subject).toBe("Subject a1");

    expect(await m.setFollowUpStatus(db, tenantA, overdue!, "done")).toBe(true);
    expect((await q.listFollowUps(db, tenantA, now)).overdue).toEqual([]);
  }, 90_000);

  it("filters and searches mail, and pages by position", async () => {
    const all = await q.searchMail(db, tenantA, {});
    expect(all.rows.map((row) => row.subject)).toEqual(["Subject a1", "Subject a2", "Subject b1", "Subject a3"]);
    expect(all.nextCursor).toBeNull();

    expect((await q.searchMail(db, tenantA, { accountId: accountA2 })).rows.map((row) => row.subject)).toEqual(["Subject b1"]);
    expect((await q.searchMail(db, tenantA, { category: "follow_up_needed" })).rows.map((row) => row.subject)).toEqual(["Subject a2"]);
    expect((await q.searchMail(db, tenantA, { priority: 3 })).rows.map((row) => row.subject)).toEqual(["Subject b1"]);
    expect((await q.searchMail(db, tenantA, { query: "A3" })).rows.map((row) => row.subject)).toEqual(["Subject a3"]);
    expect((await q.searchMail(db, tenantA, { query: "100%" })).rows).toEqual([]); // % is matched literally
    expect((await q.searchMail(db, tenantA, { handled: "yes" })).rows).toEqual([]);

    // Paging: fake a long list by asking for the tail after the first row's position.
    const first = all.rows[0];
    const { encodeCursor } = await import("./dashboard-pure");
    const after = await q.searchMail(db, tenantA, {}, encodeCursor({ receivedAtMs: first.receivedAt.getTime(), id: first.id }));
    expect(after.rows.map((row) => row.subject)).toEqual(["Subject a2", "Subject b1", "Subject a3"]);
  }, 90_000);

  it("shows one email in full, with its follow-ups", async () => {
    const detail = await q.getMailDetail(db, tenantA, ids.a1);
    expect(detail).toMatchObject({ bodyText: "the full body", subject: "Subject a1", providerMessageId: `a1-${suffix}@test` });
    expect(detail?.followUps).toHaveLength(1);
    expect(await q.getMailDetail(db, tenantA, "not-an-id")).toBeNull();
  }, 60_000);

  it("another tenant sees nothing and can change nothing", async () => {
    expect(await q.getTodayOverview(db, tenantB)).toEqual({ newToday: 0, needsReply: 0, highPriority: 0, leadReplies: 0, followUpsDue: 0 });
    expect(await q.searchMail(db, tenantB, {})).toEqual({ rows: [], nextCursor: null });
    expect(await q.listNeedsReply(db, tenantB)).toEqual([]);
    const followUps = await q.listFollowUps(db, tenantB);
    expect([...followUps.overdue, ...followUps.today, ...followUps.upcoming]).toEqual([]);
    expect(await q.getMailDetail(db, tenantB, ids.a1)).toBeNull();
    expect(await q.listAccountOptions(db, tenantB)).toEqual([]);

    expect(await m.setHandled(db, tenantB, ids.a2, true)).toBe(false);
    expect(await m.createReminder(db, tenantB, ids.a2, new Date(), "x")).toBeNull();
    const ownFollowUp = (await db.select().from(et.etFollowups).where(eq(et.etFollowups.tenantId, tenantA)))[0];
    expect(await m.setFollowUpStatus(db, tenantB, ownFollowUp.id, "dismissed")).toBe(false);
    expect((await db.select().from(et.etFollowups).where(eq(et.etFollowups.id, ownFollowUp.id)))[0].status).toBe("open");
    expect((await q.listTodayByPriority(db, tenantA)).p2.map((row) => row.subject)).toEqual(["Subject a2"]);
  }, 90_000);
});
