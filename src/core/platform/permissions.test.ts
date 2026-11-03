import { describe, expect, it } from "vitest";
import { PERMISSIONS, type Permission, STAFF_ROLES, type StaffRole, can, isStaffRole, permissionsOf, resolveStaffRole } from "./permissions";

/** The agreed table, written out in full: what each role may do and nothing else. */
const EXPECTED: Record<StaffRole, Permission[]> = {
  super_admin: [...PERMISSIONS],
  admin: [
    "overview.view",
    "tenants.view",
    "tenants.manage",
    "usage.view",
    "leads.view",
    "plans.view",
    "health.view",
    "health.act",
    "settings.manage",
    "audit.view",
  ],
  support: ["overview.view", "tenants.view", "health.view", "health.act"],
  analyst: ["overview.view", "tenants.view", "usage.view", "leads.view", "plans.view"],
};

describe("permission map", () => {
  for (const role of STAFF_ROLES) {
    it(`${role} has exactly its agreed permissions`, () => {
      for (const permission of PERMISSIONS) {
        expect(can(role, permission), `${role} / ${permission}`).toBe(EXPECTED[role].includes(permission));
      }
      expect([...permissionsOf(role)].sort()).toEqual([...EXPECTED[role]].sort());
    });
  }

  it("only a super admin can delete a tenant, edit plans or manage staff", () => {
    for (const permission of ["tenants.delete", "plans.manage", "staff.manage"] as const) {
      expect(STAFF_ROLES.filter((role) => can(role, permission))).toEqual(["super_admin"]);
    }
  });

  it("support and analyst can never change settings, tenants or plans", () => {
    for (const role of ["support", "analyst"] as const) {
      for (const permission of ["tenants.manage", "settings.manage", "plans.manage", "staff.manage", "tenants.delete"] as const) {
        expect(can(role, permission)).toBe(false);
      }
    }
  });

  it("refuses anyone without a role, and an unknown role", () => {
    expect(can(null, "overview.view")).toBe(false);
    expect(can(undefined, "overview.view")).toBe(false);
    expect(can("hacker" as StaffRole, "overview.view")).toBe(false);
  });

  it("recognises real roles only", () => {
    expect(isStaffRole("support")).toBe(true);
    expect(isStaffRole("root")).toBe(false);
    expect(isStaffRole(undefined)).toBe(false);
  });
});

describe("resolveStaffRole", () => {
  it("makes emails in the environment list super admins, locked, ignoring case and spaces", () => {
    expect(resolveStaffRole("Owner@Example.com", " owner@example.com , other@example.com ", null)).toEqual({ role: "super_admin", locked: true });
  });

  it("the environment list wins over a stored lower role", () => {
    expect(resolveStaffRole("owner@example.com", "owner@example.com", { role: "support", disabled: false })).toEqual({ role: "super_admin", locked: true });
  });

  it("uses the stored role for other staff", () => {
    expect(resolveStaffRole("sam@example.com", "owner@example.com", { role: "support", disabled: false })).toEqual({ role: "support", locked: false });
  });

  it("gives nothing to disabled staff, unknown roles, strangers and missing emails", () => {
    expect(resolveStaffRole("sam@example.com", "owner@example.com", { role: "admin", disabled: true })).toBeNull();
    expect(resolveStaffRole("sam@example.com", "owner@example.com", { role: "king", disabled: false })).toBeNull();
    expect(resolveStaffRole("stranger@example.com", "owner@example.com", null)).toBeNull();
    expect(resolveStaffRole(null, "owner@example.com", null)).toBeNull();
    expect(resolveStaffRole("", "", null)).toBeNull();
  });
});
