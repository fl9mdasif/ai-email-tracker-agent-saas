import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EMPTY_PLAN } from "../ai/chat/plan-pure";
import type { QueryPlan } from "../ai/chat/schema";
import type { NormalizedEmail } from "../types";

// Runs against the real Neon database (env comes from vitest.config.mts); skipped when it is not configured.
const configured = Boolean(process.env.DATABASE_URL && process.env.CREDENTIALS_ENCRYPTION_KEY);

describe.skipIf(!configured)("chat retrieval (Neon)", () => {
  const suffix = Date.now();
  const tenantIds: string[] = [];
  const BODY = `SECRET BODY ${suffix}`;
  let db: Awaited<ReturnType<typeof import("@/core/db").getDb>>;
  let core: typeof import("@/core/db/schema");
  let et: typeof import("../db/schema");
  let chat: typeof import("./chat");
  let tenantA: string;
  let tenantB: string;
  let tenantC: string;
  const acc1 = `one-${suffix}@example.com`;
  const acc2 = `two-${suffix}@example.com`;
  const id: Record<string, string> = {};

  const plan = (changes: Partial<QueryPlan>): QueryPlan => ({ ...EMPTY_PLAN, limit: 25, ...changes });
  const subjects = (rows: Array<{ subject: string }>) => rows.map((row) => row.subject);

  beforeAll(async () => {
    db = (await import("@/core/db")).getDb();
    core = await import("@/core/db/schema");
    et = await import("../db/schema");
    chat = await import("./chat");
    const { ensureTenantUser } = await import("@/core/tenancy/provision");
    const { saveCredentials } = await import("@/core/vault");
    const { syncAccount } = await import("../sync/sync-account");
    const { startOfTodayIn } = await import("@/core/lib/time");

    tenantA = (await ensureTenantUser(db, { email: `cr-a-${suffix}@example.com` })).tenantId;
    tenantB = (await ensureTenantUser(db, { email: `cr-b-${suffix}@example.com` })).tenantId;
    tenantC = (await ensureTenantUser(db, { email: `cr-c-${suffix}@example.com` })).tenantId;
    tenantIds.push(tenantA, tenantB, tenantC);
    // A fixed time zone keeps "today" and "yesterday" deterministic whatever time the test runs.
    await db.update(core.tenants).set({ timezone: "UTC" }).where(inArray(core.tenants.id, [tenantA, tenantC]));
    const todayStart = startOfTodayIn("UTC", new Date()).getTime();
    const at = (offsetMs: number) => new Date(todayStart + offsetMs);
    const H = 3_600_000;
    const D = 24 * H;

    const account = (tenantId: string, identity: string) =>
      saveCredentials(db, {
        tenantId,
        provider: "imap",
        authType: "app_password",
        label: "Test",
        identity,
        credentials: { preset: "hostinger", host: "imap.hostinger.com", port: 993, secure: true, user: identity, password: "x" },
      });
    const a1 = await account(tenantA, acc1);
    const a2 = await account(tenantA, acc2);
    const c1 = await account(tenantC, `c-${suffix}@example.com`);

    const mail = (tag: string, from: string, subject: string, receivedAt: Date, extra: Partial<NormalizedEmail> = {}): NormalizedEmail => ({
      providerMessageId: `${tag}-${suffix}@test`,
      threadId: `${tag}-${suffix}@test`,
      from: { address: from, name: from.startsWith("maria") ? "Maria Gomez" : null },
      to: ["owner@example.com"],
      subject,
      snippet: `snippet of ${tag}`,
      bodyText: BODY,
      receivedAt,
      direction: "inbound",
      status: "unread",
      labels: [],
      ...extra,
    });

    await syncAccount(db, tenantA, a1.id, {
      fetchEmails: async () => ({
        emails: [
          mail("m1", "maria@client.com", "Pricing question", at(3000)),
          mail("m2", "sam@vendor.com", "Invoice 77", at(2000), { status: "read" }),
          mail("m5", "maria@client.com", "Re: Pricing", at(-3 * D)),
          mail("m8", "owner@example.com", "Sent by me", at(4000), { direction: "outbound" }),
        ],
        cursor: { uidValidity: "1", lastUid: 4 },
        fetched: 4,
      }),
    });
    await syncAccount(db, tenantA, a2.id, {
      fetchEmails: async () => ({
        emails: [
          mail("m4", "news@promo.com", "Weekly news", at(-2 * H)),
          mail("m6", "old@person.com", "Ancient", at(-40 * D)),
          mail("m7", "pat@client.com", "Handled one", at(1000)),
        ],
        cursor: { uidValidity: "1", lastUid: 3 },
        fetched: 3,
      }),
    });
    await syncAccount(db, tenantC, c1.id, {
      fetchEmails: async () => ({
        emails: Array.from({ length: 30 }, (_, index) => mail(`bulk${index}`, `p${index}@client.com`, `Bulk ${index}`, at(1000 + index))),
        cursor: { uidValidity: "1", lastUid: 30 },
        fetched: 30,
      }),
    });

    for (const row of await db.select({ id: et.etEmails.id, tag: et.etEmails.providerMessageId, tenantId: et.etEmails.tenantId }).from(et.etEmails).where(inArray(et.etEmails.tenantId, [tenantA, tenantC]))) {
      id[row.tag.split("-")[0]] = row.id;
    }
    const analysis = (tenantId: string, tag: string, category: "needs_reply" | "lead_reply" | "invoice_or_payment" | "newsletter_or_promo", priority: number, needsReply: boolean) =>
      db.insert(et.etEmailAnalysis).values({ tenantId, emailId: id[tag], status: "analyzed", category, priority, needsReply, summary: `summary ${tag}`, suggestedAction: `action ${tag}`, model: "m", attempts: 1 });
    await analysis(tenantA, "m1", "lead_reply", 1, true);
    await analysis(tenantA, "m2", "invoice_or_payment", 2, false);
    await analysis(tenantA, "m5", "lead_reply", 1, true);
    await analysis(tenantA, "m4", "newsletter_or_promo", 3, false);
    await analysis(tenantA, "m7", "needs_reply", 2, true);
    // m6 stays unscanned on purpose.
    await db.insert(et.etEmailState).values({ emailId: id.m7, tenantId: tenantA }); // m7 is handled
    for (let index = 0; index < 30; index += 1) await analysis(tenantC, `bulk${index}`, "needs_reply", 2, true);

    await db.insert(et.etFollowups).values([
      { tenantId: tenantA, emailId: id.m5, threadId: "t", dueAt: at(-2 * D), reason: "chase Maria", source: "manual", status: "open" },
      { tenantId: tenantA, emailId: id.m2, threadId: "t", dueAt: at(3 * D), reason: "later", source: "manual", status: "open" },
      { tenantId: tenantA, emailId: id.m1, threadId: "t", dueAt: at(-D), reason: "already done", source: "manual", status: "done" },
    ]);
  }, 240_000);

  afterAll(async () => {
    if (tenantIds.length > 0) await db.delete(core.tenants).where(inArray(core.tenants.id, tenantIds));
  }, 60_000);

  it("filters by period in the workspace's own time zone, newest first, never including mail the account sent", async () => {
    expect(subjects((await chat.retrieveForChat(db, tenantA, plan({ period: "today" }))).rows)).toEqual(["Pricing question", "Invoice 77", "Handled one"]);
    expect(subjects((await chat.retrieveForChat(db, tenantA, plan({ period: "yesterday" }))).rows)).toEqual(["Weekly news"]);
    const week = await chat.retrieveForChat(db, tenantA, plan({ period: "last_7_days" }));
    expect(week.total).toBe(5);
    expect(subjects(week.rows)).not.toContain("Ancient");
    expect(subjects((await chat.retrieveForChat(db, tenantA, plan({}))).rows)).not.toContain("Sent by me");
  }, 90_000);

  it("filters by category, sender, subject, handled state, reply need and mailbox", async () => {
    const leads = await chat.retrieveForChat(db, tenantA, plan({ categories: ["lead_reply"] }));
    expect(subjects(leads.rows)).toEqual(["Pricing question", "Re: Pricing"]);
    expect(leads.byCategory).toEqual({ lead_reply: 2 });

    expect(subjects((await chat.retrieveForChat(db, tenantA, plan({ senderContains: "MARIA" }))).rows)).toEqual(["Pricing question", "Re: Pricing"]);
    expect(subjects((await chat.retrieveForChat(db, tenantA, plan({ subjectContains: "invoice" }))).rows)).toEqual(["Invoice 77"]);
    expect(subjects((await chat.retrieveForChat(db, tenantA, plan({ handled: "yes" }))).rows)).toEqual(["Handled one"]);
    expect(subjects((await chat.retrieveForChat(db, tenantA, plan({ period: "today", handled: "no" }))).rows)).toEqual(["Pricing question", "Invoice 77"]);
    expect(subjects((await chat.retrieveForChat(db, tenantA, plan({ unreadOnly: true, period: "today" }))).rows)).toEqual(["Pricing question", "Handled one"]); // Invoice 77 is read
    expect(subjects((await chat.retrieveForChat(db, tenantA, plan({ accountEmail: acc2.toUpperCase() }))).rows)).toEqual(["Handled one", "Weekly news", "Ancient"]);
    expect(subjects((await chat.retrieveForChat(db, tenantA, plan({ priority: 1 }))).rows)).toEqual(["Pricing question", "Re: Pricing"]);

    // Hot leads: only mail the AI scored hot.
    const { eq } = await import("drizzle-orm");
    await db.update(et.etEmailAnalysis).set({ leadTemperature: "hot", leadReason: "Asked for a price" }).where(eq(et.etEmailAnalysis.emailId, id.m1));
    expect(subjects((await chat.retrieveForChat(db, tenantA, plan({ hotLeadsOnly: true }))).rows)).toEqual(["Pricing question"]);
    expect((await chat.retrieveForChat(db, tenantB, plan({ hotLeadsOnly: true }))).rows).toEqual([]);
    expect(chat.describePlan(plan({ hotLeadsOnly: true }), "all time")).toContain("from hot leads");
  }, 120_000);

  it("the 'needs action' question: waiting for a reply, not handled, most urgent first", async () => {
    const result = await chat.retrieveForChat(db, tenantA, plan({ needsReply: true, handled: "no", order: "priority" }));
    expect(subjects(result.rows)).toEqual(["Pricing question", "Re: Pricing"]); // the handled one is left out
    expect(result.total).toBe(2);
  }, 90_000);

  it("counts exactly by category and priority, with mail the AI has not seen shown as unscanned", async () => {
    const all = await chat.retrieveForChat(db, tenantA, plan({}));
    expect(all.total).toBe(6); // the mail the account sent itself is never counted
    expect(all.byCategory).toEqual({ lead_reply: 2, invoice_or_payment: 1, newsletter_or_promo: 1, needs_reply: 1, unscanned: 1 });
    expect(all.byPriority).toEqual({ "1": 2, "2": 2, "3": 1, unscanned: 1 });
  }, 90_000);

  it("ignores an address the workspace does not have, and says so", async () => {
    const result = await chat.retrieveForChat(db, tenantA, plan({ accountEmail: "made-up@nowhere.com" }));
    expect(result.total).toBe(6); // the filter was dropped, not applied
    expect(result.notes[0]).toMatch(/no connected mailbox called made-up@nowhere\.com/);
    // Another workspace's real address is also unknown here.
    expect((await chat.retrieveForChat(db, tenantB, plan({ accountEmail: acc1 }))).notes).toHaveLength(1);
  }, 90_000);

  it("never reads a body: rows carry no body text, and the snippet appears only for unscanned mail", async () => {
    const all = await chat.retrieveForChat(db, tenantA, plan({}));
    expect(JSON.stringify(all)).not.toContain(BODY);
    expect(JSON.stringify(all)).not.toMatch(/bodyText|"body"/);
    const ancient = all.rows.find((row) => row.subject === "Ancient");
    const priced = all.rows.find((row) => row.subject === "Pricing question");
    expect(ancient).toMatchObject({ category: null, summary: null, snippet: expect.stringContaining("snippet of m6") });
    expect(priced).toMatchObject({ category: "lead_reply", summary: "summary m1", suggestedAction: "action m1", snippet: null });
  }, 90_000);

  it("the follow-up question lists mail whose follow-up is due, with the reason, and not later or finished ones", async () => {
    const result = await chat.retrieveForChat(db, tenantA, plan({ followUpsDue: true }));
    expect(subjects(result.rows)).toEqual(["Re: Pricing"]);
    expect(result.rows[0].followUpReason).toBe("chase Maria");
    expect(result.total).toBe(1);
  }, 90_000);

  it("never sends more than 25 rows, however many match, and still reports the true total", async () => {
    const result = await chat.retrieveForChat(db, tenantC, plan({ needsReply: true, limit: 25 }));
    expect(result.rows).toHaveLength(25);
    expect(result.total).toBe(30);
    expect(result.byCategory).toEqual({ needs_reply: 30 });
    // Even a plan that was not tidied cannot ask for more.
    expect((await chat.retrieveForChat(db, tenantC, { ...plan({}), limit: 500 })).rows).toHaveLength(25);
  }, 90_000);

  it("another workspace sees none of this", async () => {
    const empty = await chat.retrieveForChat(db, tenantB, plan({}));
    expect(empty).toMatchObject({ rows: [], total: 0, byCategory: {}, byPriority: {} });
    expect((await chat.retrieveForChat(db, tenantB, plan({ followUpsDue: true }))).rows).toEqual([]);
    expect((await chat.retrieveForChat(db, tenantB, plan({ senderContains: "maria" }))).rows).toEqual([]);
    expect(subjects((await chat.retrieveForChat(db, tenantA, plan({ senderContains: "p1@client" }))).rows)).toEqual([]); // C's mail is not A's
  }, 90_000);

  it("matches text literally, so wildcards and quotes do nothing special", async () => {
    for (const text of ["%", "_", "'; drop table et_emails; --", "\\"]) {
      const result = await chat.retrieveForChat(db, tenantA, plan({ subjectContains: text }));
      expect(result.rows, text).toEqual([]);
    }
    expect((await chat.retrieveForChat(db, tenantA, plan({}))).total).toBe(6); // the table is still there
  }, 120_000);

  it("describes a plan in plain words", () => {
    expect(chat.describePlan(plan({ categories: ["lead_reply"], period: "last_7_days", handled: "no" }), "the last 7 days")).toBe(
      "inbound mail, categorised as lead_reply, not yet marked handled, received the last 7 days",
    );
    expect(chat.describePlan(plan({ followUpsDue: true }), "all time")).toBe("mail with a follow-up that is due or overdue");
  });
});
