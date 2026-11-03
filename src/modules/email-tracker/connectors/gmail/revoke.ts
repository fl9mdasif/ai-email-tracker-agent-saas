import type { Database } from "@/core/db";
import { getCredentials } from "@/core/vault";
import { gmailCredentialsSchema } from "./schema";
import { revokeRefreshToken } from "./tokens";

/** Cancels a Gmail account's access on Google's side before it is deleted here. Never throws. */
export async function revokeGmailAccess(db: Database, tenantId: string, accountId: string): Promise<void> {
  try {
    const stored = await getCredentials(db, tenantId, accountId);
    const credentials = gmailCredentialsSchema.safeParse(stored);
    if (credentials.success) await revokeRefreshToken(credentials.data.refreshToken);
  } catch {
    // The account is removed locally either way.
  }
}
