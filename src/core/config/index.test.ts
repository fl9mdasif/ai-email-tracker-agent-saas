import { describe, expect, it } from "vitest";
import { defaultModelFor, getConfig } from "./index";

describe("LLM provider config", () => {
  it("defaults to openai with no model override", () => {
    const config = getConfig({ NODE_ENV: "test" });
    expect(config.LLM_PROVIDER).toBe("openai");
    expect(config.LLM_MODEL).toBeUndefined();
  });

  it("treats blank LLM_PROVIDER and LLM_MODEL lines as not set", () => {
    const config = getConfig({ NODE_ENV: "test", LLM_PROVIDER: "", LLM_MODEL: "  " });
    expect(config.LLM_PROVIDER).toBe("openai");
    expect(config.LLM_MODEL).toBeUndefined();
  });

  it("accepts groq and an explicit model", () => {
    const config = getConfig({ NODE_ENV: "test", LLM_PROVIDER: "groq", LLM_MODEL: "some-model" });
    expect(config.LLM_PROVIDER).toBe("groq");
    expect(config.LLM_MODEL).toBe("some-model");
  });

  it("rejects an unknown provider", () => {
    expect(() => getConfig({ NODE_ENV: "test", LLM_PROVIDER: "other" })).toThrow(/LLM_PROVIDER/);
  });

  it("has a different default model per provider", () => {
    expect(defaultModelFor("openai")).toBe("gpt-4.1-mini");
    expect(defaultModelFor("groq")).not.toBe(defaultModelFor("openai"));
  });
});
