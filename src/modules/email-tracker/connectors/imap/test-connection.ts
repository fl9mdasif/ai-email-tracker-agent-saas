import { ImapFlow } from "imapflow";
import type { TestConnectionResult } from "@/core/connectors/types";
import { IMAP_MESSAGES, mapImapError } from "./errors";
import type { ImapCredentials } from "./schema";

const DEFAULT_TIMEOUT_MS = 10_000;

/** Connects, signs in, opens the inbox read-only and disconnects. Never reads any mail. */
export async function testImapConnection(
  credentials: ImapCredentials,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<TestConnectionResult> {
  const client = new ImapFlow({
    host: credentials.host,
    port: credentials.port,
    secure: credentials.secure,
    auth: { user: credentials.user, pass: credentials.password },
    logger: false,
    connectionTimeout: timeoutMs,
    greetingTimeout: timeoutMs,
    socketTimeout: timeoutMs,
  });
  // imapflow also reports problems as events; an unhandled one would crash the process.
  client.on("error", () => {});

  let deadline: ReturnType<typeof setTimeout> | undefined;
  const attempt = (async (): Promise<TestConnectionResult> => {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    lock.release();
    await client.logout();
    return { ok: true };
  })();
  const overallDeadline = new Promise<TestConnectionResult>((resolve) => {
    deadline = setTimeout(() => resolve({ ok: false, message: IMAP_MESSAGES.timeout }), timeoutMs * 2);
  });

  try {
    return await Promise.race([attempt, overallDeadline]);
  } catch (error) {
    return { ok: false, message: mapImapError(error) };
  } finally {
    clearTimeout(deadline);
    // Stop any attempt still running (for example after the overall deadline).
    try {
      client.close();
    } catch {
      /* already closed */
    }
    attempt.catch(() => {});
  }
}
