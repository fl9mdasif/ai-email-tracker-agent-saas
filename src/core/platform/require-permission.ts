import { notFound } from "next/navigation";
import { auth } from "@/core/auth";
import { getConfig } from "@/core/config";
import { getDb } from "@/core/db";
import { type Permission, type StaffRole, can } from "./permissions";
import { getStaffRole } from "./staff";

export type PlatformActor = { email: string; role: StaffRole; locked: boolean };

/** The signed-in person as platform staff, or null when they are not staff (or not signed in). */
export async function getPlatformActor(): Promise<PlatformActor | null> {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!session?.tenantId || !email) return null;
  const found = await getStaffRole(getDb(), email, getConfig().SUPER_ADMIN_EMAILS);
  return found ? { email, role: found.role, locked: found.locked } : null;
}

/**
 * Guard for platform pages. Without the permission the page is a plain 404, so it does not even
 * reveal that it exists. Returns the person so the page can show and audit who is acting.
 */
export async function requirePermission(permission: Permission): Promise<PlatformActor> {
  const actor = await getPlatformActor();
  if (!actor || !can(actor.role, permission)) notFound();
  return actor;
}

/** Guard for server actions: returns the person, or null when they may not do this (the action then refuses). */
export async function authorize(permission: Permission): Promise<PlatformActor | null> {
  const actor = await getPlatformActor();
  return actor && can(actor.role, permission) ? actor : null;
}
