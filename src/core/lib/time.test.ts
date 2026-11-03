import { describe, expect, it } from "vitest";
import { isValidTimeZone, startOfTodayIn } from "./time";

describe("startOfTodayIn", () => {
  it("is local midnight in Dhaka (UTC+6, no daylight saving)", () => {
    // 2026-11-03 02:00 UTC is 08:00 in Dhaka, so today began at 2026-11-02 18:00 UTC.
    expect(startOfTodayIn("Asia/Dhaka", new Date("2026-11-03T02:00:00Z")).toISOString()).toBe("2026-11-02T18:00:00.000Z");
  });

  it("rolls over at local midnight, not at UTC midnight", () => {
    // 23:30 UTC is already 05:30 the next day in Dhaka.
    expect(startOfTodayIn("Asia/Dhaka", new Date("2026-11-03T23:30:00Z")).toISOString()).toBe("2026-11-03T18:00:00.000Z");
    // 17:59 UTC is 23:59 in Dhaka: still the same Dhaka day.
    expect(startOfTodayIn("Asia/Dhaka", new Date("2026-11-03T17:59:00Z")).toISOString()).toBe("2026-11-02T18:00:00.000Z");
  });

  it("is UTC midnight for UTC", () => {
    expect(startOfTodayIn("UTC", new Date("2026-11-03T15:00:00Z")).toISOString()).toBe("2026-11-03T00:00:00.000Z");
  });

  it("follows daylight saving", () => {
    // New York is UTC-5 in winter and UTC-4 in summer.
    expect(startOfTodayIn("America/New_York", new Date("2026-01-15T12:00:00Z")).toISOString()).toBe("2026-01-15T05:00:00.000Z");
    expect(startOfTodayIn("America/New_York", new Date("2026-07-15T12:00:00Z")).toISOString()).toBe("2026-07-15T04:00:00.000Z");
  });

  it("falls back to UTC for an unknown zone instead of throwing", () => {
    expect(startOfTodayIn("Not/AZone", new Date("2026-11-03T15:00:00Z")).toISOString()).toBe("2026-11-03T00:00:00.000Z");
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA names and rejects anything else", () => {
    expect(isValidTimeZone("Asia/Dhaka")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});
