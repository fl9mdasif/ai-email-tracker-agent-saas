"use server";

import { getDb } from "@/core/db";
import { requireModule } from "@/core/modules/guard";
import { askChat } from "@/modules/email-tracker/ai/chat/service";
import { getChatQuota } from "@/modules/email-tracker/ai/chat/rate-limit";
import { getEmailBriefs, type EmailBrief } from "@/modules/email-tracker/queries/chat";
import { clearChat } from "@/modules/email-tracker/queries/chat-history";

const MODULE_KEY = "email-tracker";

export type AskResult =
  | { ok: true; answer: string; cited: EmailBrief[]; notes: string[]; leftThisHour: number }
  | { ok: false; kind: "invalid" | "rate_limited" | "paused" | "failed"; message: string; leftThisHour: number };

/**
 * Asks the chat one question. The workspace and the person come from the session, never from the
 * request, so nobody can ask on behalf of another workspace. Input is either free text or the id of
 * one of the preset chips; the service checks both.
 */
export async function askChatAction(input: { question?: string; presetId?: string }): Promise<AskResult> {
  const session = await requireModule(MODULE_KEY);
  const db = getDb();
  const question = typeof input.question === "string" ? input.question : undefined;
  const presetId = typeof input.presetId === "string" ? input.presetId : undefined;

  const outcome = await askChat(db, { tenantId: session.tenantId, userId: session.userId, question, presetId });
  const quota = await getChatQuota(db, session.tenantId);

  if (!outcome.ok) return { ok: false, kind: outcome.kind, message: outcome.message, leftThisHour: quota.leftThisHour };
  const briefs = await getEmailBriefs(db, session.tenantId, outcome.citedEmailIds);
  return {
    ok: true,
    answer: outcome.answer,
    cited: outcome.citedEmailIds.flatMap((id) => (briefs.has(id) ? [briefs.get(id)!] : [])),
    notes: outcome.notes,
    leftThisHour: quota.leftThisHour,
  };
}

/** Deletes this person's whole conversation. Only their own messages go. */
export async function clearChatAction(): Promise<{ ok: boolean }> {
  const session = await requireModule(MODULE_KEY);
  await clearChat(getDb(), session.tenantId, session.userId);
  return { ok: true };
}
