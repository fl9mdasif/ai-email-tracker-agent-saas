import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@/core/db";
import { connectedAccounts, tenants } from "@/core/db/schema";
import { etChatMessages, etEmailAnalysis, etEmailState, etEmails, etFollowupDrafts, etFollowups, etLeads, etSendAudit } from "../db/schema";

/** The most emails one export holds, so a huge mailbox cannot exhaust memory. The file says when it was cut. */
export const EXPORT_EMAIL_LIMIT = 20_000;
export const EXPORT_CHAT_LIMIT = 1_000;

export type TenantExport = {
  exportedAt: string;
  workspace: { name: string; timezone: string; createdAt: string };
  accounts: Array<{ provider: string; address: string; label: string; status: string; connectedAt: string }>;
  emails: Array<{
    from: string;
    fromName: string | null;
    to: string[];
    subject: string;
    receivedAt: string;
    account: string;
    direction: string;
    body: string;
    handled: boolean;
    ai: { category: string; priority: number | null; needsReply: boolean | null; summary: string | null; suggestedAction: string | null } | null;
  }>;
  followUps: Array<{ dueAt: string; reason: string; source: string; status: string }>;
  /** The saved chat conversation, oldest first (the last 1,000 messages). */
  chat: Array<{ role: string; content: string; status: string; at: string }>;
  leads: Array<{ contact: string; name: string | null; temperature: string; reason: string; lastContactedAt: string | null }>;
  drafts: Array<{ to: string; subject: string; body: string; status: string; createdAt: string; sentAt: string | null }>;
  /** Every send attempt from Loopify. Like the stored log, it has no subject or text. */
  sends: Array<{ to: string; from: string | null; outcome: string; errorCode: string | null; at: string }>;
  /** True when the mailbox had more than the limit and only the newest emails are included. */
  truncated: boolean;
};

/**
 * Everything Loopify holds for one workspace, as plain data the owner can keep. Account passwords
 * and tokens are never included (they are encrypted and never leave the server). Scoped to the tenant.
 */
export async function exportTenantData(db: Database, tenantId: string, now: Date = new Date()): Promise<TenantExport | null> {
  const [tenant] = await db
    .select({ name: tenants.name, timezone: tenants.timezone, createdAt: tenants.createdAt })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!tenant) return null;

  const accounts = await db
    .select({
      provider: connectedAccounts.provider,
      address: connectedAccounts.identity,
      label: connectedAccounts.label,
      status: connectedAccounts.status,
      connectedAt: connectedAccounts.createdAt,
    })
    .from(connectedAccounts)
    .where(eq(connectedAccounts.tenantId, tenantId));

  const rows = await db
    .select({
      from: etEmails.fromAddress,
      fromName: etEmails.fromName,
      to: etEmails.toAddresses,
      subject: etEmails.subject,
      receivedAt: etEmails.receivedAt,
      account: connectedAccounts.identity,
      direction: etEmails.direction,
      body: etEmails.bodyText,
      handledAt: etEmailState.handledAt,
      analysisStatus: etEmailAnalysis.status,
      category: etEmailAnalysis.category,
      priority: etEmailAnalysis.priority,
      needsReply: etEmailAnalysis.needsReply,
      summary: etEmailAnalysis.summary,
      suggestedAction: etEmailAnalysis.suggestedAction,
    })
    .from(etEmails)
    .innerJoin(connectedAccounts, and(eq(connectedAccounts.id, etEmails.accountId), eq(connectedAccounts.tenantId, tenantId)))
    .leftJoin(etEmailAnalysis, and(eq(etEmailAnalysis.emailId, etEmails.id), eq(etEmailAnalysis.tenantId, tenantId)))
    .leftJoin(etEmailState, and(eq(etEmailState.emailId, etEmails.id), eq(etEmailState.tenantId, tenantId)))
    .where(eq(etEmails.tenantId, tenantId))
    .orderBy(desc(etEmails.receivedAt))
    .limit(EXPORT_EMAIL_LIMIT + 1);

  const followUps = await db
    .select({ dueAt: etFollowups.dueAt, reason: etFollowups.reason, source: etFollowups.source, status: etFollowups.status })
    .from(etFollowups)
    .where(eq(etFollowups.tenantId, tenantId));

  const chatRows = await db
    .select({ role: etChatMessages.role, content: etChatMessages.content, status: etChatMessages.status, createdAt: etChatMessages.createdAt })
    .from(etChatMessages)
    .where(eq(etChatMessages.tenantId, tenantId))
    .orderBy(desc(etChatMessages.createdAt))
    .limit(EXPORT_CHAT_LIMIT);

  const [leadRows, draftRows, sendRows] = await Promise.all([
    db
      .select({ contact: etLeads.contactEmail, name: etLeads.contactName, temperature: etLeads.temperature, reason: etLeads.reason, lastContactedAt: etLeads.lastContactedAt })
      .from(etLeads)
      .where(eq(etLeads.tenantId, tenantId)),
    db
      .select({
        to: etLeads.contactEmail,
        subject: etFollowupDrafts.subject,
        body: etFollowupDrafts.body,
        status: etFollowupDrafts.status,
        createdAt: etFollowupDrafts.createdAt,
        sentAt: etFollowupDrafts.sentAt,
      })
      .from(etFollowupDrafts)
      .innerJoin(etLeads, and(eq(etLeads.id, etFollowupDrafts.leadId), eq(etLeads.tenantId, tenantId)))
      .where(eq(etFollowupDrafts.tenantId, tenantId))
      .orderBy(desc(etFollowupDrafts.createdAt)),
    db
      .select({ to: etSendAudit.toAddress, from: connectedAccounts.identity, outcome: etSendAudit.outcome, errorCode: etSendAudit.errorCode, at: etSendAudit.createdAt })
      .from(etSendAudit)
      .leftJoin(connectedAccounts, and(eq(connectedAccounts.id, etSendAudit.accountId), eq(connectedAccounts.tenantId, tenantId)))
      .where(eq(etSendAudit.tenantId, tenantId))
      .orderBy(desc(etSendAudit.createdAt)),
  ]);

  const truncated = rows.length > EXPORT_EMAIL_LIMIT;
  return {
    exportedAt: now.toISOString(),
    workspace: { name: tenant.name, timezone: tenant.timezone, createdAt: tenant.createdAt.toISOString() },
    accounts: accounts.map((account) => ({ ...account, connectedAt: account.connectedAt.toISOString() })),
    emails: (truncated ? rows.slice(0, EXPORT_EMAIL_LIMIT) : rows).map((row) => ({
      from: row.from,
      fromName: row.fromName,
      to: row.to,
      subject: row.subject,
      receivedAt: row.receivedAt.toISOString(),
      account: row.account,
      direction: row.direction,
      body: row.body,
      handled: row.handledAt !== null,
      ai:
        row.analysisStatus === "analyzed" && row.category
          ? { category: row.category, priority: row.priority, needsReply: row.needsReply, summary: row.summary, suggestedAction: row.suggestedAction }
          : null,
    })),
    followUps: followUps.map((item) => ({ ...item, dueAt: item.dueAt.toISOString() })),
    chat: chatRows.reverse().map((message) => ({ role: message.role, content: message.content, status: message.status, at: message.createdAt.toISOString() })),
    leads: leadRows.map((lead) => ({ ...lead, lastContactedAt: lead.lastContactedAt?.toISOString() ?? null })),
    drafts: draftRows.map((draft) => ({ ...draft, createdAt: draft.createdAt.toISOString(), sentAt: draft.sentAt?.toISOString() ?? null })),
    sends: sendRows.map((send) => ({ ...send, at: send.at.toISOString() })),
    truncated,
  };
}
