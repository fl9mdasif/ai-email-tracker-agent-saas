import { describe, expect, it } from "vitest";
import { filtersToQuery, parseMailFilters } from "./filters";

const id = "3f8c2c0e-7a5b-4d58-9f0e-2b6f1f3b7a11";

describe("parseMailFilters", () => {
  it("reads every filter", () => {
    expect(parseMailFilters({ q: " invoice ", account: id, category: "needs_reply", priority: "1", unread: "1", handled: "no" })).toEqual({
      query: "invoice",
      accountId: id,
      category: "needs_reply",
      priority: 1,
      unreadOnly: true,
      handled: "no",
    });
  });

  it("ignores anything unknown or malformed", () => {
    expect(parseMailFilters({ account: "x'; drop table", category: "nonsense", priority: "9", unread: "yes", handled: "maybe", q: "   " })).toEqual({});
    expect(parseMailFilters({})).toEqual({});
  });

  it("takes the first value when a parameter repeats, and caps a long search", () => {
    expect(parseMailFilters({ category: ["fyi_only", "spam"] }).category).toBe("fyi_only");
    expect(parseMailFilters({ q: "x".repeat(500) }).query).toHaveLength(100);
  });
});

describe("filtersToQuery", () => {
  it("round-trips through parseMailFilters", () => {
    const filters = parseMailFilters({ q: "price list", account: id, category: "lead_reply", priority: "2", unread: "1", handled: "yes" });
    const text = filtersToQuery(filters);
    const params = Object.fromEntries(new URLSearchParams(text.slice(1)));
    expect(parseMailFilters(params)).toEqual(filters);
  });

  it("is empty without filters and carries the page position", () => {
    expect(filtersToQuery({})).toBe("");
    expect(filtersToQuery({}, "123_abc")).toBe("?cursor=123_abc");
  });
});
