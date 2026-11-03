import { z } from "zod";
import { EMAIL_CATEGORIES } from "../schema";

export const CHAT_PERIODS = ["today", "yesterday", "last_7_days", "last_30_days", "all"] as const;
export type ChatPeriod = (typeof CHAT_PERIODS)[number];

/** The most mail a single answer is built from. Fixed: the chat never sends more of the mailbox than this. */
export const MAX_CHAT_ROWS = 25;
export const MAX_TEXT_FILTER_CHARS = 60;

/**
 * What the planner may ask the database for. Everything is from a closed list or a short, literal
 * text match: the AI never writes SQL, and nothing it returns is run as anything but one of these
 * filters. Every field is required (nullable where "no filter" is allowed) so the model must decide.
 */
export const queryPlanSchema = z.object({
  /** Empty means any category. */
  categories: z.array(z.enum(EMAIL_CATEGORIES)).max(EMAIL_CATEGORIES.length),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  needsReply: z.boolean().nullable(),
  handled: z.enum(["no", "yes", "any"]),
  period: z.enum(CHAT_PERIODS),
  senderContains: z.string().max(MAX_TEXT_FILTER_CHARS).nullable(),
  subjectContains: z.string().max(MAX_TEXT_FILTER_CHARS).nullable(),
  /** One of the workspace's own connected addresses. */
  accountEmail: z.string().max(254).nullable(),
  unreadOnly: z.boolean(),
  /** Only mail the AI scored as a hot lead (clear buying interest). */
  hotLeadsOnly: z.boolean(),
  /** Ask for the mail that has an open follow-up due, instead of filtering by the fields above. */
  followUpsDue: z.boolean(),
  order: z.enum(["newest", "priority"]),
  limit: z.number().int().min(1).max(MAX_CHAT_ROWS),
});

export type QueryPlan = z.infer<typeof queryPlanSchema>;

/** The same shape as a JSON Schema, sent to the model. */
export const queryPlanJsonSchema = {
  name: "mail_query_plan",
  schema: {
    type: "object",
    properties: {
      categories: { type: "array", items: { type: "string", enum: [...EMAIL_CATEGORIES] } },
      priority: { type: ["integer", "null"], enum: [1, 2, 3, null] },
      needsReply: { type: ["boolean", "null"] },
      handled: { type: "string", enum: ["no", "yes", "any"] },
      period: { type: "string", enum: [...CHAT_PERIODS] },
      senderContains: { type: ["string", "null"] },
      subjectContains: { type: ["string", "null"] },
      accountEmail: { type: ["string", "null"] },
      unreadOnly: { type: "boolean" },
      hotLeadsOnly: { type: "boolean" },
      followUpsDue: { type: "boolean" },
      order: { type: "string", enum: ["newest", "priority"] },
      limit: { type: "integer", minimum: 1, maximum: MAX_CHAT_ROWS },
    },
    required: [
      "categories",
      "priority",
      "needsReply",
      "handled",
      "period",
      "senderContains",
      "subjectContains",
      "accountEmail",
      "unreadOnly",
      "hotLeadsOnly",
      "followUpsDue",
      "order",
      "limit",
    ],
    additionalProperties: false,
  },
} as const;

export const MAX_ANSWER_CHARS = 2000;

/** What the answer call returns: the reply and the emails it is based on. */
export const chatAnswerSchema = z.object({
  answer: z.string().trim().min(1).max(MAX_ANSWER_CHARS),
  cited_email_ids: z.array(z.string()).max(MAX_CHAT_ROWS),
});

export type ChatAnswer = z.infer<typeof chatAnswerSchema>;

export const chatAnswerJsonSchema = {
  name: "chat_answer",
  schema: {
    type: "object",
    properties: {
      answer: { type: "string" },
      cited_email_ids: { type: "array", items: { type: "string" } },
    },
    required: ["answer", "cited_email_ids"],
    additionalProperties: false,
  },
} as const;
