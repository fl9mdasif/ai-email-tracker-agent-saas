import { getAppUrl, requireConfig } from "@/core/config";
import { GmailError } from "./errors";
import { GMAIL_SCOPE } from "./schema";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TIMEOUT_MS = 20_000;

export type FetchLike = typeof fetch;

/** The address Google sends the user back to after consent. Must match the one in Google Cloud. */
export function googleRedirectUri(): string {
  return `${getAppUrl()}/api/connect/google/callback`;
}

/** Where to send the user to approve read-only mail access. `loginHint` pre-selects an account on Reconnect. */
export function buildConsentUrl(state: string, loginHint?: string): string {
  const params = new URLSearchParams({
    client_id: requireConfig("GOOGLE_CLIENT_ID"),
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline",
    // Always show the account picker (so each Connect can add a different Gmail) and always
    // return a refresh token.
    prompt: "select_account consent",
    include_granted_scopes: "false",
    state,
  });
  if (loginHint) params.set("login_hint", loginHint);
  return `${AUTH_URL}?${params.toString()}`;
}

type TokenReply = { access_token?: string; refresh_token?: string; error?: string };

async function postToken(body: Record<string, string>, fetchFn: FetchLike): Promise<TokenReply> {
  let response: Response;
  try {
    response = await fetchFn(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: requireConfig("GOOGLE_CLIENT_ID"),
        client_secret: requireConfig("GOOGLE_CLIENT_SECRET"),
        ...body,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new GmailError("unreachable");
  }
  const reply = (await response.json().catch(() => ({}))) as TokenReply;
  if (response.ok) return reply;
  // Only OAuth's short error code (for example "invalid_grant") is logged, never Google's longer text.
  const code = typeof reply.error === "string" && /^[a-z_]{1,40}$/.test(reply.error) ? reply.error : "unknown";
  console.error(`[gmail-token] Google answered HTTP ${response.status}, error code: ${code}`);
  // invalid_grant: the user removed access, or the testing-mode token expired after 7 days.
  if (reply.error === "invalid_grant" || response.status === 400 || response.status === 401) throw new GmailError("reconnect", response.status);
  if (response.status === 429) throw new GmailError("quota", response.status);
  throw new GmailError("unknown", response.status);
}

/** Trades the saved refresh token for a short-lived access token. Throws a GmailError with a safe message. */
export async function getAccessToken(refreshToken: string, fetchFn: FetchLike = fetch): Promise<string> {
  const reply = await postToken({ grant_type: "refresh_token", refresh_token: refreshToken }, fetchFn);
  if (!reply.access_token) throw new GmailError("unknown");
  return reply.access_token;
}

/** Trades the one-time code from the consent screen for tokens. */
export async function exchangeCode(code: string, fetchFn: FetchLike = fetch): Promise<{ accessToken: string; refreshToken: string }> {
  const reply = await postToken(
    { grant_type: "authorization_code", code, redirect_uri: googleRedirectUri() },
    fetchFn,
  );
  if (!reply.access_token || !reply.refresh_token) throw new GmailError("unknown");
  return { accessToken: reply.access_token, refreshToken: reply.refresh_token };
}
