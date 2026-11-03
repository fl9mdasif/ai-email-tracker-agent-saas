import { and, asc, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import type { Database } from "@/core/db";
import { connectedAccounts } from "@/core/db/schema";
import { type LeadTemperature, etEmails, etLeads } from "../db/schema";

const REASON_MAX = 300;
const UUID = /^[0-9a-f-]{36}$/i;

/** Hot first, then warm, then cold. */
export function temperatureRank(temperature: LeadTemperature): number {
  return temperature === "hot" ? 0 : temperature === "warm" ? 1 : 2;
}

/**
 * Records what the AI made of an email from a prospect. One lead per sender address and
 * workspace; the newest scored email decides the temperature, so analysing an older email
 * later never overwrites a newer verdict. Outbound mail is never a lead.
 */
export async function upsertLeadFromAnalysis(
  db: Database,
  tenantId: string,
  emailId: string,
  temperature: LeadTemperature,
  reason: string,
): Promise<void> {
  if (!UUID.test(emailId)) return;
  const [email] = await db
    .select({ fromAddress: etEmails.fromAddress, fromName: etEmails.fromName, receivedAt: etEmails.receivedAt, direction: etEmails.direction })
    .from(etEmails)
    .where(and(eq(etEmails.id, emailId), eq(etEmails.tenantId, tenantId)))
    .limit(1);
  if (!email || email.direction !== "inbound") return;
  const contactEmail = email.fromAddress.trim().toLowerCase();
  if (!contactEmail) return;

  const values = {
    temperature,
    reason: reason.trim().slice(0, REASON_MAX),
    contactName: email.fromName,
    lastEmailId: emailId,
    lastEmailAt: email.receivedAt,
    updatedAt: new Date(),
  };
  await db
    .insert(etLeads)
    .values({ tenantId, contactEmail, ...values })
    .onConflictDoUpdate({
      target: [etLeads.tenantId, etLeads.contactEmail],
      set: values,
      // Only a newer (or equally new) email changes the verdict.
      setWhere: or(isNull(etLeads.lastEmailAt), lte(etLeads.lastEmailAt, email.receivedAt)),
    });
}

export type LeadRow = {
  id: string;
  contactEmail: string;
  contactName: string | null;
  temperature: LeadTemperature;
  reason: string;
  lastEmailId: string | null;
  lastEmailAt: Date | null;
  lastContactedAt: Date | null;
  subject: string | null;
  mailbox: string | null;
};

/**
 * The workspace's leads that are not snoozed, hot first and newest first within each group,
 * plus how many are snoozed (just written to or skipped).
 */
export async function listLeads(db: Database, tenantId: string, now = new Date()): Promise<{ leads: LeadRow[]; snoozed: number }> {
  const awake = or(isNull(etLeads.snoozedUntil), lte(etLeads.snoozedUntil, now));
  const [rows, [snoozedRow]] = await Promise.all([
    db
      .select({
        id: etLeads.id,
        contactEmail: etLeads.contactEmail,
        contactName: etLeads.contactName,
        temperature: etLeads.temperature,
        reason: etLeads.reason,
        lastEmailId: etLeads.lastEmailId,
        lastEmailAt: etLeads.lastEmailAt,
        lastContactedAt: etLeads.lastContactedAt,
        subject: etEmails.subject,
        mailbox: connectedAccounts.identity,
      })
      .from(etLeads)
      .leftJoin(etEmails, and(eq(etEmails.id, etLeads.lastEmailId), eq(etEmails.tenantId, tenantId)))
      .leftJoin(connectedAccounts, and(eq(connectedAccounts.id, etEmails.accountId), eq(connectedAccounts.tenantId, tenantId)))
      .where(and(eq(etLeads.tenantId, tenantId), awake))
      .orderBy(
        sql`case ${etLeads.temperature} when 'hot' then 0 when 'warm' then 1 else 2 end`,
        desc(etLeads.lastEmailAt),
        asc(etLeads.contactEmail),
      )
      .limit(200),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(etLeads)
      .where(and(eq(etLeads.tenantId, tenantId), gte(etLeads.snoozedUntil, now))),
  ]);
  return { leads: rows, snoozed: snoozedRow?.count ?? 0 };
}

export type LeadDetail = LeadRow & {
  snoozedUntil: Date | null;
  email: {
    id: string;
    accountId: string;
    threadId: string;
    providerMessageId: string;
    fromAddress: string;
    fromName: string | null;
    subject: string;
    bodyText: string;
    receivedAt: Date;
  } | null;
};

/** One lead of this workspace with the email a follow-up would answer, or null. */
export async function getLead(db: Database, tenantId: string, leadId: string): Promise<LeadDetail | null> {
  if (!UUID.test(leadId)) return null;
  const [row] = await db
    .select({
      lead: etLeads,
      email: {
        id: etEmails.id,
        accountId: etEmails.accountId,
        threadId: etEmails.threadId,
        providerMessageId: etEmails.providerMessageId,
        fromAddress: etEmails.fromAddress,
        fromName: etEmails.fromName,
        subject: etEmails.subject,
        bodyText: etEmails.bodyText,
        receivedAt: etEmails.receivedAt,
      },
      mailbox: connectedAccounts.identity,
    })
    .from(etLeads)
    .leftJoin(etEmails, and(eq(etEmails.id, etLeads.lastEmailId), eq(etEmails.tenantId, tenantId)))
    .leftJoin(connectedAccounts, and(eq(connectedAccounts.id, etEmails.accountId), eq(connectedAccounts.tenantId, tenantId)))
    .where(and(eq(etLeads.id, leadId), eq(etLeads.tenantId, tenantId)))
    .limit(1);
  if (!row) return null;
  const { lead } = row;
  return {
    id: lead.id,
    contactEmail: lead.contactEmail,
    contactName: lead.contactName,
    temperature: lead.temperature,
    reason: lead.reason,
    lastEmailId: lead.lastEmailId,
    lastEmailAt: lead.lastEmailAt,
    lastContactedAt: lead.lastContactedAt,
    snoozedUntil: lead.snoozedUntil,
    subject: row.email?.subject ?? null,
    mailbox: row.mailbox,
    email: row.email?.id ? row.email : null,
  };
}

/** Hides a lead until the given time (Skip, or right after a follow-up was sent). False when it is not this workspace's. */
export async function snoozeLead(db: Database, tenantId: string, leadId: string, until: Date, contactedAt?: Date): Promise<boolean> {
  if (!UUID.test(leadId)) return false;
  const updated = await db
    .update(etLeads)
    .set({ snoozedUntil: until, updatedAt: new Date(), ...(contactedAt ? { lastContactedAt: contactedAt } : {}) })
    .where(and(eq(etLeads.id, leadId), eq(etLeads.tenantId, tenantId)))
    .returning({ id: etLeads.id });
  return updated.length > 0;
}
