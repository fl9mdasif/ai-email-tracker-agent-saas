import { and, eq } from "drizzle-orm";
import type { Database } from "@/core/db";
import { etEmailState, etEmails, etFollowups } from "../db/schema";

const REASON_MAX = 300;

/** True when this email exists and belongs to the tenant. Every change below starts with this check. */
async function findOwnEmail(db: Database, tenantId: string, emailId: string): Promise<{ threadId: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(emailId)) return null;
  const [row] = await db
    .select({ threadId: etEmails.threadId })
    .from(etEmails)
    .where(and(eq(etEmails.id, emailId), eq(etEmails.tenantId, tenantId)))
    .limit(1);
  return row ?? null;
}

/** Marks an email handled (or undoes it). Returns false when the email is not this tenant's. */
export async function setHandled(db: Database, tenantId: string, emailId: string, handled: boolean): Promise<boolean> {
  if (!(await findOwnEmail(db, tenantId, emailId))) return false;
  if (handled) {
    await db.insert(etEmailState).values({ emailId, tenantId }).onConflictDoNothing({ target: etEmailState.emailId });
  } else {
    await db.delete(etEmailState).where(and(eq(etEmailState.emailId, emailId), eq(etEmailState.tenantId, tenantId)));
  }
  return true;
}

/** Adds the user's own reminder for an email. Returns the new id, or null when the email is not this tenant's. */
export async function createReminder(
  db: Database,
  tenantId: string,
  emailId: string,
  dueAt: Date,
  reason = "",
): Promise<string | null> {
  const email = await findOwnEmail(db, tenantId, emailId);
  if (!email || Number.isNaN(dueAt.getTime())) return null;
  const [row] = await db
    .insert(etFollowups)
    .values({ tenantId, emailId, threadId: email.threadId, dueAt, reason: reason.trim().slice(0, REASON_MAX), source: "manual" })
    .returning({ id: etFollowups.id });
  return row.id;
}

/** Marks a follow-up done or dismissed (or opens it again). Returns false when it is not this tenant's. */
export async function setFollowUpStatus(
  db: Database,
  tenantId: string,
  followUpId: string,
  status: "open" | "done" | "dismissed",
): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(followUpId)) return false;
  const updated = await db
    .update(etFollowups)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(etFollowups.id, followUpId), eq(etFollowups.tenantId, tenantId)))
    .returning({ id: etFollowups.id });
  return updated.length > 0;
}

/**
 * Records the AI's "follow-up needed" for an email, due now. Safe to call again: one AI follow-up
 * per email. Called by the analyzer right after it stores a result in that category.
 */
export async function recordAiFollowUp(db: Database, tenantId: string, emailId: string, reason: string): Promise<void> {
  const email = await findOwnEmail(db, tenantId, emailId);
  if (!email) return;
  await db
    .insert(etFollowups)
    .values({ tenantId, emailId, threadId: email.threadId, dueAt: new Date(), reason: reason.trim().slice(0, REASON_MAX), source: "ai" })
    .onConflictDoNothing();
}
