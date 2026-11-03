import { EMPTY_PLAN } from "./plan-pure";
import type { QueryPlan } from "./schema";

export type ChatPreset = { id: string; label: string; question: string; plan: QueryPlan };

/**
 * The questions people ask most. Each one is a fixed plan, so it needs no planner call: it is
 * cheaper, quicker, and gives the same answer every time for the same mail.
 */
export const CHAT_PRESETS: ChatPreset[] = [
  {
    id: "needs-action",
    label: "What needs my action today?",
    question: "What needs my action today?",
    // Mail the AI says is waiting for a reply and not yet handled, most urgent first.
    plan: { ...EMPTY_PLAN, needsReply: true, handled: "no", order: "priority", limit: 15 },
  },
  {
    id: "follow-up",
    label: "Who should I follow up with?",
    question: "Who should I follow up with?",
    plan: { ...EMPTY_PLAN, followUpsDue: true, limit: 15 },
  },
  {
    id: "leads",
    label: "Which leads replied?",
    question: "Which leads replied this week?",
    plan: { ...EMPTY_PLAN, categories: ["lead_reply"], period: "last_7_days", limit: 15 },
  },
  {
    id: "hot-leads",
    label: "Show my hot leads",
    question: "Show my hot leads from the last 30 days.",
    // Mail the AI scored as clear buying interest. Drafting and sending happen on the Leads page.
    plan: { ...EMPTY_PLAN, hotLeadsOnly: true, period: "last_30_days", limit: 15 },
  },
  {
    id: "today",
    label: "What came in today?",
    question: "What came in today?",
    plan: { ...EMPTY_PLAN, period: "today", order: "priority", limit: 25 },
  },
];

/** The preset behind a chip, or undefined. Only ids from the list above are accepted. */
export function findPreset(id: string): ChatPreset | undefined {
  return CHAT_PRESETS.find((preset) => preset.id === id);
}
