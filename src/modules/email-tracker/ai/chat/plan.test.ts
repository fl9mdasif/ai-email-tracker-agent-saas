import { describe, expect, it } from "vitest";
import { EMAIL_CATEGORIES } from "../schema";
import { CHAT_PRESETS, findPreset } from "./presets";
import { EMPTY_PLAN, normalizePlan, resolvePeriod } from "./plan-pure";
import { MAX_CHAT_ROWS, queryPlanJsonSchema, queryPlanSchema } from "./schema";

describe("query plan schema", () => {
  it("accepts a good plan and every preset", () => {
    expect(queryPlanSchema.safeParse(EMPTY_PLAN).success).toBe(true);
    for (const preset of CHAT_PRESETS) expect(queryPlanSchema.safeParse(preset.plan).success, preset.id).toBe(true);
  });

  it("refuses anything outside the closed vocabulary", () => {
    const bad = [
      { ...EMPTY_PLAN, categories: ["invented"] },
      { ...EMPTY_PLAN, period: "forever" },
      { ...EMPTY_PLAN, handled: "maybe" },
      { ...EMPTY_PLAN, order: "random" },
      { ...EMPTY_PLAN, priority: 4 },
      { ...EMPTY_PLAN, limit: 0 },
      { ...EMPTY_PLAN, limit: MAX_CHAT_ROWS + 1 },
      { ...EMPTY_PLAN, senderContains: "x".repeat(61) },
      { ...EMPTY_PLAN, unreadOnly: "yes" },
      { categories: [] },
    ];
    for (const plan of bad) expect(queryPlanSchema.safeParse(plan).success, JSON.stringify(plan)).toBe(false);
  });

  it("the JSON schema sent to the model lists exactly the fields the validator expects", () => {
    expect(Object.keys(queryPlanJsonSchema.schema.properties).sort()).toEqual(Object.keys(EMPTY_PLAN).sort());
    expect([...queryPlanJsonSchema.schema.required].sort()).toEqual(Object.keys(EMPTY_PLAN).sort());
    expect(queryPlanJsonSchema.schema.properties.categories.items.enum).toEqual([...EMAIL_CATEGORIES]);
    expect(queryPlanJsonSchema.schema.additionalProperties).toBe(false);
  });
});

describe("normalizePlan", () => {
  it("removes repeats, blanks and stray spaces, lower-cases the address, and keeps the limit inside the cap", () => {
    const plan = normalizePlan({
      ...EMPTY_PLAN,
      categories: ["lead_reply", "lead_reply", "spam"],
      senderContains: "  Maria   Gomez ",
      subjectContains: "   ",
      accountEmail: "  Owner@Gmail.COM ",
      limit: 25,
    });
    expect(plan).toMatchObject({ categories: ["lead_reply", "spam"], senderContains: "Maria Gomez", subjectContains: null, accountEmail: "owner@gmail.com", limit: 25 });
  });

  it("never lets the limit go outside 1 to the fixed cap, even if validation was skipped", () => {
    expect(normalizePlan({ ...EMPTY_PLAN, limit: 500 }).limit).toBe(MAX_CHAT_ROWS);
    expect(normalizePlan({ ...EMPTY_PLAN, limit: -3 }).limit).toBe(1);
    expect(normalizePlan({ ...EMPTY_PLAN, limit: 7.9 }).limit).toBe(7);
  });
});

describe("resolvePeriod in the tenant's own time zone", () => {
  // 2026-11-03 08:00 in Dhaka (UTC+6): Dhaka's today began at 2026-11-02 18:00 UTC.
  const now = new Date("2026-11-03T02:00:00Z");

  it("today, yesterday, and rolling ranges start at local midnight", () => {
    expect(resolvePeriod("today", "Asia/Dhaka", now)).toMatchObject({ from: new Date("2026-11-02T18:00:00Z"), to: null, label: "today" });
    expect(resolvePeriod("yesterday", "Asia/Dhaka", now)).toMatchObject({ from: new Date("2026-11-01T18:00:00Z"), to: new Date("2026-11-02T18:00:00Z") });
    expect(resolvePeriod("last_7_days", "Asia/Dhaka", now).from).toEqual(new Date("2026-10-27T18:00:00Z"));
    expect(resolvePeriod("last_30_days", "Asia/Dhaka", now).from).toEqual(new Date("2026-10-04T18:00:00Z"));
  });

  it("all time has no bounds", () => {
    expect(resolvePeriod("all", "Asia/Dhaka", now)).toEqual({ from: null, to: null, label: "all time" });
  });

  it("the same instant is a different day in a different zone", () => {
    // 02:00 UTC is 21:00 on November 2 in New York (UTC-5), so its "today" began on the 2nd, while Dhaka is already on the 3rd.
    expect(resolvePeriod("today", "America/New_York", now).from).toEqual(new Date("2026-11-02T05:00:00Z"));
    expect(resolvePeriod("today", "Pacific/Kiritimati", now).from).toEqual(new Date("2026-11-02T10:00:00Z"));
  });

  it("crosses a daylight-saving change without landing on the wrong day", () => {
    // New York left daylight saving on 2026-11-01. "Last 7 days" counted from 2026-11-03 starts on 2026-10-28 local midnight (UTC-4).
    expect(resolvePeriod("last_7_days", "America/New_York", new Date("2026-11-03T15:00:00Z")).from).toEqual(new Date("2026-10-28T04:00:00Z"));
  });
});

describe("presets", () => {
  it("are the four chips, each with its own id and a plan that never asks for more than the cap", () => {
    expect(CHAT_PRESETS.map((preset) => preset.id)).toEqual(["needs-action", "follow-up", "leads", "today"]);
    for (const preset of CHAT_PRESETS) expect(preset.plan.limit).toBeLessThanOrEqual(MAX_CHAT_ROWS);
  });

  it("find a preset by id and nothing else", () => {
    expect(findPreset("leads")?.plan.categories).toEqual(["lead_reply"]);
    expect(findPreset("needs-action")?.plan).toMatchObject({ needsReply: true, handled: "no", order: "priority" });
    expect(findPreset("drop table")).toBeUndefined();
    expect(findPreset("")).toBeUndefined();
  });
});
