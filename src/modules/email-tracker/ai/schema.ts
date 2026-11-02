import { z } from "zod";

export const EMAIL_CATEGORIES = [
  "needs_reply",
  "follow_up_needed",
  "lead_reply",
  "invoice_or_payment",
  "newsletter_or_promo",
  "fyi_only",
  "spam",
] as const;

export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];

export const MAX_SUMMARY_CHARS = 300;

/** The strict check applied to every model reply. Anything else is rejected and retried. */
export const emailAnalysisSchema = z.object({
  category: z.enum(EMAIL_CATEGORIES),
  /** 1 = needs attention today, 2 = handle soon, 3 = can wait or no action. */
  priority: z.number().int().min(1).max(3),
  needs_reply: z.boolean(),
  summary: z.string().trim().min(1).max(MAX_SUMMARY_CHARS),
  suggested_action: z.string().trim().min(1).max(MAX_SUMMARY_CHARS),
});

export type EmailAnalysis = z.infer<typeof emailAnalysisSchema>;

/** The same shape as a JSON Schema, sent to the model. */
export const emailAnalysisJsonSchema = {
  name: "email_analysis",
  schema: {
    type: "object",
    properties: {
      category: { type: "string", enum: [...EMAIL_CATEGORIES] },
      priority: { type: "integer", enum: [1, 2, 3] },
      needs_reply: { type: "boolean" },
      summary: { type: "string" },
      suggested_action: { type: "string" },
    },
    required: ["category", "priority", "needs_reply", "summary", "suggested_action"],
    additionalProperties: false,
  },
} as const;

/** Keeps the fields consistent even when the model contradicts itself. */
export function normalizeAnalysis(analysis: EmailAnalysis): EmailAnalysis {
  const neverNeedsReply = analysis.category === "spam" || analysis.category === "newsletter_or_promo";
  const alwaysNeedsReply = analysis.category === "needs_reply";
  return {
    ...analysis,
    needs_reply: neverNeedsReply ? false : alwaysNeedsReply ? true : analysis.needs_reply,
    // Spam and promotions are never urgent.
    priority: neverNeedsReply ? 3 : analysis.priority,
  };
}
