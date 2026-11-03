import { describe, expect, it } from "vitest";
import { fillDays } from "./admin-pure";

describe("fillDays", () => {
  const now = new Date("2026-11-03T15:00:00Z");

  it("gives one row per day, oldest first, ending today, with zeros for quiet days", () => {
    const rows = fillDays([{ day: "2026-11-03", calls: 7 }, { day: "2026-11-01", calls: 2 }], 4, now);
    expect(rows).toEqual([
      { day: "2026-10-31", calls: 0 },
      { day: "2026-11-01", calls: 2 },
      { day: "2026-11-02", calls: 0 },
      { day: "2026-11-03", calls: 7 },
    ]);
  });

  it("ignores days outside the window and copes with nothing at all", () => {
    expect(fillDays([{ day: "2020-01-01", calls: 99 }], 2, now)).toEqual([
      { day: "2026-11-02", calls: 0 },
      { day: "2026-11-03", calls: 0 },
    ]);
    expect(fillDays([], 30, now)).toHaveLength(30);
  });

  it("reads counts that arrive as text", () => {
    expect(fillDays([{ day: "2026-11-03", calls: "5" as unknown as number }], 1, now)).toEqual([{ day: "2026-11-03", calls: 5 }]);
  });

  it("crosses a month and a year boundary", () => {
    const rows = fillDays([], 3, new Date("2027-01-01T01:00:00Z"));
    expect(rows.map((row) => row.day)).toEqual(["2026-12-30", "2026-12-31", "2027-01-01"]);
  });
});
