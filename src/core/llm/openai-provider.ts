import OpenAI from "openai";
import type { LlmProvider } from "./types";

/** The only file that talks to the OpenAI SDK. Everything else goes through the gateway. */
export function createOpenAiProvider(apiKey: string): LlmProvider {
  // The gateway owns retries, so the SDK's own are switched off.
  const client = new OpenAI({ apiKey, maxRetries: 0 });

  return {
    async complete(request) {
      const completion = await client.chat.completions.create(
        {
          model: request.model,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: request.jsonSchema.name, strict: true, schema: request.jsonSchema.schema },
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
    },
  };
}
