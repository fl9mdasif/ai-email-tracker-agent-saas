import { type SQL, and, asc, desc, eq, ilike, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import type { Database } from "@/core/db";
import { connectedAccounts } from "@/core/db/schema";
import { etEmailAnalysis, etEmailState, etEmails, etFollowups } from "../db/schema";
import { getTodayWindow } from "../scan/scan-state";
import type { EmailCategory } from "../ai/schema";
import {
  type FollowUpGroups,
  type MailCursor,
  type PriorityGroups,
  decodeCursor,
  encodeCursor,
  groupByPriority,
  groupFollowUps,
  likePattern,
} from "./dashboard-pure";
import type { AnalysisPreview } from "./emails";

/** The mailbox an email came from. No secrets. */
export type AccountRef = { id: string; identity: string; brand: string | null; provider: string };

/** One email as the dashboard lists show it: no body, with its AI result, account and handled state. */
export type MailRow = {
  id: string;
  threadId: string;
  fromAddress: string;
  fromName: string | null;
  subject: string;
  snippet: string;
  receivedAt: Date;
  status: "unread" | "read";
  handled: boolean;
  account: AccountRef;
  analysis: AnalysisPreview | null;
};

const mailColumns = {
  id: etEmails.id,
  threadId: etEmails.threadId,
  fromAddress: etEmails.fromAddress,
  fromName: etEmails.fromName,
  subject: etEmails.subject,
  snippet: etEmails.snippet,
  receivedAt: etEmails.receivedAt,
  status: etEmails.status,
  handledAt: etEmailState.handledAt,
  accountId: connectedAccounts.id,
  accountIdentity: connectedAccounts.identity,
  accountBrand: connectedAccounts.brand,
  accountProvider: connectedAccounts.provider,
  analysisStatus: etEmailAnalysis.status,
  category: etEmailAnalysis.category,
  priority: etEmailAnalysis.priority,
  needsReply: etEmailAnalysis.needsReply,
  summary: etEmailAnalysis.summary,
  suggestedAction: etEmailAnalysis.suggestedAction,
};

type MailRecord = {
  id: string;
  threadId: string;
  fromAddress: string;
  fromName: string | null;
  subject: string;
  snippet: string;
  receivedAt: Date;
  status: "unread" | "read";
  handledAt: Date | null;
  accountId: string;
  accountIdentity: string;
  accountBrand: string | null;
  accountProvider: string;
  analysisStatus: "analyzed" | "failed" | null;
  category: EmailCategory | null;
  priority: number | null;
  needsReply: boolean | null;
  summary: string | null;
  suggestedAction: string | null;
};

function toMailRow(record: MailRecord): MailRow {
  const analysis: AnalysisPreview | null =
    record.analysisStatus === "analyzed" && record.category && record.priority !== null && record.summary && record.suggestedAction
      ? {
          category: record.category,
          priority: record.priority,
          needsReply: record.needsReply ?? false,
          summary: record.summary,
          suggestedAction: record.suggestedAction,
        }
      : null;
  return {
    id: record.id,
    threadId: record.threadId,
    fromAddress: record.fromAddress,
    fromName: record.fromName,
    subject: record.subject,
    snippet: record.snippet,
    receivedAt: record.receivedAt,
    status: record.status,
    handled: record.handledAt !== null,
    account: { id: record.accountId, identity: record.accountIdentity, brand: record.accountBrand, provider: record.accountProvider },
    analysis,
  };
}

/**
 * The shared mail query. Every table in it is scoped to the tenant: the emails, the accounts
 * they belong to, their AI results and the user's handled marks.
 */
async function selectMail(db: Database, tenantId: string, where: SQL | undefined, order: SQL[], limit: number): Promise<MailRow[]> {
  const records = await db
    .select(mailColumns)
    .from(etEmails)
    .innerJoin(connectedAccounts, and(eq(connectedAccounts.id, etEmails.accountId), eq(connectedAccounts.tenantId, tenantId)))
    .leftJoin(etEmailAnalysis, and(eq(etEmailAnalysis.emailId, etEmails.id), eq(etEmailAnalysis.tenantId, tenantId)))
    .leftJoin(etEmailState, and(eq(etEmailState.emailId, etEmails.id), eq(etEmailState.tenantId, tenantId)))
    .where(and(eq(etEmails.tenantId, tenantId), where))
    .orderBy(...order)
    .limit(limit);
  return records.map(toMailRow);
}

// ---------------------------------------------------------------------------------------------
// Today

export type TodayOverview = {
  newToday: number;
  needsReply: number;
  highPriority: number;
  leadReplies: number;
  followUpsDue: number;
};

/** The numbers on the Today cards. Handled mail does not count as still needing attention. */
export async function getTodayOverview(db: Database, tenantId: string, now: Date = new Date()): Promise<TodayOverview> {
  const { startOfToday } = await getTodayWindow(db, tenantId, now);
  const since = startOfToday.toISOString();
  const counts = await db.execute(sql`
    select
      count(*) filter (where e.received_at >= ${since})::int as new_today,
      count(*) filter (where a.status = 'analyzed' and a.needs_reply = true and s.email_id is null)::int as needs_reply,
      count(*) filter (where a.status = 'analyzed' and a.priority = 1 and e.received_at >= ${since} and s.email_id is null)::int as high_priority,
      count(*) filter (where a.status = 'analyzed' and a.category = 'lead_reply' and e.received_at >= ${since})::int as lead_replies
    from et_emails e
    left join et_email_analysis a on a.email_id = e.id and a.tenant_id = ${tenantId}
    left join et_email_state s on s.email_id = e.id and s.tenant_id = ${tenantId}
    where e.tenant_id = ${tenantId} and e.direction = 'inbound'
  `);
  const row = (counts.rows[0] ?? {}) as { new_today?: number; needs_reply?: number; high_priority?: number; lead_replies?: number };

  const [due] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(etFollowups)
    .where(and(eq(etFollowups.tenantId, tenantId), eq(etFollowups.status, "open"), lte(etFollowups.dueAt, now)));

  return {
    newToday: row.new_today ?? 0,
    needsReply: row.needs_reply ?? 0,
    highPriority: row.high_priority ?? 0,
    leadReplies: row.lead_replies ?? 0,
    followUpsDue: due?.total ?? 0,
  };
}

/** Today's inbound mail that is not handled yet, grouped by AI priority. */
export async function listTodayByPriority(
  db: Database,
  tenantId: string,
  now: Date = new Date(),
  limit = 200,
): Promise<PriorityGroups<MailRow>> {
  const { startOfToday } = await getTodayWindow(db, tenantId, now);
  const rows = await selectMail(
    db,
    tenantId,
    and(eq(etEmails.direction, "inbound"), sql`${etEmails.receivedAt} >= ${startOfToday.toISOString()}`, isNull(etEmailState.emailId)),
    [desc(etEmails.receivedAt), desc(etEmails.id)],
    limit,
  );
  return groupByPriority(rows);
}

// ---------------------------------------------------------------------------------------------
// Needs reply

/** Mail the AI says needs a reply and the user has not marked handled: most urgent first, oldest first within a priority. */
export async function listNeedsReply(db: Database, tenantId: string, limit = 100): Promise<MailRow[]> {
  return selectMail(
    db,
    tenantId,
    and(
      eq(etEmails.direction, "inbound"),
      eq(etEmailAnalysis.status, "analyzed"),
      eq(etEmailAnalysis.needsReply, true),
      isNull(etEmailState.emailId),
    ),
    [asc(etEmailAnalysis.priority), asc(etEmails.receivedAt), asc(etEmails.id)],
    limit,
  );
}

// ---------------------------------------------------------------------------------------------
// Follow-ups

export type FollowUpRow = {
  id: string;
  dueAt: Date;
  reason: string;
  source: "ai" | "manual";
  mail: MailRow;
};

/** The tenant's open follow-ups with their email, split into overdue, due today and upcoming. */
export async function listFollowUps(db: Database, tenantId: string, now: Date = new Date()): Promise<FollowUpGroups<FollowUpRow>> {
  const { timeZone } = await getTodayWindow(db, tenantId, now);
  const records = await db
    .select({ followUpId: etFollowups.id, dueAt: etFollowups.dueAt, reason: etFollowups.reason, source: etFollowups.source, ...mailColumns })
    .from(etFollowups)
    .innerJoin(etEmails, and(eq(etEmails.id, etFollowups.emailId), eq(etEmails.tenantId, tenantId)))
    .innerJoin(connectedAccounts, and(eq(connectedAccounts.id, etEmails.accountId), eq(connectedAccounts.tenantId, tenantId)))
    .leftJoin(etEmailAnalysis, and(eq(etEmailAnalysis.emailId, etEmails.id), eq(etEmailAnalysis.tenantId, tenantId)))
    .leftJoin(etEmailState, and(eq(etEmailState.emailId, etEmails.id), eq(etEmailState.tenantId, tenantId)))
    .where(and(eq(etFollowups.tenantId, tenantId), eq(etFollowups.status, "open")))
    .orderBy(asc(etFollowups.dueAt))
    .limit(300);

  const items: FollowUpRow[] = records.map(({ followUpId, dueAt, reason, source, ...mail }) => ({
    id: followUpId,
    dueAt,
    reason,
    source,
    mail: toMailRow(mail),
  }));
  return groupFollowUps(items, timeZone, now);
}

// ---------------------------------------------------------------------------------------------
// Mail (search and filters)

export type MailFilters = {
  accountId?: string;
  category?: EmailCategory;
  priority?: 1 | 2 | 3;
  unreadOnly?: boolean;
  handled?: "yes" | "no";
  query?: string;
};

export type MailPage = { rows: MailRow[]; nextCursor: string | null };

export const MAIL_PAGE_SIZE = 30;

/** All the tenant's mail, newest first, filtered and paged by position (not offset, so it stays fast and stable). */
export async function searchMail(db: Database, tenantId: string, filters: MailFilters, cursor?: string | null): Promise<MailPage> {
  const position: MailCursor | null = decodeCursor(cursor);
  const pattern = filters.query ? likePattern(filters.query) : null;

  const conditions: Array<SQL | undefined> = [
    filters.accountId ? eq(etEmails.accountId, filters.accountId) : undefined,
    filters.category ? eq(etEmailAnalysis.category, filters.category) : undefined,
    filters.priority ? eq(etEmailAnalysis.priority, filters.priority) : undefined,
    filters.unreadOnly ? eq(etEmails.status, "unread") : undefined,
    filters.handled === "yes" ? isNotNull(etEmailState.emailId) : filters.handled === "no" ? isNull(etEmailState.emailId) : undefined,
    pattern
      ? or(
          ilike(etEmails.fromAddress, pattern),
          ilike(etEmails.fromName, pattern),
          ilike(etEmails.subject, pattern),
          ilike(etEmails.snippet, pattern),
        )
      : undefined,
    position
      ? sql`(${etEmails.receivedAt}, ${etEmails.id}) < (${new Date(position.receivedAtMs).toISOString()}::timestamptz, ${position.id}::uuid)`
      : undefined,
  ];

  const rows = await selectMail(db, tenantId, and(...conditions), [desc(etEmails.receivedAt), desc(etEmails.id)], MAIL_PAGE_SIZE + 1);
  const hasMore = rows.length > MAIL_PAGE_SIZE;
  const shown = hasMore ? rows.slice(0, MAIL_PAGE_SIZE) : rows;
  const last = shown[shown.length - 1];
  return { rows: shown, nextCursor: hasMore && last ? encodeCursor({ receivedAtMs: last.receivedAt.getTime(), id: last.id }) : null };
}

// ---------------------------------------------------------------------------------------------
// One email

export type MailDetail = MailRow & {
  bodyText: string;
  toAddresses: string[];
  providerMessageId: string;
  followUps: Array<{ id: string; dueAt: Date; reason: string; source: "ai" | "manual"; status: "open" | "done" | "dismissed" }>;
};

/** One email with its full text, or null when it is not this tenant's. */
export async function getMailDetail(db: Database, tenantId: string, emailId: string): Promise<MailDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(emailId)) return null;
  const [record] = await db
    .select({ ...mailColumns, bodyText: etEmails.bodyText, toAddresses: etEmails.toAddresses, providerMessageId: etEmails.providerMessageId })
    .from(etEmails)
    .innerJoin(connectedAccounts, and(eq(connectedAccounts.id, etEmails.accountId), eq(connectedAccounts.tenantId, tenantId)))
    .leftJoin(etEmailAnalysis, and(eq(etEmailAnalysis.emailId, etEmails.id), eq(etEmailAnalysis.tenantId, tenantId)))
    .leftJoin(etEmailState, and(eq(etEmailState.emailId, etEmails.id), eq(etEmailState.tenantId, tenantId)))
    .where(and(eq(etEmails.tenantId, tenantId), eq(etEmails.id, emailId)))
    .limit(1);
  if (!record) return null;

  const { bodyText, toAddresses, providerMessageId, ...mail } = record;
  const followUps = await db
    .select({ id: etFollowups.id, dueAt: etFollowups.dueAt, reason: etFollowups.reason, source: etFollowups.source, status: etFollowups.status })
    .from(etFollowups)
    .where(and(eq(etFollowups.tenantId, tenantId), eq(etFollowups.emailId, emailId)))
    .orderBy(asc(etFollowups.dueAt));
  return { ...toMailRow(mail), bodyText, toAddresses, providerMessageId, followUps };
}

/** The mailboxes the account filter offers: id, address and brand, never secrets. */
export async function listAccountOptions(db: Database, tenantId: string): Promise<AccountRef[]> {
  return db
    .select({ id: connectedAccounts.id, identity: connectedAccounts.identity, brand: connectedAccounts.brand, provider: connectedAccounts.provider })
    .from(connectedAccounts)
    .where(eq(connectedAccounts.tenantId, tenantId))
    .orderBy(asc(connectedAccounts.identity));
}
