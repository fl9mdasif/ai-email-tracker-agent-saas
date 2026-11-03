import { z } from "zod";

/**
 * What the vault stores for a Gmail account: the long-lived refresh token (access tokens are never
 * kept) and the permissions Google granted with it. Accounts connected before scopes were
 * recorded have none listed, which means read-only.
 */
export const gmailCredentialsSchema = z.object({
  refreshToken: z.string().min(1),
  scopes: z.array(z.string()).optional(),
});

export type GmailCredentials = z.infer<typeof gmailCredentialsSchema>;

/** Read-only mail access: with this alone the app can never send, change or delete anything in the mailbox. */
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

/**
 * Permission to send mail as the user, and nothing else (it cannot read or delete). Asked for
 * separately, only when the user first presses Send on a draft from this account.
 */
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

/** True when the account's saved token includes the send permission. */
export function canSend(credentials: GmailCredentials): boolean {
  return credentials.scopes?.includes(GMAIL_SEND_SCOPE) ?? false;
}

/** Google returns the granted scopes as one space-separated string. */
export function parseScopes(scope: string | undefined): string[] {
  return (scope ?? "").split(/\s+/).filter((item) => item.startsWith("https://"));
}
