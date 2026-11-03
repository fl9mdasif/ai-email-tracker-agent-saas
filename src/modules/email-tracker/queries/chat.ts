import { type SQL, and, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { Database } from "@/core/db";
import { connectedAccounts } from "@/core/db/schema";
import { MAX_CHAT_ROWS, type QueryPlan } from "../ai/chat/schema";
import { normalizePlan, resolvePeriod } from "../ai/chat/plan-pure";
import { etEmailAnalysis, etEmailState, etEmails } from "../db/schema";
import { getTodayWindow } from "../scan/scan-state";
import { likePattern } from "./dashboard-pure";
import { listFollowUps, selectMail } from "./dashboard";

/**
 * One email as the chat sees it. Deliberately small: who, what, when, which mailbox, what the AI made
 * of it, and whether it is handled. There is **no body text**; the 200-character snippet is included
 * only for mail the AI has not looked at, so the answer still has something to go on.
 */
export type ChatMailRow = {
  id: string;
  from: string;
  subject: string;
  receivedAt: Date;
  account: string;
  category: string | null;
  priority: number | null;
  summary: string | null;
  suggestedAction: string | null;
  /** Only when there is no AI result. */
  snippet: string | null;
  handled: boolean;
  /** For the follow-up question: why it is on the list. */
  followUpReason: string | null;
};

export type ChatRetrieval = {
  rows: ChatMailRow[];
  /** How many emails match in all, which can be more than the rows shown. */
  total: number;
  /** Matches counted by category and by priority, so counting questions never rely on the shortened list. "unscanned" means the AI has not looked at them. */
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
  /** What the filters meant in plain words, shown to the answer call. */
  description: string;
  /** Things the answer should mention, e.g. an address filter that matched no account and was ignored. */
  notes: string[];
};

const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function toChatRow(mail: Awaited<ReturnType<typeof selectMail>>[number], followUpReason: string | null = null): ChatMailRow {
  return {
    id: mail.id,
    from: cut(mail.fromName ? `${mail.fromName} <${mail.fromAddress}>` : mail.fromAddress, 120),
    subject: cut(mail.subject || "(no subject)", 200),
    receivedAt: mail.receivedAt,
    account: mail.account.identity,
    category: mail.analysis?.category ?? null,
    priority: mail.analysis?.priority ?? null,
    summary: mail.analysis ? cut(mail.analysis.summary, 300) : null,
    suggestedAction: mail.analysis ? cut(mail.analysis.suggestedAction, 300) : null,
    snippet: mail.analysis ? null : cut(mail.snippet, 200),
    handled: mail.handled,
    followUpReason: followUpReason ? cut(followUpReason, 200) : null,
  };
}

/** Plain-words description of a plan, for the answer call and the notes under an answer. */
export function describePlan(plan: QueryPlan, periodLabel: string): string {
  const parts: string[] = ["inbound mail"];
  if (plan.followUpsDue) return "mail with a follow-up that is due or overdue";
  if (plan.categories.length > 0) parts.push(`categorised as ${plan.categories.join(" or ")}`);
  if (plan.priority) parts.push(`priority ${plan.priority}`);
  if (plan.needsReply !== null) parts.push(plan.needsReply ? "waiting for a reply" : "not waiting for a reply");
  if (plan.handled !== "any") parts.push(plan.handled === "no" ? "not yet marked handled" : "marked handled");
  if (plan.unreadOnly) parts.push("unread");
  if (plan.senderContains) parts.push(`from a sender matching "${plan.senderContains}"`);
  if (plan.subjectContains) parts.push(`with a subject matching "${plan.subjectContains}"`);
  if (plan.accountEmail) parts.push(`in the mailbox ${plan.accountEmail}`);
  parts.push(`received ${periodLabel}`);
  return parts.join(", ");
}

/**
 * Runs a query plan against one workspace's mail. Every table in it is scoped to the tenant, the number
 * of rows is capped (at most 25, whatever the plan says), and no email body is ever read into the result.
 * Totals and counts are exact, so "how many" questions can be answered from the numbers.
 */
export async function retrieveForChat(db: Database, tenantId: string, rawPlan: QueryPlan, now: Date = new Date()): Promise<ChatRetrieval> {
  const plan = normalizePlan(rawPlan);
  const notes: string[] = [];
  const { timeZone } = await getTodayWindow(db, tenantId, now);

  // The follow-up question is its own list: mail that has an open follow-up due now or earlier.
  if (plan.followUpsDue) {
    const groups = await listFollowUps(db, tenantId, now);
    const due = [...groups.overdue, ...groups.today.filter((item) => item.dueAt.getTime() <= now.getTime())];
    const rows = due.slice(0, plan.limit).map((item) => toChatRow(item.mail, item.reason || (item.source === "ai" ? "the AI suggests a follow-up" : "your reminder")));
    const byCategory: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    for (const item of due) {
      byCategory[item.mail.analysis?.category ?? "unscanned"] = (byCategory[item.mail.analysis?.category ?? "unscanned"] ?? 0) + 1;
      byPriority[String(item.mail.analysis?.priority ?? "unscanned")] = (byPriority[String(item.mail.analysis?.priority ?? "unscanned")] ?? 0) + 1;
    }
    return { rows, total: due.length, byCategory, byPriority, description: describePlan(plan, "any time"), notes };
  }

  // An address the model made up must not silently return nothing: only the workspace's own addresses count.
  let accountFilter: string | null = null;
  if (plan.accountEmail) {
    const own = await db.select({ identity: connectedAccounts.identity }).from(connectedAccounts).where(eq(connectedAccounts.tenantId, tenantId));
    const match = own.find((row) => row.identity.toLowerCase() === plan.accountEmail);
    if (match) accountFilter = match.identity;
    else notes.push(`There is no connected mailbox called ${plan.accountEmail}, so that filter was ignored.`);
  }

  const period = resolvePeriod(plan.period, timeZone, now);
  const sender = plan.senderContains ? likePattern(plan.senderContains) : null;
  const subject = plan.subjectContains ? likePattern(plan.subjectContains) : null;

  const conditions: Array<SQL | undefined> = [
    eq(etEmails.direction, "inbound"),
    plan.categories.length > 0 ? inArray(etEmailAnalysis.category, plan.categories) : undefined,
    plan.priority ? eq(etEmailAnalysis.priority, plan.priority) : undefined,
    plan.needsReply === true ? and(eq(etEmailAnalysis.status, "analyzed"), eq(etEmailAnalysis.needsReply, true)) : plan.needsReply === false ? eq(etEmailAnalysis.needsReply, false) : undefined,
    plan.handled === "no" ? isNull(etEmailState.emailId) : plan.handled === "yes" ? isNotNull(etEmailState.emailId) : undefined,
    plan.unreadOnly ? eq(etEmails.status, "unread") : undefined,
    sender ? or(ilike(etEmails.fromAddress, sender), ilike(etEmails.fromName, sender)) : undefined,
    subject ? ilike(etEmails.subject, subject) : undefined,
    accountFilter ? eq(connectedAccounts.identity, accountFilter) : undefined,
    period.from ? gte(etEmails.receivedAt, period.from) : undefined,
    period.to ? lt(etEmails.receivedAt, period.to) : undefined,
  ];
  const where = and(...conditions);

  const order =
    plan.order === "priority"
      ? [sql`${etEmailAnalysis.priority} asc nulls last`, desc(etEmails.receivedAt), desc(etEmails.id)]
      : [desc(etEmails.receivedAt), desc(etEmails.id)];

  const [mail, counts] = await Promise.all([
    selectMail(db, tenantId, where, order, Math.min(plan.limit, MAX_CHAT_ROWS)),
    db
      .select({ category: etEmailAnalysis.category, priority: etEmailAnalysis.priority, n: sql<number>`count(*)::int` })
      .from(etEmails)
      .innerJoin(connectedAccounts, and(eq(connectedAccounts.id, etEmails.accountId), eq(connectedAccounts.tenantId, tenantId)))
      .leftJoin(etEmailAnalysis, and(eq(etEmailAnalysis.emailId, etEmails.id), eq(etEmailAnalysis.tenantId, tenantId)))
      .leftJoin(etEmailState, and(eq(etEmailState.emailId, etEmails.id), eq(etEmailState.tenantId, tenantId)))
      .where(and(eq(etEmails.tenantId, tenantId), where))
      .groupBy(etEmailAnalysis.category, etEmailAnalysis.priority),
  ]);

  const byCategory: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  let total = 0;
  for (const row of counts) {
    total += row.n;
    byCategory[row.category ?? "unscanned"] = (byCategory[row.category ?? "unscanned"] ?? 0) + row.n;
    byPriority[String(row.priority ?? "unscanned")] = (byPriority[String(row.priority ?? "unscanned")] ?? 0) + row.n;
  }

  return { rows: mail.map((row) => toChatRow(row)), total, byCategory, byPriority, description: describePlan(plan, period.label), notes };
}


/** A short label for an email the chat cited, so the page can show it as a link. No body, no AI text. */
export type EmailBrief = { id: string; from: string; subject: string };

/** Sender and subject for some of this workspace's emails. Ids that are not the tenant's are simply missing from the result. */
export async function getEmailBriefs(db: Database, tenantId: string, emailIds: string[]): Promise<Map<string, EmailBrief>> {
  const valid = [...new Set(emailIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 100);
  if (valid.length === 0) return new Map();
  const rows = await db
    .select({ id: etEmails.id, fromAddress: etEmails.fromAddress, fromName: etEmails.fromName, subject: etEmails.subject })
    .from(etEmails)
    .where(and(eq(etEmails.tenantId, tenantId), inArray(etEmails.id, valid)));
  return new Map(rows.map((row) => [row.id, { id: row.id, from: cut(row.fromName ?? row.fromAddress, 80), subject: cut(row.subject || "(no subject)", 120) }]));
}
