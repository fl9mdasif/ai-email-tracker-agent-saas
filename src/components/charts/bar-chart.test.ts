import { describe, expect, it } from "vitest";
import { niceMax } from "./bar-chart";

describe("niceMax", () => {
  it("never goes below 4, so a nearly empty chart still has a sensible scale", () => {
    expect(niceMax(0)).toBe(4);
    expect(niceMax(1)).toBe(4);
    expect(niceMax(4)).toBe(4);
  });

  it("rounds up to a clean number at or above the data", () => {
    expect(niceMax(5)).toBe(5);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(11)).toBe(20);
    expect(niceMax(23)).toBe(25);
    expect(niceMax(26)).toBe(50);
    expect(niceMax(51)).toBe(100);
    expect(niceMax(130)).toBe(200);
    expect(niceMax(1234)).toBe(2000);
  });

  it("is always at least the largest value", () => {
    for (const value of [3, 9, 17, 48, 99, 101, 777, 4500, 99_999]) expect(niceMax(value)).toBeGreaterThanOrEqual(value);
  });
});
