import { randomUUID } from "node:crypto";
import MailComposer from "nodemailer/lib/mail-composer";

/** One email the user chose to send: a reply in an existing thread. */
export type OutgoingMessage = {
  from: { address: string; name?: string | null };
  to: string;
  subject: string;
  text: string;
  /** The Message-ID of the email being answered, without angle brackets (as stored in et_emails). */
  replyToMessageId?: string | null;
  /** The Message-ID that started the thread (IMAP thread id), without angle brackets. */
  threadRootId?: string | null;
};

/**
 * True for a real RFC Message-ID. The sync falls back to "uid:..." or "gmail:..." when a message
 * had none; those are our own ids and must never go into a mail header.
 */
export function isRfcMessageId(id: string | null | undefined): id is string {
  return Boolean(id && /^[^\s<>@]+@[^\s<>@]+$/.test(id) && !/^(uid|gmail):/i.test(id));
}

/**
 * The headers that make mail clients file the reply under the original: In-Reply-To names the
 * email being answered, References lists the thread root and then that email.
 */
export function threadingHeaders(message: Pick<OutgoingMessage, "replyToMessageId" | "threadRootId">): { inReplyTo?: string; references?: string[] } {
  if (!isRfcMessageId(message.replyToMessageId)) return {};
  const parent = `<${message.replyToMessageId}>`;
  const root = isRfcMessageId(message.threadRootId) && message.threadRootId !== message.replyToMessageId ? `<${message.threadRootId}>` : null;
  return { inReplyTo: parent, references: root ? [root, parent] : [parent] };
}

/** A fresh Message-ID on the sender's own domain. */
export function newMessageId(fromAddress: string): string {
  const domain = fromAddress.split("@")[1]?.trim().toLowerCase() || "loopify.local";
  return `<${randomUUID()}@${domain}>`;
}

/** The complete message (headers and text), ready for SMTP, the Gmail API and the Sent folder. */
export async function buildRawMessage(message: OutgoingMessage, messageId: string): Promise<Buffer> {
  const composer = new MailComposer({
    from: message.from.name ? { name: message.from.name, address: message.from.address } : message.from.address,
    to: message.to,
    subject: message.subject,
    text: message.text,
    messageId,
    date: new Date(),
    ...threadingHeaders(message),
  });
  return composer.compile().build();
}
