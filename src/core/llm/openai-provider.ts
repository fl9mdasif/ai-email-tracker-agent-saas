import OpenAI from "openai";
import { LlmProviderError, type LlmProvider } from "./types";

/** Sorts an OpenAI SDK error into the few cases the gateway treats differently. */
function classify(error: unknown): LlmProviderError {
  if (error instanceof OpenAI.APIError) {
    const status = error.status;
    const code = String(error.code ?? "");
    const type = String(error.type ?? "");
    if (status === 401 || status === 403) return new LlmProviderError("auth");
    if (status === 429 && (code === "insufficient_quota" || code === "credit_balance_exhausted" || type === "insufficient_quota")) {
      return new LlmProviderError("quota");
    }
  }
  return new LlmProviderError("other");
}

export type OpenAiCompatibleOptions = {
  /** Point the SDK at another OpenAI-compatible service (e.g. Groq). Omit for OpenAI itself. */
  baseURL?: string;
  /** Ask for exact schema adherence. Not every compatible service or model supports it. */
  strictSchema?: boolean;
};

/** The only file that talks to the OpenAI SDK. Everything else goes through the gateway. */
export function createOpenAiProvider(apiKey: string, options: OpenAiCompatibleOptions = {}): LlmProvider {
  const { baseURL, strictSchema = true } = options;
  // The gateway owns retries, so the SDK's own are switched off.
  const client = new OpenAI({ apiKey, baseURL, maxRetries: 0 });

  return {
    async complete(request) {
      try {
        const completion = await client.chat.completions.create(
          {
            model: request.model,
            messages: [
              { role: "system", content: request.system },
              { role: "user", content: request.user },
            ],
            response_format: {
              type: "json_schema",
              json_schema: { name: request.jsonSchema.name, strict: strictSchema, schema: request.jsonSchema.schema },
            },
            max_completion_tokens: 600,
          },
          { timeout: request.timeoutMs },
        );
        return {
          text: completion.choices[0]?.message?.content ?? "",
          model: completion.model,
          inputTokens: completion.usage?.prompt_tokens ?? 0,
          outputTokens: completion.usage?.completion_tokens ?? 0,
        };
      } catch (error) {
        // The vendor's own message can echo parts of the key or the request, so it is dropped here.
        throw classify(error);
      }
    },
  };
}
