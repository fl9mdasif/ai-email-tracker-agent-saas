import type { Connector } from "@/core/connectors/types";
import { mapGmailError } from "./errors";
import { getGmailAddress } from "./fetch-messages";
import { type GmailCredentials, gmailCredentialsSchema } from "./schema";
import { getAccessToken } from "./tokens";

export const GMAIL_PROVIDER = "gmail";

export const gmailConnector: Connector<GmailCredentials> = {
  provider: GMAIL_PROVIDER,
  authType: "oauth",
  async testConnection(credentials) {
    const parsed = gmailCredentialsSchema.safeParse(credentials);
    if (!parsed.success) return { ok: false, message: "The saved Gmail access could not be read. Reconnect this account." };
    try {
      await getGmailAddress(await getAccessToken(parsed.data.refreshToken));
      return { ok: true };
    } catch (error) {
      return { ok: false, message: mapGmailError(error) };
    }
  },
};
