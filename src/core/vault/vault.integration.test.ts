import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Runs against the real Neon database (env comes from vitest.config.mts); skipped when it is not configured.
const configured = Boolean(process.env.DATABASE_URL && process.env.CREDENTIALS_ENCRYPTION_KEY);

describe.skipIf(!configured)("vault (Neon)", () => {
  const SECRET = "very-secret-app-password-123";
  const suffix = Date.now();
  const tenantIds: string[] = [];

  let db: Awaited<ReturnType<typeof loadDeps>>["db"];
  let vault: typeof import("./index");
  let schema: typeof import("@/core/db/schema");
  let tenantA: string;
  let tenantB: string;
  let accountId: string;

  async function loadDeps() {
    const { getDb } = await import("@/core/db");
    return { db: getDb() };
  }

  beforeAll(async () => {
    ({ db } = await loadDeps());
    vault = await import("./index");
    schema = await import("@/core/db/schema");
    const { ensureTenantUser } = await import("@/core/tenancy/provision");
    tenantA = (await ensureTenantUser(db, { email: `vault-a-${suffix}@example.com` })).tenantId;
    tenantB = (await ensureTenantUser(db, { email: `vault-b-${suffix}@example.com` })).tenantId;
    tenantIds.push(tenantA, tenantB);

    const saved = await vault.saveCredentials(db, {
      tenantId: tenantA,
      provider: "imap-hostinger",
      authType: "app_password",
      label: "Work mail",
      identity: `a-${suffix}@example.com`,
      credentials: { password: SECRET },
    });
    accountId = saved.id;
  }, 60_000);

  afterAll(async () => {
    if (tenantIds.length > 0) {
      await db.delete(schema.tenants).where(inArray(schema.tenants.id, tenantIds)); // cascades
    }
  }, 60_000);

  it("stores only ciphertext, never the plaintext secret", async () => {
    const [row] = await db
      .select({ value: schema.connectedAccounts.encryptedCredentials })
      .from(schema.connectedAccounts)
      .where(eq(schema.connectedAccounts.id, accountId));
    expect(row.value.startsWith("v1:")).toBe(true);
    expect(row.value).not.toContain(SECRET);
  });

  it("round-trips the secret for the owning tenant", async () => {
    expect(await vault.getCredentials(db, tenantA, accountId)).toEqual({ password: SECRET });
  });

  it("returns nothing to another tenant", async () => {
    expect(await vault.getCredentials(db, tenantB, accountId)).toBeNull();
    expect(await vault.listAccounts(db, tenantB)).toEqual([]);
  });

  it("lists metadata without the ciphertext", async () => {
    const accounts = await vault.listAccounts(db, tenantA);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).not.toHaveProperty("encryptedCredentials");
    expect(JSON.stringify(accounts)).not.toContain(SECRET);
  });

  it("rejects a duplicate account for the same tenant", async () => {
    await expect(
      vault.saveCredentials(db, {
        tenantId: tenantA,
        provider: "imap-hostinger",
        authType: "app_password",
        label: "Duplicate",
        identity: `a-${suffix}@example.com`,
        credentials: { password: "other" },
      }),
    ).rejects.toBeInstanceOf(vault.AccountExistsError);
  });

  it("cannot decrypt a ciphertext moved to another account row", async () => {
    const other = await vault.saveCredentials(db, {
      tenantId: tenantA,
      provider: "imap-hostinger",
      authType: "app_password",
      label: "Second",
      identity: `a2-${suffix}@example.com`,
      credentials: { password: "second-secret" },
    });
    const [original] = await db
      .select({ value: schema.connectedAccounts.encryptedCredentials })
      .from(schema.connectedAccounts)
      .where(eq(schema.connectedAccounts.id, accountId));
    await db
      .update(schema.connectedAccounts)
      .set({ encryptedCredentials: original.value })
      .where(eq(schema.connectedAccounts.id, other.id));

    await expect(vault.getCredentials(db, tenantA, other.id)).rejects.toThrow(
      "Could not decrypt secret",
    );
  });

  it("updates status, and another tenant cannot delete the account", async () => {
    await vault.setAccountStatus(db, tenantA, accountId, "error", "Wrong password");
    const [account] = (await vault.listAccounts(db, tenantA)).filter((a) => a.id === accountId);
    expect(account.status).toBe("error");
    expect(account.statusMessage).toBe("Wrong password");

    expect(await vault.deleteAccount(db, tenantB, accountId)).toBe(false);
    expect(await vault.getCredentials(db, tenantA, accountId)).not.toBeNull();
    expect(await vault.deleteAccount(db, tenantA, accountId)).toBe(true);
    expect(await vault.getCredentials(db, tenantA, accountId)).toBeNull();
  });
});
