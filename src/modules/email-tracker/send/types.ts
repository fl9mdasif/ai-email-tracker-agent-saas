/**
 * Why a send did not go out, as a short code that is safe to store and log. Never server text,
 * never the message.
 */
export const SEND_FAILURES = {
  needs_permission: "Loopify does not have permission to send from this Gmail account yet. Press Allow sending and approve it with Google.",
  reconnect: "The mailbox rejected the sign-in. Reconnect this account on the Accounts page, then try again.",
  rejected: "The mail server refused this email. Check the address and try again.",
  rate_limited: "The mail service is limiting sends right now. Try again in a few minutes.",
  unreachable: "Could not reach the mail server. Try again in a moment.",
  unsupported: "Sending from this kind of account is not available yet.",
  unknown: "The email could not be sent. Please try again.",
} as const;

export type SendFailure = keyof typeof SEND_FAILURES;

export type SendResult = { ok: true; messageId: string } | { ok: false; code: SendFailure };
