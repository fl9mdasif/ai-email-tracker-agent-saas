import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AnalyzeEmailResult } from "./analyze-email";
import type { AnalyzeDeps } from "./analyze-pending";

// Runs against the real Neon database (env comes from vitest.config.mts); skipped when it is not configured.
const configured = Boolean(process.env.DATABASE_URL && process.env.CREDENTIALS_ENCRYPTION_KEY);

describe.skipIf(!configured)("analyzePendingEmails (Neon)", () => {
  const suffix = Date.now();
  const tenantIds: string[] = [];
  let db: Awaited<ReturnType<typeof import("@/core/db").getDb>>;
  let core: typeof import("@/core/db/schema");
  let et: typeof import("../db/schema");
  let pending: typeof import("./analyze-pending");
  let tenantA: string;
  let tenantB: string;

  const good: AnalyzeEmailResult = {
    ok: true,
    model: "test-model",
    analysis: {
      category: "lead_reply",
      priority: 1,
      needs_reply: true,
      summary: "A lead asks for the price.",
      suggested_action: "Reply with the price list.",
    },
  };

  const deps = (result: AnalyzeEmailResult | (() => AnalyzeEmailResult)) => {
    const analyze = vi.fn(async () => (typeof result === "function" ? result() : result));
    return { analyze } satisfies AnalyzeDeps;
  };

  const analysisRows = async (tenantId: string) =>
    db.select().from(et.etEmailAnalysis).where(eq(et.etEmailAnalysis.tenantId, tenantId));

  beforeAll(async () => {
    db = (await import("@/core/db")).getDb();
    core = await import("@/core/db/schema");
    et = await import("../db/schema");
    pending = await import("./analyze-pending");
    const { ensureTenantUser } = await import("@/core/tenancy/provision");
    const { saveCredentials } = await import("@/core/vault");
    const { syncAccount } = await import("../sync/sync-account");

    tenantA = (await ensureTenantUser(db, { email: `an-a-${suffix}@example.com` })).tenantId;
    tenantB = (await ensureTenantUser(db, { email: `an-b-${suffix}@example.com` })).tenantId;
    tenantIds.push(tenantA, tenantB);

    const account = await saveCredentials(db, {
      tenantId: tenantA,
      provider: "imap",
      authType: "app_password",
      label: "Test",
      identity: `an-${suffix}@example.com`,
      credentials: { preset: "hostinger", host: "imap.hostinger.com", port: 993, secure: true, user: `an-${suffix}@example.com`, password: "x" },
    });

    const mail = (n: number, direction: "inbound" | "outbound") => ({
      providerMessageId: `an${n}-${suffix}@test`,
      threadId: `an${n}-${suffix}@test`,
      from: { address: direction === "inbound" ? "maria@client.com" : `an-${suffix}@example.com`, name: "Maria" },
      to: ["owner@example.com"],
      subject: `Analysis test ${n}`,
      snippet: "s",
      bodyText: "Can you send the price?",
      receivedAt: new Date(`2026-10-0${n}T08:00:00Z`),
      direction,
      status: "unread" as const,
      labels: [],
    });
    await syncAccount(db, tenantA, account.id, {
      fetchEmails: async () => ({
        emails: [mail(1, "inbound"), mail(2, "inbound"), mail(3, "inbound"), mail(4, "outbound")],
        cursor: { uidValidity: "1", lastUid: 4 },
        fetched: 4,
      }),
    });
  }, 90_000);

  afterAll(async () => {
    if (tenantIds.length > 0) {
      await db.delete(core.tenants).where(inArray(core.tenants.id, tenantIds));
    }
  }, 60_000);

  it("analyzes new inbound mail, stores the result, and skips mail the account sent itself", async () => {
    const d = deps(good);
    const outcome = await pending.analyzePendingEmails(db, tenantA, d);

    expect(outcome).toEqual({ analyzed: 3, failed: 0, stoppedBecause: null });
    expect(d.analyze).toHaveBeenCalledTimes(3);
    expect(d.analyze).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining("Analysis test") }),
      { tenantId: tenantA, mailboxOwner: `an-${suffix}@example.com` },
    );
    const rows = await analysisRows(tenantA);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      status: "analyzed",
      category: "lead_reply",
      priority: 1,
      needsReply: true,
      model: "test-model",
      attempts: 1,
      error: null,
    });
  }, 90_000);

  it("never analyzes the same email twice", async () => {
    const d = deps(good);
    expect(await pending.analyzePendingEmails(db, tenantA, d)).toMatchObject({ analyzed: 0, failed: 0 });
    expect(d.analyze).not.toHaveBeenCalled();
    expect(await analysisRows(tenantA)).toHaveLength(3);
  }, 60_000);

  it("never reads or analyzes another tenant's mail", async () => {
    const d = deps(good);
    expect(await pending.analyzePendingEmails(db, tenantB, d)).toEqual({ analyzed: 0, failed: 0, stoppedBecause: null });
    expect(d.analyze).not.toHaveBeenCalled();
    expect(await analysisRows(tenantB)).toHaveLength(0);
  }, 60_000);

  it("retries failures up to the limit, then leaves the email unanalyzed", async () => {
    // Forget the stored results so the three emails are pending again.
    await db.delete(et.etEmailAnalysis).where(eq(et.etEmailAnalysis.tenantId, tenantA));

    const failing = deps({ ok: false, reason: "invalid_output", message: "The AI reply could not be validated." });
    for (let attempt = 1; attempt <= pending.MAX_ATTEMPTS; attempt += 1) {
      const outcome = await pending.analyzePendingEmails(db, tenantA, failing);
      expect(outcome).toMatchObject({ analyzed: 0, failed: 3 });
      const rows = await analysisRows(tenantA);
      expect(rows.every((row) => row.status === "failed" && row.attempts === attempt)).toBe(true);
      expect(rows[0].error).toBe("The AI reply could not be validated.");
      expect(rows[0].category).toBeNull();
    }

    // The limit is reached: nothing more is tried.
    const calls = failing.analyze.mock.calls.length;
    expect(await pending.analyzePendingEmails(db, tenantA, failing)).toMatchObject({ analyzed: 0, failed: 0 });
    expect(failing.analyze.mock.calls.length).toBe(calls);
  }, 120_000);

  it("a failed email is analyzed once the service works again", async () => {
    await db
      .update(et.etEmailAnalysis)
      .set({ attempts: 1 })
      .where(eq(et.etEmailAnalysis.tenantId, tenantA)); // back within the limit
    const outcome = await pending.analyzePendingEmails(db, tenantA, deps(good));
    expect(outcome).toMatchObject({ analyzed: 3, failed: 0 });
    const rows = await analysisRows(tenantA);
    expect(rows.every((row) => row.status === "analyzed" && row.attempts === 2 && row.error === null)).toBe(true);
  }, 90_000);

  it("one failing email does not stop the others", async () => {
    await db.delete(et.etEmailAnalysis).where(eq(et.etEmailAnalysis.tenantId, tenantA));
    let call = 0;
    const mixed = deps(() => (++call === 2 ? { ok: false, reason: "provider_error", message: "The AI service did not respond. Please try again later." } : good));
    expect(await pending.analyzePendingEmails(db, tenantA, mixed)).toMatchObject({ analyzed: 2, failed: 1 });
  }, 90_000);

  it("stops early, without using attempts, when the AI service is not configured", async () => {
    await db.delete(et.etEmailAnalysis).where(eq(et.etEmailAnalysis.tenantId, tenantA));
    const unconfigured = deps({ ok: false, reason: "not_configured", message: "The AI service is not configured." });
    const outcome = await pending.analyzePendingEmails(db, tenantA, unconfigured);
    expect(outcome).toEqual({ analyzed: 0, failed: 0, stoppedBecause: "not_configured" });
    expect(unconfigured.analyze).toHaveBeenCalledTimes(1);
    expect(await analysisRows(tenantA)).toHaveLength(0);
  }, 90_000);

  it("pauses without using up any email's attempts when the credits run out, then resumes", async () => {
    await db.delete(et.etEmailAnalysis).where(eq(et.etEmailAnalysis.tenantId, tenantA));

    // Three scheduler ticks while the account has no credits: nothing is stored, nothing is used up.
    const noCredits = deps({ ok: false, reason: "quota_exhausted", message: "The AI service has no credits left." });
    for (let tick = 0; tick < 3; tick += 1) {
      expect(await pending.analyzePendingEmails(db, tenantA, noCredits)).toEqual({
        analyzed: 0,
        failed: 0,
        stoppedBecause: "quota_exhausted",
      });
    }
    expect(noCredits.analyze).toHaveBeenCalledTimes(3); // one call per tick, not one per email
    expect(await analysisRows(tenantA)).toHaveLength(0);

    // Credits are added: the very same emails are analyzed on the next run.
    expect(await pending.analyzePendingEmails(db, tenantA, deps(good))).toMatchObject({ analyzed: 3, failed: 0 });
  }, 90_000);

  it("pauses the same way when the API key is rejected", async () => {
    await db.delete(et.etEmailAnalysis).where(eq(et.etEmailAnalysis.tenantId, tenantA));
    const rejected = deps({ ok: false, reason: "auth_failed", message: "The AI service rejected the API key." });
    expect(await pending.analyzePendingEmails(db, tenantA, rejected)).toMatchObject({ stoppedBecause: "auth_failed" });
    expect(await analysisRows(tenantA)).toHaveLength(0);
  }, 90_000);

  it("respects the batch limit", async () => {
    const d = deps(good);
    const outcome = await pending.analyzePendingEmails(db, tenantA, d, 2);
    expect(outcome.analyzed).toBe(2);
    expect(d.analyze).toHaveBeenCalledTimes(2);
  }, 90_000);
});
