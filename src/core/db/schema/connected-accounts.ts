import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenancy";

/**
 * An external account a tenant has connected (mailbox, API key, OAuth grant).
 * The vault owns this table: credentials are stored only as AES-256-GCM ciphertext.
 */
export const connectedAccounts = pgTable(
  "connected_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    authType: text("auth_type", { enum: ["oauth", "api_key", "app_password"] }).notNull(),
    label: text("label").notNull(),
    /** Public identifier of the account, e.g. the mailbox address. */
    identity: text("identity").notNull(),
    encryptedCredentials: text("encrypted_credentials").notNull(),
    status: text("status", { enum: ["connected", "error"] })
      .notNull()
      .default("connected"),
    statusMessage: text("status_message"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("connected_accounts_tenant_provider_identity_uq").on(
      table.tenantId,
      table.provider,
      table.identity,
    ),
    index("connected_accounts_tenant_idx").on(table.tenantId),
  ],
);
