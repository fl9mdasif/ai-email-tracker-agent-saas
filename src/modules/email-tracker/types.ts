/**
 * The one email shape every connector returns, whichever provider it came from.
 * Persistence adds id, tenant_id, account_id and provider around it.
 */
export type NormalizedEmail = {
  /** The message's own id (Message-ID header when present), unique within an account. */
  providerMessageId: string;
  threadId: string;
  from: { address: string; name: string | null };
  to: string[];
  subject: string;
  snippet: string;
  bodyText: string;
  receivedAt: Date;
  direction: "inbound" | "outbound";
  status: "unread" | "read";
  labels: string[];
};
