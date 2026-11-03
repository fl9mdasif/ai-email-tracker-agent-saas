import { GmailError } from "../connectors/gmail/errors";
import { type GmailCredentials, canSend } from "../connectors/gmail/schema";
import { type FetchLike, getAccessToken } from "../connectors/gmail/tokens";
import type { SendResult } from "./types";

const SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const TIMEOUT_MS = 30_000;

/**
 * Sends one prepared message through the Gmail API as the account itself, in the original
 * thread. Without the separate send permission nothing is attempted: the user is asked to allow
 * sending first. Google's reply text is never stored or logged.
 */
export async function sendViaGmail(
  credentials: GmailCredentials,
  message: { raw: Buffer; messageId: string; threadId?: string | null },
  fetchFn: FetchLike = fetch,
): Promise<SendResult> {
  if (!canSend(credentials)) return { ok: false, code: "needs_permission" };

  let accessToken: string;
  try {
    accessToken = await getAccessToken(credentials.refreshToken, fetchFn);
  } catch (error) {
    if (error instanceof GmailError) {
      if (error.kind === "reconnect") return { ok: false, code: "reconnect" };
      if (error.kind === "quota") return { ok: false, code: "rate_limited" };
      if (error.kind === "unreachable") return { ok: false, code: "unreachable" };
    }
    return { ok: false, code: "unknown" };
  }

  let response: Response;
  try {
    response = await fetchFn(SEND_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ raw: message.raw.toString("base64url"), ...(message.threadId ? { threadId: message.threadId } : {}) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, code: "unreachable" };
  }
  if (response.ok) return { ok: true, messageId: message.messageId };

  console.error(`[gmail-send] Google answered HTTP ${response.status}`);
  if (response.status === 401) return { ok: false, code: "reconnect" };
  // 403 here almost always means the token lacks the send permission (it was removed in Google's settings).
  if (response.status === 403) return { ok: false, code: "needs_permission" };
  if (response.status === 429) return { ok: false, code: "rate_limited" };
  if (response.status === 400) return { ok: false, code: "rejected" };
  return { ok: false, code: "unknown" };
}
