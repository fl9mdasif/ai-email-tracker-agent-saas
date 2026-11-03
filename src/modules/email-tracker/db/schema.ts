import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { connectedAccounts } from "@/core/db/schema/connected-accounts";
import { tenants } from "@/core/db/schema/tenancy";

/** Normalized email, the same shape whichever provider it came from. */
export const etEmails = pgTable(
  "et_emails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => connectedAccounts.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    /** The message's own id (RFC Message-ID when present), unique per account. */
    providerMessageId: text("provider_message_id").notNull(),
    threadId: text("thread_id").notNull(),
    fromAddress: text("from_address").notNull(),
    fromName: text("from_name"),
    toAddresses: jsonb("to_addresses").$type<string[]>().notNull().default([]),
    subject: text("subject").notNull().default(""),
    snippet: text("snippet").notNull().default(""),
    bodyText: text("body_text").notNull().default(""),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    direction: text("direction", { enum: ["inbound", "outbound"] }).notNull(),
    status: text("status", { enum: ["unread", "read"] })
      .notNull()
      .default("unread"),
    labels: jsonb("labels").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Syncing the same message twice can never create a second row.
    uniqueIndex("et_emails_account_message_uq").on(table.accountId, table.providerMessageId),
    index("et_emails_tenant_received_idx").on(table.tenantId, table.receivedAt),
    index("et_emails_tenant_thread_idx").on(table.tenantId, table.threadId),
  ],
);

/** One row per sync attempt of one account. */
export const etSyncRuns = pgTable(
  "et_sync_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => connectedAccounts.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: text("status", { enum: ["running", "success", "error"] })
      .notNull()
      .default("running"),
    /** A safe, user-facing message; never raw server text or credentials. */
    error: text("error"),
    fetchedCount: integer("fetched_count").notNull().default(0),
    insertedCount: integer("inserted_count").notNull().default(0),
  },
  (table) => [index("et_sync_runs_account_started_idx").on(table.accountId, table.startedAt)],
);

/** Where the last sync stopped, so the next one only fetches new mail. */
export const etSyncState = pgTable("et_sync_state", {
  accountId: uuid("account_id")
    .primaryKey()
    .references(() => connectedAccounts.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  /** IMAP UIDVALIDITY as text (it can exceed a 32-bit integer). */
  uidValidity: text("uid_validity").notNull(),
  lastUid: integer("last_uid").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * What the AI made of one email. A row exists for every email the analyzer has tried:
 * "analyzed" carries the result, "failed" carries a safe message and the number of attempts,
 * and mail that keeps failing stays unanalyzed instead of being retried forever.
 */
export const etEmailAnalysis = pgTable(
  "et_email_analysis",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    emailId: uuid("email_id")
      .notNull()
      .references(() => etEmails.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["analyzed", "failed"] }).notNull(),
    category: text("category", {
      enum: [
        "needs_reply",
        "follow_up_needed",
        "lead_reply",
        "invoice_or_payment",
        "newsletter_or_promo",
        "fyi_only",
        "spam",
      ],
    }),
    /** 1 = needs attention today, 2 = handle soon, 3 = can wait. */
    priority: integer("priority"),
    needsReply: boolean("needs_reply"),
    summary: text("summary"),
    suggestedAction: text("suggested_action"),
    model: text("model"),
    attempts: integer("attempts").notNull().default(0),
    /** A safe message, never model output or email text. */
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("et_email_analysis_email_uq").on(table.emailId),
    index("et_email_analysis_tenant_status_idx").on(table.tenantId, table.status),
    index("et_email_analysis_tenant_priority_idx").on(table.tenantId, table.priority),
  ],
);

/**
 * Where a tenant's AI scan stands. `paused` is set when the user presses Cancel: the running
 * scan stops and no automatic scan starts until the user presses "Scan now".
 */
export const etScanState = pgTable("et_scan_state", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  paused: boolean("paused").notNull().default(false),
  lastScanStartedAt: timestamp("last_scan_started_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type NewEtEmail = typeof etEmails.$inferInsert;
