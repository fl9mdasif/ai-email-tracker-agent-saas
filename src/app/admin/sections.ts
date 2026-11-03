import { type Permission, type StaffRole, can } from "@/core/platform/permissions";

export type AdminIcon = "overview" | "tenants" | "plans" | "leads" | "usage" | "health" | "settings" | "staff" | "audit";

export type AdminSection = { href: string; label: string; icon: AdminIcon; permission: Permission };

/**
 * Every section of the platform dashboard and the permission that opens it. A section is added
 * here when its page exists, and the menu then shows it only to roles that have the permission.
 */
export const ADMIN_SECTIONS: AdminSection[] = [
  { href: "/admin", label: "Overview", icon: "overview", permission: "overview.view" },
  { href: "/admin/settings", label: "Settings", icon: "settings", permission: "settings.manage" },
];

/** The sections this role may open, in menu order. */
export function sectionsFor(role: StaffRole): AdminSection[] {
  return ADMIN_SECTIONS.filter((section) => can(role, section.permission));
}
