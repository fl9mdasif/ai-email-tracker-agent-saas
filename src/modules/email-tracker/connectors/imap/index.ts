import type { Connector } from "@/core/connectors/types";
import type { ImapCredentials } from "./schema";
import { testImapConnection } from "./test-connection";

export const IMAP_PROVIDER = "imap";

export const imapConnector: Connector<ImapCredentials> = {
  provider: IMAP_PROVIDER,
  authType: "app_password",
  testConnection: (credentials) => testImapConnection(credentials),
};
