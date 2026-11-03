import { boolean, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { plans } from "./plans";

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** IANA time zone; decides where "today" starts for this tenant's AI scan. */
  timezone: text("timezone").notNull().default("Asia/Dhaka"),
  /** A suspended tenant cannot use the app and is skipped by the background jobs. */
  status: text("status", { enum: ["active", "suspended"] })
    .notNull()
    .default("active"),
  planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
  /** Overrides the daily AI limit of the tenant's plan when set. */
  aiDailyLimit: integer("ai_daily_limit"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  role: text("role", { enum: ["owner", "member"] })
    .notNull()
    .default("owner"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Catalog of products (modules) the platform offers, e.g. "email-tracker". */
export const modules = pgTable("modules", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Which modules a tenant has enabled; the seed of per-module billing. */
export const tenantModules = pgTable(
  "tenant_modules",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    moduleKey: text("module_key")
      .notNull()
      .references(() => modules.key, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.moduleKey] })],
);
