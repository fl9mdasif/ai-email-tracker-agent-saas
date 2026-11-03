import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NormalizedEmail } from "../types";
import type { SendOne } from "./send-draft";
import type { SendResult } from "./types";

// Runs against the real Neon database (env comes from vitest.config.mts); skipped when it is not configured.
const configured = Boolean(process.env.DATABASE_URL && process.env.CREDENTIALS_ENCRYPTION_KEY);

/** A stand-in for the mail server: counts every send and answers from a script. Nothing leaves the machine. */
function fakeSender(answer: () => SendResult, delayMs = 0) {
  const sent: Parameters<SendOne>[3][] = [];
  const send: SendOne = async (_db, _tenantId, _accountId, message) => {
    sent.push(message);
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return answer();
  };
  return { send, sent };
}

describe.skipIf(!configured)("sendDraft (Neon, fake mail server)", () => {
  const suffix = Date.now();
  const tenantIds: string[] = [];
  let db: Awaited<ReturnType<typeof import("@/core/db").getDb>>;
  let core: typeof import("@/core/db/schema");
  let et: typeof import("../db/schema");
  let svc: typeof import("./send-draft");
  let tenantA: string;
  let tenantB: string;
  let userA: string;
  let userB: string;
  let leadId: string;
  let emailId: string;

  const mail = (tag: string, minutesAgo: number): NormalizedEmail => ({
    providerMessageId: `${tag}-${suffix}@client.com`,
    threadId: `first-${suffix}@client.com`,
    from: { address: "maria@client.com", name: "Maria" },
    to: ["owner@example.com"],
    subject: "Pricing",
    snippet: "s",
    bodyText: "Price for 12 seats?",
    receivedAt: new Date(Date.now() - minutesAgo * 60_000),
    direction: "inbound",
    status: "unread",
    labels: [],
  });

  /** A fresh open draft for the lead, as the AI would leave it. */
  async function newDraft(tenantId = tenantA) {
    const [account] = await db.select({ id: et.etEmails.accountId }).from(et.etEmails).where(eq(et.etEmails.id, emailId));
    const [draft] = await db
      .insert(et.etFollowupDrafts)
      .values({ tenantId, leadId, replyToEmailId: emailId, accountId: account.id, subject: "Re: Pricing", body: `SECRET BODY ${suffix}` })
      .returning();
    await db.update(et.etLeads).set({ snoozedUntil: null }).where(eq(et.etLeads.id, leadId));
    return draft.id;
  }

  beforeAll(async () => {
    db = (await import("@/core/db")).getDb();
    core = await import("@/core/db/schema");
    et = await import("../db/schema");
    svc = await import("./send-draft");
    const { ensureTenantUser } = await import("@/core/tenancy/provision");
    const { saveCredentials } = await import("@/core/vault");
    const { syncAccount } = await import("../sync/sync-account");
    const leads = await import("../queries/leads");

    const a = await ensureTenantUser(db, { email: `sd-a-${suffix}@example.com` });
    const b = await ensureTenantUser(db, { email: `sd-b-${suffix}@example.com` });
    [tenantA, userA, tenantB, userB] = [a.tenantId, a.userId, b.tenantId, b.userId];
    tenantIds.push(tenantA, tenantB);
    const account = await saveCredentials(db, {
      tenantId: tenantA,
      provider: "imap",
      authType: "app_password",
      label: "Shop",
      identity: `shop-${suffix}@example.com`,
      credentials: { preset: "hostinger", host: "imap.hostinger.com", port: 993, secure: true, user: `shop-${suffix}@example.com`, password: "x" },
    });
    await syncAccount(db, tenantA, account.id, {
      fetchEmails: async () => ({ emails: [mail("first", 60), mail("last", 5)], cursor: { uidValidity: "1", lastUid: 2 }, fetched: 2 }),
    });
    [{ id: emailId }] = await db.select({ id: et.etEmails.id }).from(et.etEmails).where(eq(et.etEmails.providerMessageId, `last-${suffix}@client.com`));
    await leads.upsertLeadFromAnalysis(db, tenantA, emailId, "hot", "Asked for a price");
    leadId = (await leads.listLeads(db, tenantA)).leads[0].id;
  }, 180_000);

  afterAll(async () => {
    if (tenantIds.length > 0) await db.delete(core.tenants).where(inArray(core.tenants.id, tenantIds));
  }, 60_000);

  it("one click sends exactly one email, threaded, to the lead, and records it", async () => {
    const draftId = await newDraft();
    const server = fakeSender(() => ({ ok: true, messageId: "<sent-1@example.com>" }));
    const result = await svc.sendDraft(db, { tenantId: tenantA, userId: userA, draftId }, { send: server.send });

    expect(result.ok).toBe(true);
    expect(server.sent).toEqual([
      {
        to: "maria@client.com",
        subject: "Re: Pricing",
        text: `SECRET BODY ${suffix}`,
        replyToMessageId: `last-${suffix}@client.com`,
        threadRootId: `first-${suffix}@client.com`,
        gmailThreadId: null,
      },
    ]);
    const [draft] = await db.select().from(et.etFollowupDrafts).where(eq(et.etFollowupDrafts.id, draftId));
    expect(draft).toMatchObject({ status: "sent", errorCode: null });
    expect(draft.sentAt).toBeInstanceOf(Date);

    const audit = await db.select().from(et.etSendAudit).where(eq(et.etSendAudit.draftId, draftId));
    expect(audit).toEqual([expect.objectContaining({ tenantId: tenantA, userId: userA, toAddress: "maria@client.com", outcome: "sent", sentMessageId: "<sent-1@example.com>" })]);
    // The audit never holds the subject or the text.
    expect(JSON.stringify(audit)).not.toContain("SECRET BODY");
    expect(JSON.stringify(audit)).not.toContain("Pricing");

    // The lead rests for three days and a reminder to check for an answer is due then.
    const [lead] = await db.select().from(et.etLeads).where(eq(et.etLeads.id, leadId));
    expect(lead.snoozedUntil!.getTime()).toBeGreaterThan(Date.now() + 2.9 * 86_400_000);
    expect(lead.lastContactedAt).toBeInstanceOf(Date);
    const reminders = await db.select().from(et.etFollowups).where(eq(et.etFollowups.emailId, emailId));
    expect(reminders).toEqual([expect.objectContaining({ source: "manual", status: "open", reason: "Check whether Maria answered your follow-up." })]);
  }, 90_000);

  it("pressing Send again, or twice at once, never sends a second email", async () => {
    const draftId = await newDraft();
    const server = fakeSender(() => ({ ok: true, messageId: "<x@example.com>" }), 300);
    const results = await Promise.all([
      svc.sendDraft(db, { tenantId: tenantA, userId: userA, draftId }, { send: server.send }),
      svc.sendDraft(db, { tenantId: tenantA, userId: userA, draftId }, { send: server.send }),
      svc.sendDraft(db, { tenantId: tenantA, userId: userA, draftId }, { send: server.send }),
    ]);
    expect(server.sent).toHaveLength(1);
    expect(results.filter((result) => result.ok)).toHaveLength(1);

    const again = await svc.sendDraft(db, { tenantId: tenantA, userId: userA, draftId }, { send: server.send });
    expect(again).toMatchObject({ ok: false, kind: "not_open" });
    expect(server.sent).toHaveLength(1);
    expect(await db.select().from(et.etSendAudit).where(eq(et.etSendAudit.draftId, draftId))).toHaveLength(1);
  }, 90_000);

  it("a failed send is recorded, keeps the draft, and can be retried", async () => {
    const draftId = await newDraft();
    const down = fakeSender(() => ({ ok: false, code: "unreachable" }));
    expect(await svc.sendDraft(db, { tenantId: tenantA, userId: userA, draftId }, { send: down.send })).toMatchObject({ ok: false, kind: "send_failed", code: "unreachable" });
    const [failed] = await db.select().from(et.etFollowupDrafts).where(eq(et.etFollowupDrafts.id, draftId));
    expect(failed).toMatchObject({ status: "failed", errorCode: "unreachable", body: `SECRET BODY ${suffix}` });

    const up = fakeSender(() => ({ ok: true, messageId: "<retry@example.com>" }));
    expect((await svc.sendDraft(db, { tenantId: tenantA, userId: userA, draftId }, { send: up.send })).ok).toBe(true);
    const audit = await db.select({ outcome: et.etSendAudit.outcome, errorCode: et.etSendAudit.errorCode }).from(et.etSendAudit).where(eq(et.etSendAudit.draftId, draftId));
    expect(audit.toSorted((x, y) => x.outcome.localeCompare(y.outcome))).toEqual([
      { outcome: "failed", errorCode: "unreachable" },
      { outcome: "sent", errorCode: null },
    ]);
  }, 90_000);

  it("a mail server that throws counts as a failed send, not a crash", async () => {
    const draftId = await newDraft();
    const exploding: SendOne = async () => {
      throw new Error("boom");
    };
    expect(await svc.sendDraft(db, { tenantId: tenantA, userId: userA, draftId }, { send: exploding })).toMatchObject({ ok: false, kind: "send_failed", code: "unknown" });
  }, 60_000);

  it("another workspace can never send this workspace's draft", async () => {
    const draftId = await newDraft();
    const server = fakeSender(() => ({ ok: true, messageId: "<x@example.com>" }));
    expect(await svc.sendDraft(db, { tenantId: tenantB, userId: userB, draftId }, { send: server.send })).toMatchObject({ ok: false, kind: "not_found" });
    expect(await svc.sendDraft(db, { tenantId: tenantA, userId: userA, draftId: "not-a-uuid" }, { send: server.send })).toMatchObject({ ok: false, kind: "not_found" });
    expect(server.sent).toHaveLength(0);
    const [draft] = await db.select().from(et.etFollowupDrafts).where(eq(et.etFollowupDrafts.id, draftId));
    expect(draft.status).toBe("draft");
  }, 60_000);

  it("stops at the daily send limit before touching the mail server", async () => {
    const draftId = await newDraft();
    await db.insert(et.etSendAudit).values(
      Array.from({ length: svc.SENDS_PER_DAY }, () => ({ tenantId: tenantA, toAddress: "x@y.com", outcome: "sent" as const })),
    );
    const server = fakeSender(() => ({ ok: true, messageId: "<x@example.com>" }));
    expect(await svc.sendDraft(db, { tenantId: tenantA, userId: userA, draftId }, { send: server.send })).toMatchObject({ ok: false, kind: "limit" });
    expect(server.sent).toHaveLength(0);
    // Failed attempts do not count towards the limit, and another workspace has its own.
    expect(await svc.sendsToday(db, tenantB)).toBe(0);
  }, 60_000);
});
