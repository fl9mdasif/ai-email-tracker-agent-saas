"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { signOut } from "@/core/auth";
import { getDb } from "@/core/db";
import { tenants } from "@/core/db/schema";
import { isValidTimeZone } from "@/core/lib/time";
import { requireModule } from "@/core/modules/guard";
import { deleteTenant } from "@/core/tenancy/delete";
import { listAccounts } from "@/core/vault";
import { GMAIL_PROVIDER } from "@/modules/email-tracker/connectors/gmail";
import { revokeGmailAccess } from "@/modules/email-tracker/connectors/gmail/revoke";

export type TimeZoneFormState = { status: "idle" | "success" | "error"; message: string };

export const initialTimeZoneFormState: TimeZoneFormState = { status: "idle", message: "" };

/**
 * Deletes the signed-in user's whole workspace after they type its name. Gmail access is cancelled
 * on Google's side first. This cannot be undone; on success the user is signed out and sent home.
 */
export async function deleteWorkspaceAction(confirmation: string): Promise<{ ok: false; message: string }> {
  const session = await requireModule("email-tracker");
  const db = getDb();
  const [tenant] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, session.tenantId)).limit(1);
  if (!tenant) return { ok: false, message: "Workspace not found." };
  if (confirmation.trim() !== tenant.name.trim()) return { ok: false, message: "The name does not match. Nothing was deleted." };

  for (const account of await listAccounts(db, session.tenantId)) {
    if (account.provider === GMAIL_PROVIDER) await revokeGmailAccess(db, session.tenantId, account.id);
  }
  if (!(await deleteTenant(db, session.tenantId))) return { ok: false, message: "Workspace not found." };

  // The session cookie is cleared here; this call ends the request with a redirect.
  await signOut({ redirectTo: "/" });
  return { ok: false, message: "Signed out." };
}

const timeZoneSchema = z.string().min(1).refine(isValidTimeZone, "Pick a time zone from the list.");

/** Saves the signed-in tenant's time zone, which decides where "today" starts for the AI scan. */
export async function saveTimeZoneAction(_previous: TimeZoneFormState, formData: FormData): Promise<TimeZoneFormState> {
  const session = await requireModule("email-tracker");
  const parsed = timeZoneSchema.safeParse(formData.get("timezone"));
  if (!parsed.success) return { status: "error", message: "Pick a time zone from the list." };

  await getDb().update(tenants).set({ timezone: parsed.data }).where(eq(tenants.id, session.tenantId));
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  return { status: "success", message: "Saved." };
}
