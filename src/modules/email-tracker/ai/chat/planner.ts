import { type CallModelFn, type ModelFailureReason, callModel } from "@/core/llm/gateway";
import { EMPTY_PLAN, normalizePlan } from "./plan-pure";
import { type ChatTurn, PLANNER_SYSTEM_PROMPT, buildPlannerPrompt } from "./prompts";
import { type QueryPlan, queryPlanJsonSchema, queryPlanSchema } from "./schema";

export const PLAN_USAGE_TAG = "chat-plan";

export type PlanResult = { ok: true; plan: QueryPlan } | { ok: false; reason: ModelFailureReason; message: string };

/**
 * Asks the model to turn a question into a search plan. The model sees the question, a few earlier
 * turns and the workspace's own mailbox addresses, and never any mail. Its reply is validated against
 * a closed list and tidied, so a plan it got partly wrong still cannot ask for more than the chat may send.
 */
export async function planQuery(
  input: { tenantId: string; question: string; turns: ChatTurn[]; accounts: string[]; timeZone: string; now: Date },
  deps: { callModel: CallModelFn } = { callModel },
): Promise<PlanResult> {
  const result = await deps.callModel({
    tenantId: input.tenantId,
    usageTag: PLAN_USAGE_TAG,
    system: PLANNER_SYSTEM_PROMPT,
    prompt: buildPlannerPrompt(input),
    schema: queryPlanSchema,
    responseJsonSchema: queryPlanJsonSchema,
  });
  if (!result.ok) return result;
  return { ok: true, plan: normalizePlan(result.data) };
}

/** Used when the plan could not be worked out: look at today's mail rather than guess or fail. */
export const FALLBACK_PLAN: QueryPlan = { ...EMPTY_PLAN, period: "today", limit: 15 };
