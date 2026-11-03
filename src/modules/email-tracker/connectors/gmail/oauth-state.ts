import { randomBytes, timingSafeEqual } from "node:crypto";

/** Name of the short-lived cookie that ties the Google redirect back to the browser that started it. */
export const OAUTH_STATE_COOKIE = "loopify_gmail_oauth";
export const OAUTH_STATE_MAX_AGE_SECONDS = 600;
/** Set only by Allow sending: the lead (a uuid) to return to once Google has answered. */
export const OAUTH_RETURN_COOKIE = "loopify_gmail_return";

/** A fresh, unguessable value for the `state` parameter. */
export function newOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * True only when Google sent back exactly the state this browser started with. Without this
 * check, someone could trick a signed-in user into connecting the attacker's mailbox.
 */
export function isValidOAuthState(cookieValue: string | undefined, queryValue: string | null): boolean {
  if (!cookieValue || !queryValue) return false;
  const a = Buffer.from(cookieValue);
  const b = Buffer.from(queryValue);
  return a.length === b.length && timingSafeEqual(a, b);
}
