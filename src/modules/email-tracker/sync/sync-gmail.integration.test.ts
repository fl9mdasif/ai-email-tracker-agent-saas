import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GmailError } from "../connectors/gmail/errors";
import type { FetchGmailEmails } from "../connectors/gmail/fetch-messages";
import type { NormalizedEmail } from "../types";

// Runs against the real Neon database (env comes from vitest.config.mts); skipped when it is not configured.
const configured = Boolean(process.env.DATABASE_URL && process.env.CREDENTIALS_ENCRYPTION_KEY);

describe.skipIf(!configured)("syncAccount for Gmail (Neon)", () => {
  const suffix = Date.now();
  const tenantIds: string[] = [];
  let db: Awaited<ReturnType<typeof import("@/core/db").getDb>>;
  let vault: typeof import("@/core/vault");
  let core: typeof import("@/core/db/schema");
  let et: typeof import("../db/schema");
  let sync: typeof import("./sync-account");
  let tenantA: string;
  let tenantB: string;
  let first: string;
  let second: string;

  const mail = (n: number, tag: string): NormalizedEmail => ({
    providerMessageId: `${tag}-g${n}-${suffix}@test`,
    threadId: `${tag}-g${n}-${suffix}@test`,
    from: { address: "maria@client.com", name: "Maria" },
    to: ["owner@gmail.com"],
    subject: `Gmail ${n}`,
    snippet: "s",
    bodyText: "body",
    receivedAt: new Date(`2026-11-0${n}T08:00:00Z`),
    direction: "inbound",
    status: "unread",
    labels: [],
  });

  const fakeGmail = (emails: NormalizedEmail[], lastInternalDateMs: number) =>
    vi.fn<FetchGmailEmails>(async () => ({ emails, cursor: { lastInternalDateMs }, fetched: emails.length }));

  const storedCount = async (accountId: string) =>
    (await db.select({ id: et.etEmails.id }).from(et.etEmails).where(eq(et.etEmails.accountId, accountId))).length;

  const addGmail = (tenantId: string, identity: string, refreshToken: string) =>
    vault.saveCredentials(db, {
      tenantId,
      provider: "gmail",
      authType: "oauth",
      label: "Gmail",
      identity,
      brand: "gmail",
      credentials: { refreshToken },
    });

  beforeAll(async () => {
    db = (await import("@/core/db")).getDb();
    vault = await import("@/core/vault");
    core = await import("@/core/db/schema");
    et = await import("../db/schema");
    sync = await import("./sync-account");
    const { ensureTenantUser } = await import("@/core/tenancy/provision");
    tenantA = (await ensureTenantUser(db, { email: `gm-a-${suffix}@example.com` })).tenantId;
    tenantB = (await ensureTenantUser(db, { email: `gm-b-${suffix}@example.com` })).tenantId;
    tenantIds.push(tenantA, tenantB);
    first = (await addGmail(tenantA, `first-${suffix}@gmail.com`, "rt-first")).id;
    second = (await addGmail(tenantA, `second-${suffix}@gmail.com`, "rt-second")).id;
  }, 60_000);

  afterAll(async () => {
    if (tenantIds.length > 0) await db.delete(core.tenants).where(inArray(core.tenants.id, tenantIds));
  }, 60_000);

  it("one tenant can connect several Gmail accounts, but the same address only once", async () => {
    expect((await vault.listAccounts(db, tenantA)).filter((account) => account.provider === "gmail")).toHaveLength(2);
    await expect(addGmail(tenantA, `first-${suffix}@gmail.com`, "again")).rejects.toBeInstanceOf(vault.AccountExistsError);
  }, 60_000);

  it("stores mail, saves the cursor, and passes it to the next sync; a repeat adds no duplicates", async () => {
    const fetchGmailEmails = fakeGmail([mail(1, "a"), mail(2, "a")], 1_000);
    expect(await sync.syncAccount(db, tenantA, first, { fetchGmailEmails })).toEqual({ status: "success", fetched: 2, inserted: 2 });
    expect(fetchGmailEmails).toHaveBeenCalledWith({ refreshToken: "rt-first" }, null, `first-${suffix}@gmail.com`);

    const again = fakeGmail([mail(1, "a"), mail(2, "a"), mail(3, "a")], 2_000);
    expect(await sync.syncAccount(db, tenantA, first, { fetchGmailEmails: again })).toEqual({ status: "success", fetched: 3, inserted: 1 });
    expect(again).toHaveBeenCalledWith({ refreshToken: "rt-first" }, { lastInternalDateMs: 1_000 }, `first-${suffix}@gmail.com`);
    expect(await storedCount(first)).toBe(3);
  }, 90_000);

  it("a Gmail account that needs reconnecting is recorded as an error and does not stop the other one", async () => {
    const expired = vi.fn<FetchGmailEmails>(async () => {
      throw new GmailError("reconnect", 400);
    });
    const outcome = await sync.syncAccount(db, tenantA, first, { fetchGmailEmails: expired });
    expect(outcome).toEqual({ status: "error", message: "Google access expired or was removed. Reconnect this account." });
    expect(await vault.getAccount(db, tenantA, first)).toMatchObject({ status: "error" });

    const healthy = fakeGmail([mail(1, "b")], 5_000);
    expect(await sync.syncAccount(db, tenantA, second, { fetchGmailEmails: healthy })).toMatchObject({ status: "success", inserted: 1 });
    expect(await vault.getAccount(db, tenantA, second)).toMatchObject({ status: "connected" });
  }, 90_000);

  it("reconnecting replaces the credentials on the same account and clears the error", async () => {
    expect(await vault.updateCredentials(db, tenantA, first, { refreshToken: "rt-new" })).toBe(true);
    expect(await vault.getAccount(db, tenantA, first)).toMatchObject({ status: "connected", statusMessage: null });
    expect(await vault.getCredentials(db, tenantA, first)).toEqual({ refreshToken: "rt-new" });
    const found = await vault.findAccountByIdentity(db, tenantA, "gmail", `first-${suffix}@gmail.com`);
    expect(found?.id).toBe(first);
  }, 60_000);

  it("another tenant can neither sync, find nor reconnect these accounts", async () => {
    const fetchGmailEmails = fakeGmail([], 0);
    expect(await sync.syncAccount(db, tenantB, first, { fetchGmailEmails })).toEqual({ status: "not_found" });
    expect(fetchGmailEmails).not.toHaveBeenCalled();
    expect(await vault.updateCredentials(db, tenantB, first, { refreshToken: "stolen" })).toBe(false);
    expect(await vault.findAccountByIdentity(db, tenantB, "gmail", `first-${suffix}@gmail.com`)).toBeNull();
    expect(await vault.getCredentials(db, tenantA, first)).toEqual({ refreshToken: "rt-new" });
  }, 60_000);

  it("the scheduler lists Gmail accounts too", async () => {
    const { listSyncableAccounts } = await import("./list-syncable-accounts");
    const listed = await listSyncableAccounts(db);
    expect(listed).toContainEqual({ tenantId: tenantA, accountId: first });
    expect(listed).toContainEqual({ tenantId: tenantA, accountId: second });
  }, 60_000);
});
