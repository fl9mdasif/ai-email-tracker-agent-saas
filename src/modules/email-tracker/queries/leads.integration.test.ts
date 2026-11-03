import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NormalizedEmail } from "../types";

// Runs against the real Neon database (env comes from vitest.config.mts); skipped when it is not configured.
const configured = Boolean(process.env.DATABASE_URL && process.env.CREDENTIALS_ENCRYPTION_KEY);

describe.skipIf(!configured)("leads (Neon)", () => {
  const suffix = Date.now();
  const tenantIds: string[] = [];
  let db: Awaited<ReturnType<typeof import("@/core/db").getDb>>;
  let core: typeof import("@/core/db/schema");
  let et: typeof import("../db/schema");
  let leads: typeof import("./leads");
  let tenantA: string;
  let tenantB: string;
  const ids: Record<string, string> = {};

  const mail = (tag: string, from: string, minutesAgo: number, direction: "inbound" | "outbound" = "inbound"): NormalizedEmail => ({
    providerMessageId: `${tag}-${suffix}@test`,
    threadId: `thread-${suffix}@test`,
    from: { address: from, name: "Maria Client" },
    to: ["owner@example.com"],
    subject: `Subject ${tag}`,
    snippet: "s",
    bodyText: `body of ${tag}`,
    receivedAt: new Date(Date.now() - minutesAgo * 60_000),
    direction,
    status: "unread",
    labels: [],
  });

  async function tenantWithMail(email: string, tag: string, mails: NormalizedEmail[]) {
    const { ensureTenantUser } = await import("@/core/tenancy/provision");
    const { saveCredentials } = await import("@/core/vault");
    const { syncAccount } = await import("../sync/sync-account");
    const { tenantId } = await ensureTenantUser(db, { email });
    tenantIds.push(tenantId);
    const account = await saveCredentials(db, {
      tenantId,
      provider: "gmail",
      authType: "oauth",
      label: "Gmail",
      identity: `${tag}-${suffix}@gmail.com`,
      brand: "gmail",
      credentials: { refreshToken: "rt" },
    });
    await syncAccount(db, tenantId, account.id, {
      fetchGmailEmails: async () => ({ emails: mails, cursor: { lastInternalDateMs: 1 }, fetched: mails.length }),
    });
    const rows = await db.select({ id: et.etEmails.id, subject: et.etEmails.subject }).from(et.etEmails).where(eq(et.etEmails.tenantId, tenantId));
    for (const row of rows) ids[`${tag}:${row.subject}`] = row.id;
    return tenantId;
  }

  beforeAll(async () => {
    db = (await import("@/core/db")).getDb();
    core = await import("@/core/db/schema");
    et = await import("../db/schema");
    leads = await import("./leads");
    tenantA = await tenantWithMail(`ld-a-${suffix}@example.com`, "a", [
      mail("old", "Maria@Client.com", 120),
      mail("new", "maria@client.com", 10),
      mail("mine", "owner@example.com", 5, "outbound"),
    ]);
    tenantB = await tenantWithMail(`ld-b-${suffix}@example.com`, "b", [mail("other", "maria@client.com", 10)]);
  }, 180_000);

  afterAll(async () => {
    if (tenantIds.length > 0) await db.delete(core.tenants).where(inArray(core.tenants.id, tenantIds));
  }, 60_000);

  it("keeps one lead per sender, and only a newer email changes the verdict", async () => {
    await leads.upsertLeadFromAnalysis(db, tenantA, ids["a:Subject new"], "hot", "Asked for a price");
    // An older email analysed later must not cool the lead down.
    await leads.upsertLeadFromAnalysis(db, tenantA, ids["a:Subject old"], "cold", "Said not now");

    const { leads: rows } = await leads.listLeads(db, tenantA);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      contactEmail: "maria@client.com",
      temperature: "hot",
      reason: "Asked for a price",
      lastEmailId: ids["a:Subject new"],
      subject: "Subject new",
      mailbox: `a-${suffix}@gmail.com`,
    });
  }, 60_000);

  it("never makes a lead from the user's own sent mail", async () => {
    await leads.upsertLeadFromAnalysis(db, tenantA, ids["a:Subject mine"], "hot", "x");
    const { leads: rows } = await leads.listLeads(db, tenantA);
    expect(rows.map((row) => row.contactEmail)).toEqual(["maria@client.com"]);
  }, 60_000);

  it("keeps workspaces apart", async () => {
    // Tenant B cannot score an email of tenant A, nor see or snooze tenant A's lead.
    await leads.upsertLeadFromAnalysis(db, tenantB, ids["a:Subject new"], "warm", "x");
    expect((await leads.listLeads(db, tenantB)).leads).toEqual([]);

    const leadA = (await leads.listLeads(db, tenantA)).leads[0];
    expect(await leads.getLead(db, tenantB, leadA.id)).toBeNull();
    expect(await leads.snoozeLead(db, tenantB, leadA.id, new Date(Date.now() + 86_400_000))).toBe(false);

    const detail = await leads.getLead(db, tenantA, leadA.id);
    expect(detail?.email).toMatchObject({ id: ids["a:Subject new"], bodyText: "body of new" });
  }, 60_000);

  it("hides a snoozed lead until the snooze ends", async () => {
    const leadA = (await leads.listLeads(db, tenantA)).leads[0];
    const contacted = new Date();
    expect(await leads.snoozeLead(db, tenantA, leadA.id, new Date(Date.now() + 3 * 86_400_000), contacted)).toBe(true);

    expect(await leads.listLeads(db, tenantA)).toEqual({ leads: [], snoozed: 1 });
    const later = await leads.listLeads(db, tenantA, new Date(Date.now() + 4 * 86_400_000));
    expect(later.leads[0]).toMatchObject({ id: leadA.id, lastContactedAt: contacted });
  }, 60_000);

  it("orders hot, warm, cold", () => {
    expect((["cold", "hot", "warm"] as const).toSorted((a, b) => leads.temperatureRank(a) - leads.temperatureRank(b))).toEqual(["hot", "warm", "cold"]);
  });
});
