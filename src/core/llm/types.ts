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

/**
 * A provider failure the gateway can act on. "auth" (key rejected) and "quota" (no credits) will
 * not fix themselves on a retry, so the gateway stops at once and callers pause instead of
 * counting a failed attempt against the email.
 */
export class LlmProviderError extends Error {
  constructor(readonly kind: "auth" | "quota" | "other") {
    super(`LLM provider error: ${kind}`); // never carries the vendor's message
    this.name = "LlmProviderError";
  }
}

/** One model vendor. Swap the implementation to change vendor; nothing else changes. */
export interface LlmProvider {
  complete(request: LlmRequest): Promise<LlmResponse>;
}
