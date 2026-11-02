export type ConnectorAuthType = "oauth" | "api_key" | "app_password";

export type TestConnectionResult = { ok: true } | { ok: false; message: string };

/**
 * What every provider connector declares, whatever the product. Connectors only reach out
 * to a provider and normalize what comes back; they never call the LLM. Sync is added to
 * this contract together with the normalized email types.
 */
export interface Connector<TCredentials = unknown> {
  readonly provider: string;
  readonly authType: ConnectorAuthType;
  /** Checks the credentials against the provider. The message must be safe to show to the user. */
  testConnection(credentials: TCredentials): Promise<TestConnectionResult>;
}
