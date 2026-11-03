import { z } from "zod";

/** What the vault stores for a Gmail account. Only the long-lived refresh token; access tokens are never kept. */
export const gmailCredentialsSchema = z.object({
  refreshToken: z.string().min(1),
});

export type GmailCredentials = z.infer<typeof gmailCredentialsSchema>;

/** Read-only mail access: the app can never send, change or delete anything in the mailbox. */
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
