import { describe, expect, it } from "vitest";
import { isScanDue } from "./scan-state";

const minutes = (n: number) => n * 60_000;
const now = new Date("2026-11-03T10:00:00Z");

describe("isScanDue", () => {
  it("is always due for a tenant that never scanned", () => {
    expect(isScanDue(null, now, 60)).toBe(true);
  });

  it("is not due before the interval has passed", () => {
    expect(isScanDue(new Date(now.getTime() - minutes(30)), now, 60)).toBe(false);
    expect(isScanDue(new Date(now.getTime() - minutes(5)), now, 15)).toBe(false);
  });

  it("is due once the interval has passed", () => {
    expect(isScanDue(new Date(now.getTime() - minutes(61)), now, 60)).toBe(true);
    expect(isScanDue(new Date(now.getTime() - minutes(600)), now, 600)).toBe(true);
  });

  it("is due on the tick that lands right at the interval, despite a few seconds of drift", () => {
    expect(isScanDue(new Date(now.getTime() - minutes(60) + 20_000), now, 60)).toBe(true);
  });
});
