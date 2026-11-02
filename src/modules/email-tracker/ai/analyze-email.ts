import { type CallModelFn, type ModelFailureReason, callModel } from "@/core/llm/gateway";
import { ANALYSIS_SYSTEM_PROMPT, type PromptEmail, buildAnalysisPrompt } from "./prompts";
import {
  type EmailAnalysis,
  emailAnalysisJsonSchema,
  emailAnalysisSchema,
  normalizeAnalysis,
} from "./schema";

export const ANALYSIS_USAGE_TAG = "email-analysis";

export type AnalyzeEmailResult =
  | { ok: true; analysis: EmailAnalysis; model: string }
  | { ok: false; reason: ModelFailureReason; message: string };

/**
 * Classifies and summarizes one email. It only reads the email it is given and only talks to
 * the LLM gateway; it never touches the mailbox and never sends anything.
 */
export async function analyzeEmail(
  email: PromptEmail,
  context: { tenantId: string; mailboxOwner: string },
  deps: { callModel: CallModelFn } = { callModel },
): Promise<AnalyzeEmailResult> {
  const result = await deps.callModel({
    tenantId: context.tenantId,
    usageTag: ANALYSIS_USAGE_TAG,
    system: ANALYSIS_SYSTEM_PROMPT,
    prompt: buildAnalysisPrompt(email, context.mailboxOwner),
    schema: emailAnalysisSchema,
    responseJsonSchema: emailAnalysisJsonSchema,
  });
  if (!result.ok) return { ok: false, reason: result.reason, message: result.message };
  return { ok: true, analysis: normalizeAnalysis(result.data), model: result.model };
}
