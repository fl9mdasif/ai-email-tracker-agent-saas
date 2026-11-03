import { describe, expect, it } from "vitest";
import { CHAT_LIMITS, computeQuota, describeBlock } from "./rate-limit";

const now = new Date("2026-11-03T12:00:00Z");
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
const many = (count: number, minutes: number) => Array.from({ length: count }, () => minutesAgo(minutes));

describe("computeQuota", () => {
  it("allows a fresh workspace and shows the full allowance", () => {
    expect(computeQuota([], now)).toEqual({
      usedLastHour: 0,
      usedLastDay: 0,
      leftThisHour: CHAT_LIMITS.perHour,
      leftToday: CHAT_LIMITS.perDay,
      allowed: true,
      blockedBy: null,
      retryAfterMinutes: null,
    });
  });

  it("counts the last hour and the last 24 hours separately", () => {
    const quota = computeQuota([...many(3, 10), ...many(5, 120)], now);
    expect(quota).toMatchObject({ usedLastHour: 3, usedLastDay: 8, leftThisHour: 17, leftToday: 92, allowed: true });
  });

  it("stops the 21st question in an hour and says when to come back", () => {
    const quota = computeQuota([...many(19, 5), minutesAgo(50)], now);
    expect(quota.allowed).toBe(false);
    expect(quota.blockedBy).toBe("hour");
    expect(quota.leftThisHour).toBe(0);
    // The oldest counted question was 50 minutes ago, so a slot opens in 10 minutes.
    expect(quota.retryAfterMinutes).toBe(10);
  });

  it("the 20th question is still allowed", () => {
    expect(computeQuota(many(19, 5), now)).toMatchObject({ allowed: true, leftThisHour: 1 });
  });

  it("stops at the daily limit even when the hour is quiet", () => {
    const quota = computeQuota(Array.from({ length: 100 }, (_, index) => minutesAgo(90 + index * 10)), now);
    expect(quota.blockedBy).toBe("day");
    expect(quota.allowed).toBe(false);
    expect(quota.retryAfterMinutes).toBeGreaterThanOrEqual(1);
  });

  it("frees up as questions age out of the window", () => {
    expect(computeQuota(many(20, 61), now)).toMatchObject({ allowed: true, usedLastHour: 0 });
    expect(computeQuota(many(100, 24 * 60 + 1), now)).toMatchObject({ allowed: true, usedLastDay: 0 });
  });

  it("ignores times in the future instead of counting them", () => {
    expect(computeQuota([new Date(now.getTime() + 60_000)], now).usedLastHour).toBe(0);
  });

  it("describes a refusal in plain words, and nothing when allowed", () => {
    expect(describeBlock(computeQuota(many(20, 5), now))).toMatch(/all 20 questions for this hour.*55 minutes/);
    expect(describeBlock(computeQuota([], now))).toBe("");
  });
});
