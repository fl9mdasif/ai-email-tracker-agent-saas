import { sql } from "drizzle-orm";
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
import { tenants, users } from "@/core/db/schema/tenancy";

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
  /** Where a provider other than IMAP stopped, e.g. Gmail's { lastInternalDateMs }. Null for IMAP. */
  cursor: jsonb("cursor").$type<Record<string, unknown>>(),
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
    /** Set only for mail from a prospect: how keen they are to buy. Null for everything else. */
    leadTemperature: text("lead_temperature", { enum: ["hot", "warm", "cold"] }),
    /** One short sentence on why, e.g. "Asked for a price for 10 seats". */
    leadReason: text("lead_reason"),
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

/** The user's own state for one email. A row means "handled"; deleting it undoes that. */
export const etEmailState = pgTable(
  "et_email_state",
  {
    emailId: uuid("email_id")
      .primaryKey()
      .references(() => etEmails.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    handledAt: timestamp("handled_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("et_email_state_tenant_idx").on(table.tenantId)],
);

/**
 * Things to follow up on: created by the AI (a mail it marked "follow-up needed") or by the user
 * ("Remind me"). One AI follow-up per email; a user can add several reminders.
 */
export const etFollowups = pgTable(
  "et_followups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    emailId: uuid("email_id")
      .notNull()
      .references(() => etEmails.id, { onDelete: "cascade" }),
    threadId: text("thread_id").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    reason: text("reason").notNull().default(""),
    source: text("source", { enum: ["ai", "manual"] }).notNull(),
    status: text("status", { enum: ["open", "done", "dismissed"] })
      .notNull()
      .default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("et_followups_tenant_status_due_idx").on(table.tenantId, table.status, table.dueAt),
    // The AI never creates two follow-ups for the same email, however often analysis runs.
    uniqueIndex("et_followups_ai_email_uq").on(table.emailId).where(sql`${table.source} = 'ai'`),
  ],
);

/**
 * The chat conversation, one rolling thread per user. Answers can mention what the AI made of
 * someone's mail, so these rows belong to the workspace: the owner can clear them, they are in
 * the data export, they go with the workspace, and platform staff never read them.
 */
export const etChatMessages = pgTable(
  "et_chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    /** Ids of the emails an answer is based on, shown as links. Empty for questions. */
    citedEmailIds: jsonb("cited_email_ids").$type<string[]>().notNull().default([]),
    /** "paused" means the AI service was unavailable, so the attempt is not counted against the rate limit. */
    status: text("status", { enum: ["ok", "error", "paused"] })
      .notNull()
      .default("ok"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("et_chat_messages_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("et_chat_messages_user_created_idx").on(table.tenantId, table.userId, table.createdAt),
  ],
);

export const LEAD_TEMPERATURES = ["hot", "warm", "cold"] as const;
export type LeadTemperature = (typeof LEAD_TEMPERATURES)[number];

/**
 * One prospect per workspace, keyed by their email address. The newest scored email from them
 * decides the temperature. A lead that was just written to (or skipped) is snoozed so it is not
 * suggested again too soon.
 */
export const etLeads = pgTable(
  "et_leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Lower-cased. */
    contactEmail: text("contact_email").notNull(),
    contactName: text("contact_name"),
    temperature: text("temperature", { enum: LEAD_TEMPERATURES }).notNull(),
    reason: text("reason").notNull().default(""),
    /** The newest scored email from this contact: the one a follow-up replies to. */
    lastEmailId: uuid("last_email_id").references(() => etEmails.id, { onDelete: "set null" }),
    lastEmailAt: timestamp("last_email_at", { withTimezone: true }),
    lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("et_leads_tenant_contact_uq").on(table.tenantId, table.contactEmail),
    index("et_leads_tenant_temperature_idx").on(table.tenantId, table.temperature),
  ],
);

export const DRAFT_STATUSES = ["draft", "sending", "sent", "skipped", "failed"] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

/**
 * A follow-up the AI wrote for a lead, waiting for the user. Nothing is ever sent without the
 * user pressing Send on exactly this draft. "sending" is held while one send is in flight, so a
 * second click cannot send it again.
 */
export const etFollowupDrafts = pgTable(
  "et_followup_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => etLeads.id, { onDelete: "cascade" }),
    /** The email this follow-up answers (it carries the thread and the mailbox). */
    replyToEmailId: uuid("reply_to_email_id")
      .notNull()
      .references(() => etEmails.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => connectedAccounts.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    status: text("status", { enum: DRAFT_STATUSES }).notNull().default("draft"),
    model: text("model"),
    /** A short code such as "auth_failed", never server text. */
    errorCode: text("error_code"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("et_followup_drafts_tenant_lead_idx").on(table.tenantId, table.leadId),
    index("et_followup_drafts_tenant_created_idx").on(table.tenantId, table.createdAt),
  ],
);

/**
 * Every send attempt: who sent which draft from which mailbox to whom, and whether it went.
 * Deliberately no subject and no body.
 */
export const etSendAudit = pgTable(
  "et_send_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    draftId: uuid("draft_id").references(() => etFollowupDrafts.id, { onDelete: "set null" }),
    accountId: uuid("account_id").references(() => connectedAccounts.id, { onDelete: "set null" }),
    toAddress: text("to_address").notNull(),
    /** The Message-ID of the sent mail, when the provider gave one. */
    sentMessageId: text("sent_message_id"),
    outcome: text("outcome", { enum: ["sent", "failed"] }).notNull(),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("et_send_audit_tenant_created_idx").on(table.tenantId, table.createdAt)],
);

export type NewEtEmail = typeof etEmails.$inferInsert;
