import type { Database } from "@/core/db";
import { type CallModelFn, callModel } from "@/core/llm/gateway";
import { addChatMessage, recentTurns } from "../../queries/chat-history";
import { retrieveForChat } from "../../queries/chat";
import { listAccountOptions } from "../../queries/dashboard";
import { getTodayWindow } from "../../scan/scan-state";
import { answerFromMail } from "./answer";
import { FALLBACK_PLAN, planQuery } from "./planner";
import { findPreset } from "./presets";
import { CHAT_LIMITS, describeBlock, getChatQuota } from "./rate-limit";
import type { QueryPlan } from "./schema";

export type AskInput = {
  tenantId: string;
  userId: string;
  /** Free text. Ignored when a preset is chosen. */
  question?: string;
  /** One of the preset chips. */
  presetId?: string;
};

export type AskOutcome =
  | { ok: true; answer: string; citedEmailIds: string[]; notes: string[]; usedPlanner: boolean }
  | { ok: false; kind: "invalid" | "rate_limited" | "paused" | "failed"; message: string };

const PAUSED_REASONS = new Set(["not_configured", "quota_exhausted", "auth_failed"]);
const PAUSED_MESSAGE = "The AI service is paused right now (no credits or a rejected key), so the chat cannot answer. It will work again once that is fixed.";
const FAILED_MESSAGE = "The AI could not answer that just now. Please try again in a moment.";
const FALLBACK_NOTE = "I could not work out exact filters for your question, so I looked at today's mail instead.";

/**
 * Answers one chat question end to end. In order: check the question and the rate limit (before any
 * AI call), choose a preset plan or ask the planner for one (the planner never sees mail), run the
 * tenant-scoped SQL for at most 25 rows, ask the model to answer from those rows only, then save the
 * exchange. The model has no tools: nothing here can send, change or delete mail.
 */
export async function askChat(
  db: Database,
  input: AskInput,
  deps: { callModel: CallModelFn; now?: () => Date } = { callModel },
): Promise<AskOutcome> {
  const now = deps.now?.() ?? new Date();
  const preset = input.presetId ? findPreset(input.presetId) : undefined;
  if (input.presetId && !preset) return { ok: false, kind: "invalid", message: "That question is not available." };

  const question = (preset?.question ?? input.question ?? "").replace(/\s+/g, " ").trim();
  if (!question) return { ok: false, kind: "invalid", message: "Type a question first." };
  if (question.length > CHAT_LIMITS.maxQuestionChars) {
    return { ok: false, kind: "invalid", message: `Please keep the question under ${CHAT_LIMITS.maxQuestionChars} characters.` };
  }

  // The limit is checked before anything costs money.
  const quota = await getChatQuota(db, input.tenantId, now);
  if (!quota.allowed) return { ok: false, kind: "rate_limited", message: describeBlock(quota) };

  const { timeZone } = await getTodayWindow(db, input.tenantId, now);
  const turns = await recentTurns(db, input.tenantId, input.userId, 4);
  const record = (status: "ok" | "error" | "paused") => addChatMessage(db, { tenantId: input.tenantId, userId: input.userId, role: "user", content: question, status });

  // 1) The plan: fixed for a preset, from the planner for free text.
  let plan: QueryPlan;
  let usedPlanner = false;
  const extraNotes: string[] = [];
  if (preset) {
    plan = preset.plan;
  } else {
    usedPlanner = true;
    const accounts = (await listAccountOptions(db, input.tenantId)).map((account) => account.identity);
    const planned = await planQuery({ tenantId: input.tenantId, question, turns, accounts, timeZone, now }, { callModel: deps.callModel });
    if (planned.ok) {
      plan = planned.plan;
    } else if (PAUSED_REASONS.has(planned.reason)) {
      await record("paused");
      return { ok: false, kind: "paused", message: PAUSED_MESSAGE };
    } else {
      plan = FALLBACK_PLAN;
      extraNotes.push(FALLBACK_NOTE);
    }
  }

  // 2) The rows: tenant-scoped, capped at 25, no bodies.
  const retrieval = await retrieveForChat(db, input.tenantId, plan, now);

  // 3) The answer, from those rows only.
  const answered = await answerFromMail({ tenantId: input.tenantId, question, turns, retrieval, timeZone, now, extraNotes }, { callModel: deps.callModel });
  if (!answered.ok) {
    if (PAUSED_REASONS.has(answered.reason)) {
      await record("paused");
      return { ok: false, kind: "paused", message: PAUSED_MESSAGE };
    }
    await record("error");
    await addChatMessage(db, { tenantId: input.tenantId, userId: input.userId, role: "assistant", content: FAILED_MESSAGE, status: "error" });
    return { ok: false, kind: "failed", message: FAILED_MESSAGE };
  }

  // 4) Save the exchange.
  await record("ok");
  await addChatMessage(db, { tenantId: input.tenantId, userId: input.userId, role: "assistant", content: answered.answer, citedEmailIds: answered.citedEmailIds });
  return { ok: true, answer: answered.answer, citedEmailIds: answered.citedEmailIds, notes: [...retrieval.notes, ...extraNotes], usedPlanner };
}
