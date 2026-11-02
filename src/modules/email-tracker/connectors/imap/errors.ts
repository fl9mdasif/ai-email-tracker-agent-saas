/**
 * Turns an IMAP failure into a message that is safe to show. Only the error's code and
 * message are inspected to pick a category; nothing from the error (which can contain the
 * address or server text) is ever copied into the result.
 */
export const IMAP_MESSAGES = {
  auth: "Sign-in failed. Check the email address and use an app password, not your normal password.",
  imapDisabled: "IMAP access looks switched off for this mailbox. Turn IMAP on in your mail settings and try again.",
  notFound: "Could not find the mail server. Check your internet connection and try again.",
  unreachable: "Could not reach the mail server. Try again in a moment.",
  timeout: "The mail server did not answer in time. Try again in a moment.",
  tls: "A secure connection to the mail server could not be set up.",
  unknown: "Could not connect to the mailbox. Please try again.",
} as const;

type ErrorLike = { code?: unknown; message?: unknown; authenticationFailed?: unknown };

export function mapImapError(error: unknown): string {
  const { code, message, authenticationFailed } = (error ?? {}) as ErrorLike;
  const errorCode = typeof code === "string" ? code.toUpperCase() : "";
  const text = typeof message === "string" ? message.toLowerCase() : "";

  if (authenticationFailed === true || errorCode === "AUTHENTICATIONFAILED") return IMAP_MESSAGES.auth;
  if (/imap.*(disabled|not enabled|not allowed)|(disabled|not enabled).*imap/.test(text)) {
    return IMAP_MESSAGES.imapDisabled;
  }
  if (errorCode === "ENOTFOUND" || errorCode === "EAI_AGAIN") return IMAP_MESSAGES.notFound;
  if (errorCode === "ETIMEDOUT" || errorCode === "ETIMEOUT" || text.includes("timed out") || text.includes("timeout")) {
    return IMAP_MESSAGES.timeout;
  }
  if (
    ["ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH", "EPIPE", "NOCONNECTION"].includes(errorCode)
  ) {
    return IMAP_MESSAGES.unreachable;
  }
  if (/CERT|TLS|SSL/.test(errorCode) || /certificate|tls|ssl/.test(text)) return IMAP_MESSAGES.tls;
  if (/auth|login|credentials|password/.test(text)) return IMAP_MESSAGES.auth;
  return IMAP_MESSAGES.unknown;
}
