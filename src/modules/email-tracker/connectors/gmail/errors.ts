/** Messages safe to show. Nothing from Google's own error text is ever copied into them. */
export const GMAIL_MESSAGES = {
  reconnect: "Google access expired or was removed. Reconnect this account.",
  notConfigured: "Gmail is not set up on this server yet.",
  apiDisabled: "The Gmail API is switched off for this app. Turn it on in Google Cloud (APIs & Services, Library, Gmail API, Enable), then try again.",
  scope: "Gmail read access was not granted. Connect again and tick the box that lets Loopify view your email messages.",
  unreachable: "Could not reach Google. Try again in a moment.",
  quota: "Google is limiting requests right now. It will be retried on the next sync.",
  unknown: "Could not read this Gmail account. Please try again.",
} as const;

/** A failure that already carries a safe message. */
export class GmailError extends Error {
  constructor(
    readonly kind: keyof typeof GMAIL_MESSAGES,
    readonly status?: number,
  ) {
    super(GMAIL_MESSAGES[kind]);
    this.name = "GmailError";
  }
}

/** Maps any failure from the Gmail connector to a message that is safe to store and show. */
export function mapGmailError(error: unknown): string {
  if (error instanceof GmailError) return error.message;
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" && ["ENOTFOUND", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"].includes(code.toUpperCase())) {
    return GMAIL_MESSAGES.unreachable;
  }
  return GMAIL_MESSAGES.unknown;
}
