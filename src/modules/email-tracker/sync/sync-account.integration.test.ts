import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FetchEmails } from "../connectors/imap/fetch-messages";
import type { NormalizedEmail } from "../types";

// Runs against the real Neon database (env comes from vitest.config.mts); skipped when it is not configured.
const configured = Boolean(process.env.DATABASE_URL && process.env.CREDENTIALS_ENCRYPTION_KEY);

describe.skipIf(!configured)("syncAccount (Neon)", () => {
  const suffix = Date.now();
  const PASSWORD = "hunter2-sync-test";
  const tenantIds: string[] = [];

  let db: Awaited<ReturnType<typeof import("@/core/db").getDb>>;
  let vault: typeof import("@/core/vault");
  let core: typeof import("@/core/db/schema");
  let et: typeof import("../db/schema");
  let sync: typeof import("./sync-account");
  let imapErrors: typeof import("../connectors/imap/errors");
  let tenantA: string;
  let tenantB: string;
  let accountId: string;

  const mail = (n: number): NormalizedEmail => ({
    providerMessageId: `m${n}-${suffix}@test`,
    threadId: `m${n}-${suffix}@test`,
    from: { address: "maria@client.com", name: "Maria" },
    to: ["owner@example.com"],
    subject: `Subject ${n}`,
    snippet: "snippet",
    bodyText: "body text",
    receivedAt: new Date(`2026-11-0${n}T08:00:00Z`),
    direction: "inbound",
    status: "unread",
    labels: [],
  });

  const fakeFetch = (emails: NormalizedEmail[], lastUid: number) =>
    vi.fn<FetchEmails>(async () => ({
      emails,
      cursor: { uidValidity: "9", lastUid },
      fetched: emails.length,
    }));

  const countEmails = async () =>
    (await db.select({ id: et.etEmails.id }).from(et.etEmails).where(eq(et.etEmails.accountId, accountId)))
      .length;

  async function newAccount(tenantId: string, identity: string) {
    return vault.saveCredentials(db, {
      tenantId,
      provider: "imap",
      authType: "app_password",
      label: "Test",
      identity,
      credentials: {
        preset: "hostinger",
        host: "imap.hostinger.com",
        port: 993,
        secure: true,
        user: identity,
        password: PASSWORD,
      },
    });
  }

  beforeAll(async () => {
    const { getDb } = await import("@/core/db");
    db = getDb();
    vault = await import("@/core/vault");
    core = await import("@/core/db/schema");
    et = await import("../db/schema");
    sync = await import("./sync-account");
    imapErrors = await import("../connectors/imap/errors");
    const { ensureTenantUser } = await import("@/core/tenancy/provision");
    tenantA = (await ensureTenantUser(db, { email: `sync-a-${suffix}@example.com` })).tenantId;
    tenantB = (await ensureTenantUser(db, { email: `sync-b-${suffix}@example.com` })).tenantId;
    tenantIds.push(tenantA, tenantB);
    accountId = (await newAccount(tenantA, `owner-${suffix}@example.com`)).id;
  }, 60_000);

  afterAll(async () => {
    if (tenantIds.length > 0) {
      await db.delete(core.tenants).where(inArray(core.tenants.id, tenantIds)); // cascades everything
    }
  }, 60_000);

  it("stores new mail, saves the cursor and marks the account synced", async () => {
    const fetchEmails = fakeFetch([mail(1), mail(2), mail(3)], 3);
    const outcome = await sync.syncAccount(db, tenantA, accountId, { fetchEmails });

    expect(outcome).toEqual({ status: "success", fetched: 3, inserted: 3 });
    expect(fetchEmails).toHaveBeenCalledWith(
      expect.objectContaining({ host: "imap.hostinger.com", password: PASSWORD }),
      null, // first sync has no cursor
      `owner-${suffix}@example.com`,
    );
    expect(await countEmails()).toBe(3);

    const [state] = await db.select().from(et.etSyncState).where(eq(et.etSyncState.accountId, accountId));
    expect(state).toMatchObject({ uidValidity: "9", lastUid: 3, tenantId: tenantA });

    const account = await vault.getAccount(db, tenantA, accountId);
    expect(account?.status).toBe("connected");
    expect(account?.lastSyncedAt).toBeInstanceOf(Date);
  }, 60_000);

  it("is idempotent: syncing the same mail again creates no duplicates", async () => {
    const fetchEmails = fakeFetch([mail(1), mail(2), mail(3)], 3);
    const outcome = await sync.syncAccount(db, tenantA, accountId, { fetchEmails });

    expect(outcome).toEqual({ status: "success", fetched: 3, inserted: 0 });
    expect(await countEmails()).toBe(3);
    expect(fetchEmails).toHaveBeenCalledWith(expect.anything(), { uidValidity: "9", lastUid: 3 }, expect.any(String));
  }, 60_000);

  it("adds only the new message when one arrives", async () => {
    const outcome = await sync.syncAccount(db, tenantA, accountId, {
      fetchEmails: fakeFetch([mail(3), mail(4)], 4),
    });
    expect(outcome).toEqual({ status: "success", fetched: 2, inserted: 1 });
    expect(await countEmails()).toBe(4);
  }, 60_000);

  it("records a failure without throwing, keeps the data, and recovers on the next success", async () => {
    const failing = vi.fn<FetchEmails>(async () => {
      throw Object.assign(new Error(`connect ECONNREFUSED for ${PASSWORD}`), { code: "ECONNREFUSED" });
    });
    const outcome = await sync.syncAccount(db, tenantA, accountId, { fetchEmails: failing });

    expect(outcome).toEqual({ status: "error", message: imapErrors.IMAP_MESSAGES.unreachable });
    expect(await countEmails()).toBe(4);

    const runs = await db.select().from(et.etSyncRuns).where(eq(et.etSyncRuns.accountId, accountId));
    const failed = runs.filter((run) => run.status === "error");
    expect(failed).toHaveLength(1);
    expect(failed[0].error).toBe(imapErrors.IMAP_MESSAGES.unreachable);
    expect(failed[0].finishedAt).toBeInstanceOf(Date);
    expect(JSON.stringify(runs)).not.toContain(PASSWORD);

    expect((await vault.getAccount(db, tenantA, accountId))?.status).toBe("error");

    const recovered = await sync.syncAccount(db, tenantA, accountId, { fetchEmails: fakeFetch([mail(4)], 4) });
    expect(recovered.status).toBe("success");
    const account = await vault.getAccount(db, tenantA, accountId);
    expect(account).toMatchObject({ status: "connected", statusMessage: null });
  }, 60_000);

  it("never syncs another tenant's account", async () => {
    const fetchEmails = fakeFetch([mail(1)], 1);
    const outcome = await sync.syncAccount(db, tenantB, accountId, { fetchEmails });

    expect(outcome).toEqual({ status: "not_found" });
    expect(fetchEmails).not.toHaveBeenCalled();
    const runs = await db.select().from(et.etSyncRuns).where(eq(et.etSyncRuns.tenantId, tenantB));
    expect(runs).toHaveLength(0);
  }, 60_000);

  it("reports unreadable stored credentials instead of crashing", async () => {
    const broken = await newAccount(tenantA, `broken-${suffix}@example.com`);
    await db
      .update(core.connectedAccounts)
      .set({ encryptedCredentials: "v1:AAAA:BBBB:CCCC" })
      .where(and(eq(core.connectedAccounts.id, broken.id), eq(core.connectedAccounts.tenantId, tenantA)));

    const fetchEmails = fakeFetch([], 0);
    const outcome = await sync.syncAccount(db, tenantA, broken.id, { fetchEmails });
    expect(outcome.status).toBe("error");
    expect(fetchEmails).not.toHaveBeenCalled();
  }, 60_000);
});
