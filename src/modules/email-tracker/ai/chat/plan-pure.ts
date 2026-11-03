import { startOfTodayIn } from "@/core/lib/time";
import { type ChatPeriod, MAX_CHAT_ROWS, MAX_TEXT_FILTER_CHARS, type QueryPlan } from "./schema";

const DAY_MS = 24 * 60 * 60 * 1000;

/** "No filter" plan: all mail, newest first. The safe starting point for every other plan. */
export const EMPTY_PLAN: QueryPlan = {
  categories: [],
  priority: null,
  needsReply: null,
  handled: "any",
  period: "all",
  senderContains: null,
  subjectContains: null,
  accountEmail: null,
  unreadOnly: false,
  hotLeadsOnly: false,
  followUpsDue: false,
  order: "newest",
  limit: 15,
};

const clean = (value: string | null): string | null => {
  const text = value?.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_FILTER_CHARS);
  return text ? text : null;
};

/**
 * Tidies a plan after the model returned it: removes repeated categories, blank or over-long text,
 * a hand-typed address in the wrong case, and keeps the row limit inside the fixed cap. A plan the
 * model got partly wrong therefore still cannot ask for more than the chat is allowed to send.
 */
export function normalizePlan(plan: QueryPlan): QueryPlan {
  return {
    ...plan,
    categories: [...new Set(plan.categories)],
    senderContains: clean(plan.senderContains),
    subjectContains: clean(plan.subjectContains),
    accountEmail: plan.accountEmail?.trim().toLowerCase() || null,
    limit: Math.min(MAX_CHAT_ROWS, Math.max(1, Math.trunc(plan.limit))),
  };
}

export type PeriodRange = { from: Date | null; to: Date | null; label: string };

/** The start of the local day `daysAgo` days before today, in the tenant's time zone. */
function startOfDaysAgo(timeZone: string, now: Date, daysAgo: number): Date {
  const todayStart = startOfTodayIn(timeZone, now).getTime();
  // Aim for the middle of that day so a daylight-saving change cannot land on the wrong date.
  return startOfTodayIn(timeZone, new Date(todayStart - daysAgo * DAY_MS + DAY_MS / 2));
}

/** Turns a period name into a time range in the tenant's own time zone. `to` is exclusive; null means no bound. */
export function resolvePeriod(period: ChatPeriod, timeZone: string, now: Date): PeriodRange {
  switch (period) {
    case "today":
      return { from: startOfDaysAgo(timeZone, now, 0), to: null, label: "today" };
    case "yesterday":
      return { from: startOfDaysAgo(timeZone, now, 1), to: startOfDaysAgo(timeZone, now, 0), label: "yesterday" };
    case "last_7_days":
      return { from: startOfDaysAgo(timeZone, now, 6), to: null, label: "the last 7 days" };
    case "last_30_days":
      return { from: startOfDaysAgo(timeZone, now, 29), to: null, label: "the last 30 days" };
    default:
      return { from: null, to: null, label: "all time" };
  }
}
