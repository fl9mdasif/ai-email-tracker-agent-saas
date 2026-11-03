import type { NormalizedEmail } from "../../types";
import { GmailError } from "./errors";
import { type GmailMessageLike, normalizeGmailMessage } from "./normalize";
import {
  GMAIL_MAX_LISTED,
  type GmailCursor,
  nextGmailCursor,
  pickIdsToRead,
  planGmailList,
} from "./plan-fetch";
import type { GmailCredentials } from "./schema";
import { type FetchLike, getAccessToken } from "./tokens";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const TIMEOUT_MS = 20_000;
const PAGE_SIZE = 100;
const CONCURRENCY = 5;

export type GmailFetchResult = {
  emails: NormalizedEmail[];
  cursor: GmailCursor;
  /** Messages Gmail listed for this run, including any that could not be read. */
  fetched: number;
};

export type FetchGmailEmails = (
  credentials: GmailCredentials,
  cursor: GmailCursor | null,
  accountAddress: string,
  fetchFn?: FetchLike,
) => Promise<GmailFetchResult>;

/**
 * Tells apart the two usual reasons Google answers 403: the Gmail API is switched off for the
 * project, or the user did not grant the mail permission. Only Google's short reason code is read.
 */
async function forbiddenKind(response: Response): Promise<"apiDisabled" | "scope" | "reconnect"> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: { errors?: Array<{ reason?: string }>; details?: Array<{ reason?: string }> };
  };
  const reasons = [...(body.error?.errors ?? []), ...(body.error?.details ?? [])]
    .map((entry) => entry.reason ?? "")
    .filter((reason) => /^[A-Za-z_]{1,60}$/.test(reason));
  console.error(`[gmail-api] Google answered HTTP 403, reason: ${reasons.join(", ") || "none given"}`);
  if (reasons.some((reason) => /accessNotConfigured|SERVICE_DISABLED/i.test(reason))) return "apiDisabled";
  if (reasons.some((reason) => /insufficient|SCOPE/i.test(reason))) return "scope";
  return "reconnect";
}

async function api<T>(path: string, token: string, fetchFn: FetchLike): Promise<T> {
  let response: Response;
  try {
    response = await fetchFn(`${API}${path}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new GmailError("unreachable");
  }
  if (response.status === 401) throw new GmailError("reconnect", response.status);
  if (response.status === 403) throw new GmailError(await forbiddenKind(response), response.status);
  if (response.status === 429) throw new GmailError("quota", response.status);
  if (!response.ok) throw new GmailError("unknown", response.status);
  return (await response.json()) as T;
}

/** The address of the connected mailbox. Also proves the token works. */
export async function getGmailAddress(accessToken: string, fetchFn: FetchLike = fetch): Promise<string> {
  const profile = await api<{ emailAddress?: string }>("/profile", accessToken, fetchFn);
  const address = profile.emailAddress?.trim().toLowerCase();
  if (!address) throw new GmailError("unknown");
  return address;
}

async function listIds(plan: ReturnType<typeof planGmailList>, token: string, fetchFn: FetchLike): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ labelIds: "INBOX", maxResults: String(PAGE_SIZE) });
    if (plan.query) params.set("q", plan.query);
    if (pageToken) params.set("pageToken", pageToken);
    const page = await api<{ messages?: Array<{ id: string }>; nextPageToken?: string }>(`/messages?${params}`, token, fetchFn);
    ids.push(...(page.messages ?? []).map((message) => message.id));
    // The first sync only needs the newest few, which arrive on the first page.
    pageToken = plan.newestOnly ? undefined : page.nextPageToken;
  } while (pageToken && ids.length < GMAIL_MAX_LISTED);
  return ids;
}

/**
 * Reads new INBOX mail for one Gmail account, read-only, and returns normalized emails. It never
 * changes the mailbox (no labels, no archive, no delete) and never calls the AI layer. Throws a
 * GmailError with a safe message on sign-in or network problems; one unreadable message is skipped.
 */
export const fetchGmailEmails: FetchGmailEmails = async (credentials, cursor, accountAddress, fetchFn = fetch) => {
  const token = await getAccessToken(credentials.refreshToken, fetchFn);
  const plan = planGmailList(cursor);
  const listed = await listIds(plan, token, fetchFn);
  const toRead = pickIdsToRead(listed, plan.newestOnly);

  const now = new Date();
  const emails: NormalizedEmail[] = [];
  const receivedMs: number[] = [];

  for (let start = 0; start < toRead.length; start += CONCURRENCY) {
    const batch = toRead.slice(start, start + CONCURRENCY);
    const messages = await Promise.all(
      batch.map(async (id) => {
        try {
          return await api<GmailMessageLike>(`/messages/${encodeURIComponent(id)}?format=full`, token, fetchFn);
        } catch (error) {
          // A bad token or a rate limit affects every message, so stop; anything else skips just this one.
          if (error instanceof GmailError && (error.kind === "reconnect" || error.kind === "quota")) throw error;
          return null;
        }
      }),
    );
    for (const message of messages) {
      if (!message) continue;
      try {
        const email = normalizeGmailMessage(message, { accountAddress, now });
        emails.push(email);
        receivedMs.push(email.receivedAt.getTime());
      } catch {
        // One unreadable message must not stop the rest. Nothing about it is logged.
      }
    }
  }

  return { emails, cursor: nextGmailCursor(cursor, receivedMs), fetched: toRead.length };
};
