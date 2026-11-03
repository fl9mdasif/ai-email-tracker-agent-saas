import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { plans } from "./plans";

/**
 * Settings only platform staff can change, shared by every tenant. One row, with id "platform".
 * Core table: it knows nothing about any one product.
 */
export const platformSettings = pgTable("platform_settings", {
  id: text("id").primaryKey().default("platform"),
  /** How often the AI scans each tenant's mail from today. */
  aiScanIntervalMinutes: integer("ai_scan_interval_minutes").notNull().default(60),
  /** The plan new tenants start on. Falls back to the plan marked default when empty. */
  defaultPlanId: uuid("default_plan_id").references(() => plans.id, { onDelete: "set null" }),
  /** When false only existing users and invited emails can sign in. */
  signupsOpen: boolean("signups_open").notNull().default(true),
  /** A message shown at the top of every tenant dashboard while active. */
  announcementText: text("announcement_text").notNull().default(""),
  announcementLevel: text("announcement_level", { enum: ["info", "warning"] })
    .notNull()
    .default("info"),
  announcementActive: boolean("announcement_active").notNull().default(false),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
