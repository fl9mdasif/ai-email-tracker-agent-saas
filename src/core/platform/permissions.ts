export const STAFF_ROLES = ["super_admin", "admin", "support", "analyst"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const ROLE_LABELS: Record<StaffRole, string> = {
  super_admin: "Super admin",
  admin: "Admin",
  support: "Support",
  analyst: "Analyst",
};

/**
 * Everything a staff member can be allowed to do. A page or an action asks for exactly one of
 * these, so what each role may do is decided in this one file.
 */
export const PERMISSIONS = [
  "overview.view",
  "tenants.view",
  "tenants.manage",
  "tenants.delete",
  "usage.view",
  "leads.view",
  "plans.view",
  "plans.manage",
  "health.view",
  "health.act",
  "settings.manage",
  "staff.manage",
  "audit.view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  super_admin: PERMISSIONS,
  admin: PERMISSIONS.filter((permission) => !["tenants.delete", "plans.manage", "staff.manage"].includes(permission)),
  support: ["overview.view", "tenants.view", "health.view", "health.act"],
  analyst: ["overview.view", "tenants.view", "usage.view", "leads.view", "plans.view"],
};

/** True when the role is allowed to do this. Anything unknown is refused. */
export function can(role: StaffRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function permissionsOf(role: StaffRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && (STAFF_ROLES as readonly string[]).includes(value);
}

/** The person's role, or null when they are not staff. Emails in the environment list are always super admins, and locked. */
export function resolveStaffRole(
  email: string | null | undefined,
  superAdminEmails: string | undefined,
  stored: { role: string; disabled: boolean } | null,
): { role: StaffRole; locked: boolean } | null {
  const wanted = email?.trim().toLowerCase();
  if (!wanted) return null;
  const fromEnv = (superAdminEmails ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (fromEnv.includes(wanted)) return { role: "super_admin", locked: true };
  if (stored && !stored.disabled && isStaffRole(stored.role)) return { role: stored.role, locked: false };
  return null;
}
