"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/core/db";
import { requireModule } from "@/core/modules/guard";
import { scoreOlderLeads } from "@/modules/email-tracker/ai/analyze-pending";
import { type Draft, prepareDraft, saveDraftEdit, skipLead } from "@/modules/email-tracker/ai/draft/service";
import { sendDraft } from "@/modules/email-tracker/send/send-draft";
import type { SendFailure } from "@/modules/email-tracker/send/types";

const MODULE_KEY = "email-tracker";

/** What the review screen needs of a draft. */
export type DraftView = { id: string; subject: string; body: string; status: Draft["status"]; errorCode: string | null };

const view = (draft: Draft): DraftView => ({ id: draft.id, subject: draft.subject, body: draft.body, status: draft.status, errorCode: draft.errorCode });

/**
 * Every action below takes the workspace and the person from the session, never from the
 * request, and the services check that each lead and draft belongs to that workspace.
 */

export async function scoreOlderLeadsAction(): Promise<{ ok: boolean; message: string }> {
  const session = await requireModule(MODULE_KEY);
  const outcome = await scoreOlderLeads(getDb(), session.tenantId);
  revalidatePath("/dashboard/leads");
  if (outcome.stoppedBecause) return { ok: false, message: "The AI service is not available right now (no credits, or the key was rejected). Nothing was used up; try again once it is fixed." };
  if (outcome.scored === 0 && outcome.failed === 0) return { ok: true, message: "Nothing to score: every lead reply from the last 30 days already has a score." };
  return { ok: true, message: `Scored ${outcome.scored} lead ${outcome.scored === 1 ? "reply" : "replies"}${outcome.failed ? `; ${outcome.failed} could not be scored this time` : ""}.` };
}

export type PrepareResult = { ok: true; draft: DraftView } | { ok: false; message: string };

/** The lead's draft: the one waiting, or a new one from the AI (always new on Regenerate). */
export async function prepareDraftAction(leadId: string, regenerate: boolean): Promise<PrepareResult> {
  const session = await requireModule(MODULE_KEY);
  const result = await prepareDraft(getDb(), { tenantId: session.tenantId, leadId: String(leadId), regenerate: regenerate === true });
  return result.ok ? { ok: true, draft: view(result.draft) } : { ok: false, message: result.message };
}

export async function saveDraftAction(draftId: string, subject: string, body: string): Promise<{ ok: boolean; message?: string }> {
  const session = await requireModule(MODULE_KEY);
  const saved = await saveDraftEdit(getDb(), session.tenantId, String(draftId), { subject: String(subject), body: String(body) });
  return saved ? { ok: true } : { ok: false, message: "The draft could not be saved. It needs a subject and some text, and it must not be sent already." };
}

export type SendActionResult =
  | { ok: true; sentAt: string }
  | { ok: false; message: string; code: SendFailure | "not_found" | "not_open" | "limit" | "invalid" };

/**
 * Sends exactly this one draft, with the text exactly as the user last saw it: the edit is saved
 * first, then the draft is sent. There is no way to send more than one email per call.
 */
export async function sendDraftAction(draftId: string, subject: string, body: string): Promise<SendActionResult> {
  const session = await requireModule(MODULE_KEY);
  const db = getDb();
  const id = String(draftId);
  if (!(await saveDraftEdit(db, session.tenantId, id, { subject: String(subject), body: String(body) }))) {
    return { ok: false, code: "invalid", message: "The draft needs a subject and some text, and it must not be sent already." };
  }
  const result = await sendDraft(db, { tenantId: session.tenantId, userId: session.userId, draftId: id });
  revalidatePath("/dashboard/leads");
  if (result.ok) return { ok: true, sentAt: result.sentAt.toISOString() };
  return { ok: false, message: result.message, code: result.kind === "send_failed" ? result.code : result.kind };
}

export async function skipLeadAction(leadId: string): Promise<{ ok: boolean }> {
  const session = await requireModule(MODULE_KEY);
  const ok = await skipLead(getDb(), session.tenantId, String(leadId));
  revalidatePath("/dashboard/leads");
  return { ok };
}
