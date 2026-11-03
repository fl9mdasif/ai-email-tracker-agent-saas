import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Settings only a super admin can change, shared by every tenant. One row, with id "platform".
 * Core table: it knows nothing about any one product.
 */
export const platformSettings = pgTable("platform_settings", {
  id: text("id").primaryKey().default("platform"),
  /** How often the AI scans each tenant's mail from today. */
  aiScanIntervalMinutes: integer("ai_scan_interval_minutes").notNull().default(60),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
