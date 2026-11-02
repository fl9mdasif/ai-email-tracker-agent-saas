import type { z } from "zod";
import { getConfig, requireConfig } from "@/core/config";
import { type Database, getDb } from "@/core/db";
import { llmUsage } from "@/core/db/schema";
import { createOpenAiProvider } from "./openai-provider";
import type { LlmProvider } from "./types";

const DEFAULT_TIMEOUT_MS = 30_000;
/** The first try plus one retry. */
const MAX_ATTEMPTS = 2;
const RETRY_NOTE =
  "Your previous reply was not valid. Reply with only a JSON document that matches the required schema.";

export type CallModelInput<T> = {
  tenantId: string;
  /** What the call is for, e.g. "email-analysis". Used for usage reports. */
  usageTag: string;
  system: string;
  prompt: string;
  /** Strict validation of the reply (Zod). */
  schema: z.ZodType<T>;
  /** The same shape as a JSON Schema, sent to the model so it replies in that shape. */
  responseJsonSchema: { name: string; schema: Record<string, unknown> };
  model?: string;
  timeoutMs?: number;
};

export type CallModelResult<T> =
  | { ok: true; data: T; model: string }
  | { ok: false; reason: "not_configured" | "invalid_output" | "provider_error"; message: string };

export type GatewayDeps = {
  getProvider: () => LlmProvider;
  getDb: () => Database;
  defaultModel: () => string;
};

type UsageStatus = "ok" | "invalid_output" | "error";

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/**
 * The one way any product calls a language model: one function with a prompt, a Zod schema,
 * a tenant id and a usage tag. It picks the model, applies a timeout, validates the reply,
 * retries once, and logs token usage per tenant. Messages it returns never contain prompt
 * text, model output or provider error text, so they are safe to store and show.
 */
export function createGateway(deps: GatewayDeps) {
  async function recordUsage(
    tenantId: string,
    usageTag: string,
    model: string,
    status: UsageStatus,
    latencyMs: number,
    inputTokens = 0,
    outputTokens = 0,
  ): Promise<void> {
    try {
      await deps
        .getDb()
        .insert(llmUsage)
        .values({ tenantId, usageTag, model, status, latencyMs, inputTokens, outputTokens });
    } catch {
      // Usage logging must never break the call it describes.
    }
  }

  async function callModel<T>(input: CallModelInput<T>): Promise<CallModelResult<T>> {
    let provider: LlmProvider;
    try {
      provider = deps.getProvider();
    } catch {
      return { ok: false, reason: "not_configured", message: "The AI service is not configured." };
    }

    const model = input.model ?? deps.defaultModel();
    let failure: "invalid_output" | "provider_error" = "provider_error";

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const startedAt = Date.now();
      try {
        const response = await provider.complete({
          model,
          system: input.system,
          user: attempt === 1 ? input.prompt : `${input.prompt}\n\n${RETRY_NOTE}`,
          jsonSchema: input.responseJsonSchema,
          timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        });
        const latency = Date.now() - startedAt;

        const json = parseJson(response.text);
        const checked = json.ok ? input.schema.safeParse(json.value) : null;
        if (checked?.success) {
          await recordUsage(input.tenantId, input.usageTag, response.model, "ok", latency, response.inputTokens, response.outputTokens);
          return { ok: true, data: checked.data, model: response.model };
        }
        failure = "invalid_output";
        await recordUsage(input.tenantId, input.usageTag, response.model, "invalid_output", latency, response.inputTokens, response.outputTokens);
      } catch {
        failure = "provider_error";
        await recordUsage(input.tenantId, input.usageTag, model, "error", Date.now() - startedAt);
      }
    }

    return {
      ok: false,
      reason: failure,
      message:
        failure === "invalid_output"
          ? "The AI reply could not be validated."
          : "The AI service did not respond. Please try again later.",
    };
  }

  return { callModel };
}

let provider: LlmProvider | undefined;

const defaultGateway = createGateway({
  getProvider: () => {
    provider ??= createOpenAiProvider(requireConfig("OPENAI_API_KEY"));
    return provider;
  },
  getDb,
  defaultModel: () => getConfig().LLM_MODEL,
});

export const callModel = defaultGateway.callModel;
