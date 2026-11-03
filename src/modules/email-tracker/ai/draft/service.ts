import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Database } from "@/core/db";
import { connectedAccounts, llmUsage } from "@/core/db/schema";
import { type CallModelFn, type ModelFailureReason, callModel } from "@/core/llm/gateway";
import { etEmails, etFollowupDrafts } from "../../db/schema";
import { getLead, snoozeLead } from "../../queries/leads";
import {
  DRAFT_SYSTEM_PROMPT,
  MAX_DRAFT_CHARS,
  MAX_THREAD_MESSAGES,
  buildDraftPrompt,
  draftReplyJsonSchema,
  draftReplySchema,
  replySubject,
} from "./prompts";

export const DRAFT_USAGE_TAG = "followup-draft";
/** AI drafts a workspace may have written in a rolling 24 hours (Regenerate counts too). */
export const DRAFTS_PER_DAY = 30;
/** How long Skip hides a lead. */
export const SKIP_SNOOZE_DAYS = 7;
const MAX_SUBJECT_CHARS = 250;
const UUID = /^[0-9a-f-]{36}$/i;
const DAY_MS = 86_400_000;
/** Statuses of a draft the user can still edit, regenerate or send. */
const OPEN_STATUSES = ["draft", "failed"] as const;

export type Draft = typeof etFollowupDrafts.$inferSelect;

export type PrepareDraftResult =
  | { ok: true; draft: Draft; generated: boolean }
  | { ok: false; kind: "not_found" | "no_email" | "limit" | "paused" | "failed"; message: string };

const PAUSING = new Set<ModelFailureReason>(["not_configured", "quota_exhausted", "auth_failed"]);

/** The lead's draft that is still waiting for the user (unsent, not skipped), if any. */
export async function getOpenDraft(db: Database, tenantId: string, leadId: string): Promise<Draft | null> {
  if (!UUID.test(leadId)) return null;
  const [draft] = await db
    .select()
    .from(etFollowupDrafts)
    .where(and(eq(etFollowupDrafts.tenantId, tenantId), eq(etFollowupDrafts.leadId, leadId), inArray(etFollowupDrafts.status, [...OPEN_STATUSES])))
    .orderBy(desc(etFollowupDrafts.updatedAt))
    .limit(1);
  return draft ?? null;
}

/** AI drafts written for this workspace in the last 24 hours. */
export async function draftsWrittenToday(db: Database, tenantId: string, now = new Date()): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(llmUsage)
    .where(and(eq(llmUsage.tenantId, tenantId), eq(llmUsage.usageTag, DRAFT_USAGE_TAG), eq(llmUsage.status, "ok"), gte(llmUsage.createdAt, new Date(now.getTime() - DAY_MS))));
  return row?.count ?? 0;
}

/**
 * Gives the lead's open draft, writing one with the AI only when there is none (or when the user
 * pressed Regenerate). The model sees the lead, the score's reason and the last few emails of the
 * thread, all from this workspace, with the mail text as untrusted data. Nothing is sent here.
 */
export async function prepareDraft(
  db: Database,
  input: { tenantId: string; leadId: string; regenerate?: boolean },
  deps: { callModel: CallModelFn; now?: Date } = { callModel },
): Promise<PrepareDraftResult> {
  const { tenantId, leadId } = input;
  const lead = await getLead(db, tenantId, leadId);
  if (!lead) return { ok: false, kind: "not_found", message: "This lead was not found." };

  const existing = await getOpenDraft(db, tenantId, leadId);
  if (existing && !input.regenerate) return { ok: true, draft: existing, generated: false };

  const email = lead.email;
  if (!email) return { ok: false, kind: "no_email", message: "The email from this lead is no longer here, so there is nothing to reply to." };

  const now = deps.now ?? new Date();
  if ((await draftsWrittenToday(db, tenantId, now)) >= DRAFTS_PER_DAY) {
    return { ok: false, kind: "limit", message: `The AI has written ${DRAFTS_PER_DAY} drafts in the last 24 hours, the most for one day. You can still edit and send the drafts you have.` };
  }

  const [threadRows, [mailbox]] = await Promise.all([
    db
      .select({
        direction: etEmails.direction,
        fromAddress: etEmails.fromAddress,
        fromName: etEmails.fromName,
        subject: etEmails.subject,
        bodyText: etEmails.bodyText,
        receivedAt: etEmails.receivedAt,
      })
      .from(etEmails)
      .where(and(eq(etEmails.tenantId, tenantId), eq(etEmails.threadId, email.threadId)))
      .orderBy(desc(etEmails.receivedAt))
      .limit(MAX_THREAD_MESSAGES),
    db
      .select({ identity: connectedAccounts.identity })
      .from(connectedAccounts)
      .where(and(eq(connectedAccounts.id, email.accountId), eq(connectedAccounts.tenantId, tenantId)))
      .limit(1),
  ]);
  // The thread query always finds the lead's own email; this keeps it in even if the thread id changed.
  const thread = threadRows.length > 0 ? threadRows.toReversed() : [{ ...email, direction: "inbound" as const }];

  const result = await deps.callModel({
    tenantId,
    usageTag: DRAFT_USAGE_TAG,
    system: DRAFT_SYSTEM_PROMPT,
    prompt: buildDraftPrompt({
      mailboxOwner: mailbox?.identity ?? "",
      lead: { name: lead.contactName, email: lead.contactEmail, temperature: lead.temperature, reason: lead.reason },
      thread,
    }),
    schema: draftReplySchema,
    responseJsonSchema: draftReplyJsonSchema,
  });
  if (!result.ok) {
    return PAUSING.has(result.reason)
      ? { ok: false, kind: "paused", message: "The AI service is not available right now (no credits, or the key was rejected). Try again once it is fixed." }
      : { ok: false, kind: "failed", message: "The AI could not write a draft this time. Try Regenerate." };
  }

  const values = {
    subject: replySubject(email.subject).slice(0, MAX_SUBJECT_CHARS),
    body: result.data.body,
    status: "draft" as const,
    model: result.model,
    errorCode: null,
    updatedAt: now,
  };
  if (existing) {
    const [draft] = await db
      .update(etFollowupDrafts)
      .set(values)
      .where(and(eq(etFollowupDrafts.id, existing.id), eq(etFollowupDrafts.tenantId, tenantId), inArray(etFollowupDrafts.status, [...OPEN_STATUSES])))
      .returning();
    if (draft) return { ok: true, draft, generated: true };
    // It was sent or skipped in the meantime: start a new one instead of touching it.
  }
  const [draft] = await db
    .insert(etFollowupDrafts)
    .values({ tenantId, leadId, replyToEmailId: email.id, accountId: email.accountId, createdAt: now, ...values })
    .returning();
  return { ok: true, draft, generated: true };
}

/** Saves the user's own edit of an open draft. False when it is not this workspace's or no longer open. */
export async function saveDraftEdit(
  db: Database,
  tenantId: string,
  draftId: string,
  edit: { subject: string; body: string },
): Promise<boolean> {
  const subject = edit.subject.trim().slice(0, MAX_SUBJECT_CHARS);
  const body = edit.body.trim();
  if (!UUID.test(draftId) || !subject || !body || body.length > MAX_DRAFT_CHARS) return false;
  const updated = await db
    .update(etFollowupDrafts)
    .set({ subject, body, updatedAt: new Date() })
    .where(and(eq(etFollowupDrafts.id, draftId), eq(etFollowupDrafts.tenantId, tenantId), inArray(etFollowupDrafts.status, [...OPEN_STATUSES])))
    .returning({ id: etFollowupDrafts.id });
  return updated.length > 0;
}

/** Skip: the open draft is set aside and the lead is hidden for a week. False when the lead is not this workspace's. */
export async function skipLead(db: Database, tenantId: string, leadId: string, now = new Date()): Promise<boolean> {
  if (!UUID.test(leadId)) return false;
  if (!(await snoozeLead(db, tenantId, leadId, new Date(now.getTime() + SKIP_SNOOZE_DAYS * DAY_MS)))) return false;
  await db
    .update(etFollowupDrafts)
    .set({ status: "skipped", updatedAt: now })
    .where(and(eq(etFollowupDrafts.tenantId, tenantId), eq(etFollowupDrafts.leadId, leadId), inArray(etFollowupDrafts.status, [...OPEN_STATUSES])));
  return true;
}
