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

describe("formatMailTime", () => {
  // 2026-11-03 08:00 in Dhaka.
  const now = new Date("2026-11-03T02:00:00Z");

  it("says Today, Yesterday, then the date", async () => {
    const { formatMailTime } = await import("./time");
    expect(formatMailTime(new Date("2026-11-03T01:05:00Z"), "Asia/Dhaka", now)).toBe("Today, 07:05");
    expect(formatMailTime(new Date("2026-11-02T20:30:00Z"), "Asia/Dhaka", now)).toBe("Today, 02:30");
    expect(formatMailTime(new Date("2026-11-02T15:00:00Z"), "Asia/Dhaka", now)).toBe("Yesterday, 21:00");
    expect(formatMailTime(new Date("2026-10-12T02:00:00Z"), "Asia/Dhaka", now)).toBe("12 Oct, 08:00");
    expect(formatMailTime(new Date("2025-03-02T02:00:00Z"), "Asia/Dhaka", now)).toBe("2 Mar 2025");
  });

  it("uses UTC for an unknown time zone instead of throwing", async () => {
    const { formatMailTime } = await import("./time");
    expect(formatMailTime(new Date("2026-11-03T01:05:00Z"), "Not/AZone", now)).toBe("Today, 01:05");
  });
});

describe("startOfLocalDate", () => {
  it("is the start of that calendar day in the zone", async () => {
    const { startOfLocalDate } = await import("./time");
    expect(startOfLocalDate("2026-11-05", "Asia/Dhaka")?.toISOString()).toBe("2026-11-04T18:00:00.000Z");
    expect(startOfLocalDate("2026-07-15", "America/New_York")?.toISOString()).toBe("2026-07-15T04:00:00.000Z");
    expect(startOfLocalDate("2026-07-15", "Pacific/Kiritimati")?.toISOString()).toBe("2026-07-14T10:00:00.000Z");
  });

  it("rejects text that is not a real date", async () => {
    const { startOfLocalDate } = await import("./time");
    expect(startOfLocalDate("2026-02-31", "UTC")).toBeNull();
    expect(startOfLocalDate("5 Nov", "UTC")).toBeNull();
    expect(startOfLocalDate("", "UTC")).toBeNull();
  });
});
