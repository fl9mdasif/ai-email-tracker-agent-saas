import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Database } from "@/core/db";
import { createGateway } from "./gateway";
import type { LlmProvider, LlmRequest, LlmResponse } from "./types";

const schema = z.object({ answer: z.string().min(1) });
const responseJsonSchema = {
  name: "test",
  schema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"], additionalProperties: false },
};

const reply = (text: string): LlmResponse => ({ text, model: "test-model-1", inputTokens: 120, outputTokens: 30 });

function setup(responses: Array<LlmResponse | Error>, options: { failUsageInsert?: boolean } = {}) {
  const requests: LlmRequest[] = [];
  const usageRows: Array<Record<string, unknown>> = [];
  const queue = [...responses];
  const provider: LlmProvider = {
    complete: vi.fn(async (request: LlmRequest) => {
      requests.push(request);
      const next = queue.shift();
      if (!next) throw new Error("no more fake responses");
      if (next instanceof Error) throw next;
      return next;
    }),
  };
  const db = {
    insert: () => ({
      values: async (row: Record<string, unknown>) => {
        if (options.failUsageInsert) throw new Error("usage table down");
        usageRows.push(row);
      },
    }),
  } as unknown as Database;
  const gateway = createGateway({ getProvider: () => provider, getDb: () => db, defaultModel: () => "default-model" });
  const call = (extra: Partial<Parameters<typeof gateway.callModel<z.infer<typeof schema>>>[0]> = {}) =>
    gateway.callModel({
      tenantId: "tenant-1",
      usageTag: "test-tag",
      system: "system text",
      prompt: "prompt text",
      schema,
      responseJsonSchema,
      ...extra,
    });
  return { call, requests, usageRows, provider };
}

describe("callModel", () => {
  it("returns validated data and logs usage for the tenant", async () => {
    const { call, usageRows, requests } = setup([reply('{"answer":"hi"}')]);
    const result = await call();

    expect(result).toEqual({ ok: true, data: { answer: "hi" }, model: "test-model-1" });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ model: "default-model", system: "system text", user: "prompt text" });
    expect(usageRows).toEqual([
      expect.objectContaining({
        tenantId: "tenant-1",
        usageTag: "test-tag",
        model: "test-model-1",
        status: "ok",
        inputTokens: 120,
        outputTokens: 30,
      }),
    ]);
  });

  it("lets the caller pick another model", async () => {
    const { call, requests } = setup([reply('{"answer":"hi"}')]);
    await call({ model: "other-model" });
    expect(requests[0].model).toBe("other-model");
  });

  it("retries once when the reply is not valid, then succeeds", async () => {
    const { call, requests, usageRows } = setup([reply("not json at all"), reply('{"answer":"ok"}')]);
    const result = await call();

    expect(result).toMatchObject({ ok: true, data: { answer: "ok" } });
    expect(requests).toHaveLength(2);
    expect(requests[1].user).toContain("prompt text");
    expect(requests[1].user).toContain("not valid");
    expect(usageRows.map((row) => row.status)).toEqual(["invalid_output", "ok"]);
  });

  it("gives up after one retry when the reply stays invalid", async () => {
    const { call, requests } = setup([reply('{"wrong":1}'), reply("{}")]);
    const result = await call();

    expect(result).toEqual({
      ok: false,
      reason: "invalid_output",
      message: "The AI reply could not be validated.",
    });
    expect(requests).toHaveLength(2); // the first try and exactly one retry
  });

  it("reports provider failures without leaking the error text", async () => {
    const { call, usageRows } = setup([
      new Error("401 Incorrect API key provided: sk-secret-123"),
      new Error("401 Incorrect API key provided: sk-secret-123"),
    ]);
    const result = await call();

    expect(result).toMatchObject({ ok: false, reason: "provider_error" });
    expect(JSON.stringify(result)).not.toContain("sk-secret-123");
    expect(usageRows.map((row) => row.status)).toEqual(["error", "error"]);
  });

  it("recovers when only the first attempt hits a provider error", async () => {
    const { call } = setup([new Error("timeout"), reply('{"answer":"fine"}')]);
    expect(await call()).toMatchObject({ ok: true, data: { answer: "fine" } });
  });

  it("returns not_configured when no provider can be built, without calling anything", async () => {
    const gateway = createGateway({
      getProvider: () => {
        throw new Error("Missing required environment variable: OPENAI_API_KEY");
      },
      getDb: () => ({}) as Database,
      defaultModel: () => "default-model",
    });
    const result = await gateway.callModel({
      tenantId: "t",
      usageTag: "x",
      system: "s",
      prompt: "p",
      schema,
      responseJsonSchema,
    });
    expect(result).toEqual({ ok: false, reason: "not_configured", message: "The AI service is not configured." });
  });

  it("still succeeds when usage logging fails", async () => {
    const { call } = setup([reply('{"answer":"hi"}')], { failUsageInsert: true });
    expect(await call()).toMatchObject({ ok: true });
  });

  it("never stores the prompt or the reply in the usage log", async () => {
    const { call, usageRows } = setup([reply('{"answer":"private-reply"}')]);
    await call({ prompt: "private-prompt" });
    const stored = JSON.stringify(usageRows);
    expect(stored).not.toContain("private-prompt");
    expect(stored).not.toContain("private-reply");
  });
});
