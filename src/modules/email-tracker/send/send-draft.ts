import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { Database } from "@/core/db";
import { GMAIL_PROVIDER } from "../connectors/gmail";
import { etEmails, etFollowupDrafts, etLeads, etSendAudit } from "../db/schema";
import { snoozeLead } from "../queries/leads";
import { createReminder } from "../queries/mutations";
import { sendFromAccount } from "./send-from-account";
import { SEND_FAILURES, type SendFailure, type SendResult } from "./types";

/** Emails a workspace may send from Loopify in a rolling 24 hours. */
export const SENDS_PER_DAY = 50;
/** After a follow-up goes out, the lead stays out of the list this long, and a reminder is due then. */
export const AFTER_SEND_DAYS = 3;
const DAY_MS = 86_400_000;
const UUID = /^[0-9a-f-]{36}$/i;

export type SendOne = typeof sendFromAccount;

export type SendDraftResult =
  | { ok: true; sentAt: Date }
  | { ok: false; kind: "not_found" | "not_open" | "limit"; message: string }
  | { ok: false; kind: "send_failed"; code: SendFailure; message: string };

/** Emails this workspace sent from Loopify in the last 24 hours. */
export async function sendsToday(db: Database, tenantId: string, now = new Date()): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(etSendAudit)
    .where(and(eq(etSendAudit.tenantId, tenantId), eq(etSendAudit.outcome, "sent"), gte(etSendAudit.createdAt, new Date(now.getTime() - DAY_MS))));
  return row?.count ?? 0;
}

/**
 * Sends one draft, because the user pressed Send on it. Exactly one email per call, and never
 * twice for the same draft: the draft is first claimed by moving it from "draft" (or "failed",
 * for a retry) to "sending" in a single conditional update, so a double click or a second tab
 * finds nothing to claim. Every attempt leaves an audit row (who, which draft, which mailbox, to
 * whom, outcome), never the subject or the text. After a send the lead rests for a few days and
 * a reminder to check for an answer is added.
 */
export async function sendDraft(
  db: Database,
  input: { tenantId: string; userId: string; draftId: string },
  deps: { send?: SendOne; now?: Date } = {},
): Promise<SendDraftResult> {
  const { tenantId, userId, draftId } = input;
  const now = deps.now ?? new Date();
  if (!UUID.test(draftId)) return { ok: false, kind: "not_found", message: "This draft was not found." };

  const [found] = await db
    .select({ draft: etFollowupDrafts, email: etEmails, contactEmail: etLeads.contactEmail, contactName: etLeads.contactName })
    .from(etFollowupDrafts)
    .innerJoin(etEmails, and(eq(etEmails.id, etFollowupDrafts.replyToEmailId), eq(etEmails.tenantId, tenantId)))
    .innerJoin(etLeads, and(eq(etLeads.id, etFollowupDrafts.leadId), eq(etLeads.tenantId, tenantId)))
    .where(and(eq(etFollowupDrafts.id, draftId), eq(etFollowupDrafts.tenantId, tenantId)))
    .limit(1);
  if (!found) return { ok: false, kind: "not_found", message: "This draft was not found." };
  const { draft, email } = found;
  if (draft.status !== "draft" && draft.status !== "failed") {
    return { ok: false, kind: "not_open", message: draft.status === "sent" ? "This follow-up was already sent." : "This draft is not waiting to be sent." };
  }

  if ((await sendsToday(db, tenantId, now)) >= SENDS_PER_DAY) {
    return { ok: false, kind: "limit", message: `${SENDS_PER_DAY} emails were sent from Loopify in the last 24 hours, the most for one day. Try again later.` };
  }

  // The claim: only one caller can move this draft to "sending".
  const claimed = await db
    .update(etFollowupDrafts)
    .set({ status: "sending", errorCode: null, updatedAt: now })
    .where(and(eq(etFollowupDrafts.id, draftId), eq(etFollowupDrafts.tenantId, tenantId), inArray(etFollowupDrafts.status, ["draft", "failed"])))
    .returning({ id: etFollowupDrafts.id });
  if (claimed.length === 0) return { ok: false, kind: "not_open", message: "This draft is already being sent." };

  const to = found.contactEmail;
  let result: SendResult;
  try {
    result = await (deps.send ?? sendFromAccount)(db, tenantId, draft.accountId, {
      to,
      subject: draft.subject,
      text: draft.body,
      replyToMessageId: email.providerMessageId,
      threadRootId: email.threadId,
      gmailThreadId: email.provider === GMAIL_PROVIDER ? email.threadId : null,
    });
  } catch {
    result = { ok: false, code: "unknown" };
  }

  if (!result.ok) {
    await db
      .update(etFollowupDrafts)
      .set({ status: "failed", errorCode: result.code, updatedAt: new Date() })
      .where(and(eq(etFollowupDrafts.id, draftId), eq(etFollowupDrafts.tenantId, tenantId)));
    await db.insert(etSendAudit).values({ tenantId, userId, draftId, accountId: draft.accountId, toAddress: to, outcome: "failed", errorCode: result.code });
    return { ok: false, kind: "send_failed", code: result.code, message: SEND_FAILURES[result.code] };
  }

  const sentAt = new Date();
  await db
    .update(etFollowupDrafts)
    .set({ status: "sent", sentAt, updatedAt: sentAt })
    .where(and(eq(etFollowupDrafts.id, draftId), eq(etFollowupDrafts.tenantId, tenantId)));
  await db.insert(etSendAudit).values({ tenantId, userId, draftId, accountId: draft.accountId, toAddress: to, sentMessageId: result.messageId, outcome: "sent" });
  const restUntil = new Date(sentAt.getTime() + AFTER_SEND_DAYS * DAY_MS);
  await snoozeLead(db, tenantId, draft.leadId, restUntil, sentAt);
  await createReminder(db, tenantId, email.id, restUntil, `Check whether ${found.contactName ?? to} answered your follow-up.`);
  return { ok: true, sentAt };
}
