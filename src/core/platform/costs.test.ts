import { describe, expect, it } from "vitest";
import { estimateCostUsd, formatUsd, isCostKnown } from "./costs";

describe("estimateCostUsd", () => {
  it("prices tokens per million, input and output separately", () => {
    expect(estimateCostUsd("gpt-4.1-mini", 1_000_000, 0)).toBeCloseTo(0.4, 6);
    expect(estimateCostUsd("gpt-4.1-mini", 0, 1_000_000)).toBeCloseTo(1.6, 6);
    expect(estimateCostUsd("gpt-4.1-mini", 500_000, 250_000)).toBeCloseTo(0.6, 6);
  });

  it("recognises a dated model name as the same family", () => {
    expect(estimateCostUsd("gpt-4.1-mini-2025-04-14", 1_000_000, 0)).toBeCloseTo(0.4, 6);
  });

  it("counts the free test tier (Groq names) and unknown models as zero", () => {
    expect(estimateCostUsd("openai/gpt-oss-20b", 5_000_000, 5_000_000)).toBe(0);
    expect(estimateCostUsd("some-new-model", 1_000_000, 1_000_000)).toBe(0);
  });

  it("says whether the price is known", () => {
    expect(isCostKnown("gpt-4.1-mini")).toBe(true);
    expect(isCostKnown("openai/gpt-oss-20b")).toBe(true);
    expect(isCostKnown("some-new-model")).toBe(false);
  });
});

describe("formatUsd", () => {
  it("shows small amounts with enough digits and normal ones as dollars", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(0.0042)).toBe("$0.0042");
    expect(formatUsd(1.374)).toBe("$1.37");
  });
});
