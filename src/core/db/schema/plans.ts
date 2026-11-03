import { boolean, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * What a tenant gets and what it is meant to cost. Plans are managed by a super admin and only
 * describe price and limits: nothing here takes a payment.
 */
export const plans = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Short stable name used in code and URLs, e.g. "free". */
    key: text("key").notNull(),
    name: text("name").notNull(),
    priceMonthlyCents: integer("price_monthly_cents").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    /** The most mailboxes a tenant on this plan may connect. */
    maxAccounts: integer("max_accounts").notNull().default(1),
    /** The most emails the AI analyzes per day for a tenant on this plan. */
    dailyAiLimit: integer("daily_ai_limit").notNull().default(50),
    /** New tenants start on the default plan. */
    isDefault: boolean("is_default").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("plans_key_uq").on(table.key)],
);
