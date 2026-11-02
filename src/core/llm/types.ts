/** What the gateway sends to a provider. Providers know nothing about tenants or schemas. */
export type LlmRequest = {
  model: string;
  system: string;
  user: string;
  /** JSON Schema the reply must follow. */
  jsonSchema: { name: string; schema: Record<string, unknown> };
  timeoutMs: number;
};

export type LlmResponse = {
  /** The model's reply text (expected to be a JSON document). */
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

/** One model vendor. Swap the implementation to change vendor; nothing else changes. */
export interface LlmProvider {
  complete(request: LlmRequest): Promise<LlmResponse>;
}
