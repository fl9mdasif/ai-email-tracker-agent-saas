import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { requireConfig } from "@/core/config";
import type { Database } from "@/core/db";
import { connectedAccounts } from "@/core/db/schema";
import { decryptSecret, encryptSecret, parseKey } from "./crypto";

/**
 * Credentials vault. Server-side only: never import this from a client component.
 * It stores secrets per tenant, provider and account, and knows nothing about email.
 * Every query filters by tenant_id, and the ciphertext is bound to the tenant, provider
 * and account id, so it cannot be moved to another row.
 */

/** Everything about an account except its secret. Safe to show in the UI. */
const metaColumns = {
  id: connectedAccounts.id,
  tenantId: connectedAccounts.tenantId,
  provider: connectedAccounts.provider,
  authType: connectedAccounts.authType,
  label: connectedAccounts.label,
  identity: connectedAccounts.identity,
  status: connectedAccounts.status,
  statusMessage: connectedAccounts.statusMessage,
  lastSyncedAt: connectedAccounts.lastSyncedAt,
  createdAt: connectedAccounts.createdAt,
};

export type AccountMeta = {
  id: string;
  tenantId: string;
  provider: string;
  authType: "oauth" | "api_key" | "app_password";
  label: string;
  identity: string;
  status: "connected" | "error";
  statusMessage: string | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
};

export type SaveCredentialsInput = {
  tenantId: string;
  provider: string;
  authType: AccountMeta["authType"];
  label: string;
  identity: string;
  /** Any JSON-serializable secret, e.g. { password } or { apiKey }. */
  credentials: Record<string, unknown>;
};

export class AccountExistsError extends Error {
  constructor() {
    super("This account is already connected");
    this.name = "AccountExistsError";
  }
}

const getKey = () => parseKey(requireConfig("CREDENTIALS_ENCRYPTION_KEY"));
const aadFor = (tenantId: string, provider: string, accountId: string) =>
  `${tenantId}:${provider}:${accountId}`;

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const causeCode = (error as { cause?: { code?: string } } | null)?.cause?.code;
  return code === "23505" || causeCode === "23505";
}

export async function saveCredentials(
  db: Database,
  input: SaveCredentialsInput,
): Promise<AccountMeta> {
  const id = randomUUID();
  const encryptedCredentials = encryptSecret(
    JSON.stringify(input.credentials),
    getKey(),
    aadFor(input.tenantId, input.provider, id),
  );

  try {
    const [row] = await db
      .insert(connectedAccounts)
      .values({
        id,
        tenantId: input.tenantId,
        provider: input.provider,
        authType: input.authType,
        label: input.label,
        identity: input.identity,
        encryptedCredentials,
      })
      .returning(metaColumns);
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) throw new AccountExistsError();
    throw error;
  }
}

/** Decrypts an account's secret. Returns null when the account is not this tenant's. */
export async function getCredentials(
  db: Database,
  tenantId: string,
  accountId: string,
): Promise<Record<string, unknown> | null> {
  const [row] = await db
    .select({
      provider: connectedAccounts.provider,
      encryptedCredentials: connectedAccounts.encryptedCredentials,
    })
    .from(connectedAccounts)
    .where(and(eq(connectedAccounts.id, accountId), eq(connectedAccounts.tenantId, tenantId)))
    .limit(1);
  if (!row) return null;

  const plaintext = decryptSecret(
    row.encryptedCredentials,
    getKey(),
    aadFor(tenantId, row.provider, accountId),
  );
  return JSON.parse(plaintext) as Record<string, unknown>;
}

/** Metadata only; the ciphertext is never selected. */
export async function listAccounts(db: Database, tenantId: string): Promise<AccountMeta[]> {
  return db
    .select(metaColumns)
    .from(connectedAccounts)
    .where(eq(connectedAccounts.tenantId, tenantId))
    .orderBy(desc(connectedAccounts.createdAt));
}

/** Returns true when an account of this tenant was deleted. */
export async function deleteAccount(
  db: Database,
  tenantId: string,
  accountId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(connectedAccounts)
    .where(and(eq(connectedAccounts.id, accountId), eq(connectedAccounts.tenantId, tenantId)))
    .returning({ id: connectedAccounts.id });
  return deleted.length > 0;
}

export async function setAccountStatus(
  db: Database,
  tenantId: string,
  accountId: string,
  status: AccountMeta["status"],
  statusMessage: string | null = null,
): Promise<void> {
  await db
    .update(connectedAccounts)
    .set({ status, statusMessage })
    .where(and(eq(connectedAccounts.id, accountId), eq(connectedAccounts.tenantId, tenantId)));
}
