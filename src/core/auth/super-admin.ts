import { notFound } from "next/navigation";
import { auth } from "@/core/auth";
import { getConfig } from "@/core/config";
import { isSuperAdminEmail } from "./super-admin-email";

/** The signed-in user's email when they are a super admin, otherwise null. */
export async function getSuperAdminEmail(): Promise<string | null> {
  const session = await auth();
  const email = session?.user?.email ?? null;
  return session?.tenantId && isSuperAdminEmail(email, getConfig().SUPER_ADMIN_EMAILS) ? email : null;
}

/**
 * Guard for platform pages and actions. Anyone else gets a plain 404, so the page does not even
 * reveal that it exists.
 */
export async function requireSuperAdmin(): Promise<string> {
  const email = await getSuperAdminEmail();
  if (!email) notFound();
  return email;
}
