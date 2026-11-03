import { describe, expect, it } from "vitest";
import {
  decodeCursor,
  encodeCursor,
  groupByPriority,
  groupFollowUps,
  likePattern,
  reminderDueDate,
  startOfTomorrowIn,
} from "./dashboard-pure";

// 2026-11-03 08:00 in Dhaka (UTC+6) is 02:00 UTC; Dhaka's "today" began at 2026-11-02 18:00 UTC.
const now = new Date("2026-11-03T02:00:00Z");
const zone = "Asia/Dhaka";

describe("likePattern", () => {
  it("wraps the text and matches it literally", () => {
    expect(likePattern("invoice")).toBe("%invoice%");
    expect(likePattern("100%_off\\")).toBe("%100\\%\\_off\\\\%");
  });

  it("gives null for empty or blank input and caps long input", () => {
    expect(likePattern("")).toBeNull();
    expect(likePattern("   ")).toBeNull();
    expect(likePattern("x".repeat(500))).toBe(`%${"x".repeat(100)}%`);
  });
});

describe("dates in the tenant's time zone", () => {
  it("finds the start of tomorrow", () => {
    expect(startOfTomorrowIn(zone, now).toISOString()).toBe("2026-11-03T18:00:00.000Z");
  });

  it("puts reminders at the start of the chosen local day", () => {
    expect(reminderDueDate("tomorrow", zone, now).toISOString()).toBe("2026-11-03T18:00:00.000Z");
    expect(reminderDueDate("three_days", zone, now).toISOString()).toBe("2026-11-05T18:00:00.000Z");
    expect(reminderDueDate("one_week", zone, now).toISOString()).toBe("2026-11-09T18:00:00.000Z");
  });

  it("keeps working across a daylight-saving change", () => {
    // New York ends daylight saving on 2026-11-01 (UTC-4 becomes UTC-5).
    const before = new Date("2026-10-31T16:00:00Z");
    expect(reminderDueDate("three_days", "America/New_York", before).toISOString()).toBe("2026-11-03T05:00:00.000Z");
  });
});

describe("groupFollowUps", () => {
  const at = (iso: string) => ({ dueAt: new Date(iso), name: iso });

  it("splits into overdue, today and upcoming, oldest first", () => {
    const groups = groupFollowUps(
      [
        at("2026-11-05T18:00:00Z"),
        at("2026-11-02T10:00:00Z"), // before Dhaka's today (starts 2026-11-02T18:00Z)
        at("2026-11-03T03:00:00Z"), // today
        at("2026-11-03T18:00:00Z"), // tomorrow starts here
        at("2026-10-30T10:00:00Z"),
      ],
      zone,
      now,
    );
    expect(groups.overdue.map((item) => item.name)).toEqual(["2026-10-30T10:00:00Z", "2026-11-02T10:00:00Z"]);
    expect(groups.today.map((item) => item.name)).toEqual(["2026-11-03T03:00:00Z"]);
    expect(groups.upcoming.map((item) => item.name)).toEqual(["2026-11-03T18:00:00Z", "2026-11-05T18:00:00Z"]);
  });

  it("handles an empty list", () => {
    expect(groupFollowUps([], zone, now)).toEqual({ overdue: [], today: [], upcoming: [] });
  });
});

describe("groupByPriority", () => {
  it("groups by priority and separates mail the AI has not seen", () => {
    const rows = [
      { id: "a", analysis: { priority: 1 } },
      { id: "b", analysis: { priority: 3 } },
      { id: "c", analysis: null },
      { id: "d", analysis: { priority: 2 } },
      { id: "e", analysis: { priority: 1 } },
    ];
    const groups = groupByPriority(rows);
    expect(groups.p1.map((row) => row.id)).toEqual(["a", "e"]);
    expect(groups.p2.map((row) => row.id)).toEqual(["d"]);
    expect(groups.p3.map((row) => row.id)).toEqual(["b"]);
    expect(groups.unscanned.map((row) => row.id)).toEqual(["c"]);
  });
});

describe("cursor", () => {
  const id = "3f8c2c0e-7a5b-4d58-9f0e-2b6f1f3b7a11";

  it("round-trips", () => {
    expect(decodeCursor(encodeCursor({ receivedAtMs: 1_762_000_000_000, id }))).toEqual({ receivedAtMs: 1_762_000_000_000, id });
  });

  it("treats anything malformed as the first page", () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor("")).toBeNull();
    expect(decodeCursor("abc_def")).toBeNull();
    expect(decodeCursor(`123_${id}; drop table`)).toBeNull();
  });
});
