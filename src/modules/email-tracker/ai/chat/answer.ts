import { type CallModelFn, type ModelFailureReason, callModel } from "@/core/llm/gateway";
import type { ChatRetrieval } from "../../queries/chat";
import { ANSWER_SYSTEM_PROMPT, type ChatTurn, buildAnswerPrompt } from "./prompts";
import { chatAnswerJsonSchema, chatAnswerSchema } from "./schema";

export const ANSWER_USAGE_TAG = "chat-answer";

export type AnswerResult =
  | { ok: true; answer: string; citedEmailIds: string[] }
  | { ok: false; reason: ModelFailureReason; message: string };

/**
 * Keeps only ids the answer could legitimately cite: ones that were in the rows it was given, once
 * each. An id the model made up, or took from somewhere else, never becomes a link on the page.
 */
export function filterCitations(cited: string[], retrievedIds: string[]): string[] {
  const allowed = new Set(retrievedIds.map((id) => id.toLowerCase()));
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const id of cited) {
    const key = id.trim().toLowerCase();
    if (allowed.has(key) && !seen.has(key)) {
      seen.add(key);
      kept.push(retrievedIds.find((candidate) => candidate.toLowerCase() === key) ?? id);
    }
  }
  return kept;
}

/**
 * Writes the answer from the retrieved rows. The rows go to the model as untrusted data inside
 * delimiters; the reply is plain text plus ids that are checked against what was retrieved.
 */
export async function answerFromMail(
  input: { tenantId: string; question: string; turns: ChatTurn[]; retrieval: ChatRetrieval; timeZone: string; now: Date; extraNotes?: string[] },
  deps: { callModel: CallModelFn } = { callModel },
): Promise<AnswerResult> {
  const result = await deps.callModel({
    tenantId: input.tenantId,
    usageTag: ANSWER_USAGE_TAG,
    system: ANSWER_SYSTEM_PROMPT,
    prompt: buildAnswerPrompt(input),
    schema: chatAnswerSchema,
    responseJsonSchema: chatAnswerJsonSchema,
  });
  if (!result.ok) return result;
  return {
    ok: true,
    answer: result.data.answer,
    citedEmailIds: filterCitations(
      result.data.cited_email_ids,
      input.retrieval.rows.map((row) => row.id),
    ),
  };
}
