import { and, eq } from "drizzle-orm";
import type { Database } from "@/core/db";
import { connectedAccounts } from "@/core/db/schema";
import { getCredentials } from "@/core/vault";
import { GMAIL_PROVIDER } from "../connectors/gmail";
import { gmailCredentialsSchema } from "../connectors/gmail/schema";
import type { FetchLike } from "../connectors/gmail/tokens";
import { IMAP_PROVIDER } from "../connectors/imap";
import { imapCredentialsSchema } from "../connectors/imap/schema";
import { sendViaGmail } from "./gmail-send";
import { type OutgoingMessage, buildRawMessage, newMessageId } from "./mime";
import { type SmtpDeps, sendViaSmtp } from "./smtp";
import type { SendResult } from "./types";

export type SendDeps = { smtp?: SmtpDeps; fetch?: FetchLike };

/**
 * Sends exactly one message from one of this workspace's own mailboxes: SMTP for Hostinger and
 * Zoho, the Gmail API for Gmail. The From address is always the mailbox's own. Never throws;
 * every failure comes back as a safe code.
 */
export async function sendFromAccount(
  db: Database,
  tenantId: string,
  accountId: string,
  message: Omit<OutgoingMessage, "from"> & { gmailThreadId?: string | null },
  deps: SendDeps = {},
): Promise<SendResult> {
  try {
    const [account] = await db
      .select({ provider: connectedAccounts.provider, identity: connectedAccounts.identity })
      .from(connectedAccounts)
      .where(and(eq(connectedAccounts.id, accountId), eq(connectedAccounts.tenantId, tenantId)))
      .limit(1);
    if (!account) return { ok: false, code: "unknown" };
    const stored = await getCredentials(db, tenantId, accountId);
    if (!stored) return { ok: false, code: "unknown" };

    const from = { address: account.identity };
    const messageId = newMessageId(account.identity);
    const raw = await buildRawMessage({ ...message, from }, messageId);

    if (account.provider === IMAP_PROVIDER) {
      const credentials = imapCredentialsSchema.safeParse(stored);
      if (!credentials.success) return { ok: false, code: "reconnect" };
      return await sendViaSmtp(credentials.data, { from: account.identity, to: message.to, raw, messageId }, deps.smtp);
    }
    if (account.provider === GMAIL_PROVIDER) {
      const credentials = gmailCredentialsSchema.safeParse(stored);
      if (!credentials.success) return { ok: false, code: "reconnect" };
      return await sendViaGmail(credentials.data, { raw, messageId, threadId: message.gmailThreadId }, deps.fetch);
    }
    return { ok: false, code: "unsupported" };
  } catch {
    return { ok: false, code: "unknown" };
  }
}
