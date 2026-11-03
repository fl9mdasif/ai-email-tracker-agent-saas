import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const STAFF_ROLES = ["super_admin", "admin", "support", "analyst"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/**
 * People who may open the platform dashboard, and in which role. Emails listed in
 * SUPER_ADMIN_EMAILS are always super admins and are not stored here.
 */
export const platformStaff = pgTable("platform_staff", {
  /** Lower-case email address, the same one the person signs in with. */
  email: text("email").primaryKey(),
  role: text("role", { enum: STAFF_ROLES }).notNull(),
  disabled: boolean("disabled").notNull().default(false),
  addedBy: text("added_by").notNull(),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Emails allowed to sign up while sign-ups are closed. */
export const platformInvites = pgTable("platform_invites", {
  email: text("email").primaryKey(),
  invitedBy: text("invited_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One row for every change a staff member makes (and every refused attempt). Holds who, what and
 * which target, never email text, passwords or tokens.
 */
export const platformAuditLog = pgTable(
  "platform_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorEmail: text("actor_email").notNull(),
    actorRole: text("actor_role").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull().default(""),
    targetId: text("target_id").notNull().default(""),
    details: jsonb("details").$type<Record<string, string | number | boolean | null>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("platform_audit_log_created_idx").on(table.createdAt)],
);
