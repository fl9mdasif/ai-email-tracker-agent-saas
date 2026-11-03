import { asc, eq } from "drizzle-orm";
import type { Database } from "@/core/db";
import { platformStaff } from "@/core/db/schema";
import { type StaffRole, isStaffRole, resolveStaffRole } from "./permissions";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type StaffMember = { email: string; role: StaffRole; locked: boolean; disabled: boolean; addedBy: string | null; addedAt: Date | null };

/** The role this email has right now, or null. Looks the person up only when they are not in the environment list. */
export async function getStaffRole(db: Database, email: string | null | undefined, superAdminEmails: string | undefined): Promise<{ role: StaffRole; locked: boolean } | null> {
  const wanted = email?.trim().toLowerCase();
  if (!wanted) return null;
  const fromEnv = resolveStaffRole(wanted, superAdminEmails, null);
  if (fromEnv) return fromEnv;
  const [row] = await db.select({ role: platformStaff.role, disabled: platformStaff.disabled }).from(platformStaff).where(eq(platformStaff.email, wanted)).limit(1);
  return resolveStaffRole(wanted, superAdminEmails, row ?? null);
}

/** Everyone with access: the locked super admins from the environment first, then the stored staff. */
export async function listStaff(db: Database, superAdminEmails: string | undefined): Promise<StaffMember[]> {
  const locked: StaffMember[] = (superAdminEmails ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .map((email) => ({ email, role: "super_admin", locked: true, disabled: false, addedBy: null, addedAt: null }));
  const stored = await db.select().from(platformStaff).orderBy(asc(platformStaff.addedAt));
  const lockedEmails = new Set(locked.map((member) => member.email));
  return [
    ...locked,
    ...stored
      .filter((row) => !lockedEmails.has(row.email) && isStaffRole(row.role))
      .map((row) => ({ email: row.email, role: row.role, locked: false, disabled: row.disabled, addedBy: row.addedBy, addedAt: row.addedAt })),
  ];
}

export type StaffChange = { ok: true } | { ok: false; message: string };

function isLocked(email: string, superAdminEmails: string | undefined): boolean {
  return resolveStaffRole(email, superAdminEmails, null)?.locked === true;
}

/** Adds a person as staff. The environment super admins are already in, and an email can only be added once. */
export async function addStaff(db: Database, input: { email: string; role: StaffRole; addedBy: string }, superAdminEmails: string | undefined): Promise<StaffChange> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, message: "Enter a valid email address." };
  if (!isStaffRole(input.role)) return { ok: false, message: "Pick a role from the list." };
  if (isLocked(email, superAdminEmails)) return { ok: false, message: "This person is already a super admin." };
  const added = await db.insert(platformStaff).values({ email, role: input.role, addedBy: input.addedBy.toLowerCase() }).onConflictDoNothing().returning({ email: platformStaff.email });
  return added.length > 0 ? { ok: true } : { ok: false, message: "This person is already on the staff list." };
}

/** Changes a stored staff member's role. The environment super admins cannot be changed here. */
export async function setStaffRole(db: Database, email: string, role: StaffRole, superAdminEmails: string | undefined): Promise<StaffChange> {
  const wanted = email.trim().toLowerCase();
  if (isLocked(wanted, superAdminEmails)) return { ok: false, message: "A super admin from the server settings cannot be changed here." };
  if (!isStaffRole(role)) return { ok: false, message: "Pick a role from the list." };
  const updated = await db.update(platformStaff).set({ role }).where(eq(platformStaff.email, wanted)).returning({ email: platformStaff.email });
  return updated.length > 0 ? { ok: true } : { ok: false, message: "Staff member not found." };
}

/** Switches a stored staff member off or on. The environment super admins cannot be disabled here. */
export async function setStaffDisabled(db: Database, email: string, disabled: boolean, superAdminEmails: string | undefined): Promise<StaffChange> {
  const wanted = email.trim().toLowerCase();
  if (isLocked(wanted, superAdminEmails)) return { ok: false, message: "A super admin from the server settings cannot be disabled here." };
  const updated = await db.update(platformStaff).set({ disabled }).where(eq(platformStaff.email, wanted)).returning({ email: platformStaff.email });
  return updated.length > 0 ? { ok: true } : { ok: false, message: "Staff member not found." };
}
