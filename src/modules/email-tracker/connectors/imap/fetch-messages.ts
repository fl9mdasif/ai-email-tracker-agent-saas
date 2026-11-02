import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { NormalizedEmail } from "../../types";
import { type ParsedMailLike, normalizeImapMessage } from "./normalize";
import { type SyncCursor, planFetch } from "./plan-fetch";
import type { ImapCredentials } from "./schema";

const TIMEOUT_MS = 30_000;
/** Read at most this much of each message; the text sits at the start, attachments are not needed. */
const MAX_SOURCE_BYTES = 1_000_000;

export type FetchResult = {
  emails: NormalizedEmail[];
  /** Where to continue next time. */
  cursor: SyncCursor;
  /** Messages the server returned, including any that could not be read. */
  fetched: number;
};

/** The server's received date can arrive as text or a Date; anything unparseable is ignored. */
function toValidDate(value: string | Date | undefined): Date | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Reads new mail for one account. Throws on connection or sign-in problems. */
export type FetchEmails = (
  credentials: ImapCredentials,
  cursor: SyncCursor | null,
  accountAddress: string,
) => Promise<FetchResult>;

/**
 * Connects, reads the INBOX read-only and returns normalized emails. It never changes the
 * mailbox (no flags, no moves, no deletes) and never calls the AI layer.
 */
export const fetchImapEmails: FetchEmails = async (credentials, cursor, accountAddress) => {
  const client = new ImapFlow({
    host: credentials.host,
    port: credentials.port,
    secure: credentials.secure,
    auth: { user: credentials.user, pass: credentials.password },
    logger: false,
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  });
  // Problems also arrive as events; an unhandled one would crash the process.
  client.on("error", () => {});

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    try {
      const mailbox = client.mailbox;
      if (typeof mailbox === "boolean") throw new Error("INBOX could not be opened");

      const uidValidity = String(mailbox.uidValidity);
      const plan = planFetch(cursor, uidValidity, mailbox.uidNext);
      const emails: NormalizedEmail[] = [];
      let fetched = 0;

      if (plan.range) {
        const now = new Date();
        for await (const message of client.fetch(
          plan.range,
          { uid: true, flags: true, internalDate: true, source: { maxLength: MAX_SOURCE_BYTES } },
          { uid: true },
        )) {
          fetched += 1;
          if (!message.source) continue;
          try {
            const parsed = await simpleParser(message.source);
            emails.push(
              normalizeImapMessage(parsed as ParsedMailLike, {
                uidValidity,
                uid: message.uid,
                internalDate: toValidDate(message.internalDate),
                flags: message.flags ?? new Set<string>(),
                accountAddress,
                now,
              }),
            );
          } catch {
            // One unreadable message must not stop the rest. Nothing about it is logged.
          }
        }
      }

      return { emails, cursor: { uidValidity, lastUid: plan.upTo }, fetched };
    } finally {
      lock.release();
    }
  } finally {
    try {
      await client.logout();
    } catch {
      client.close();
    }
  }
};
