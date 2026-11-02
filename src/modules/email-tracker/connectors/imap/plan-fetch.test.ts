import { describe, expect, it } from "vitest";
import { FIRST_SYNC_LIMIT, MAX_PER_RUN, planFetch } from "./plan-fetch";

describe("planFetch", () => {
  it("reads the newest messages on the first sync", () => {
    expect(planFetch(null, "1700", 1001)).toEqual({ range: `${1000 - FIRST_SYNC_LIMIT + 1}:1000`, upTo: 1000 });
  });

  it("starts from UID 1 in a small mailbox", () => {
    expect(planFetch(null, "1700", 6)).toEqual({ range: "1:5", upTo: 5 });
  });

  it("does nothing for an empty mailbox", () => {
    expect(planFetch(null, "1700", 1)).toEqual({ range: null, upTo: 0 });
  });

  it("continues after the last UID it saw", () => {
    expect(planFetch({ uidValidity: "1700", lastUid: 40 }, "1700", 46)).toEqual({ range: "41:45", upTo: 45 });
  });

  it("does nothing when there is no new mail", () => {
    expect(planFetch({ uidValidity: "1700", lastUid: 45 }, "1700", 46)).toEqual({ range: null, upTo: 45 });
  });

  it("limits one run and leaves the rest for the next", () => {
    const plan = planFetch({ uidValidity: "1700", lastUid: 10 }, "1700", 10_000);
    expect(plan).toEqual({ range: `11:${10 + MAX_PER_RUN}`, upTo: 10 + MAX_PER_RUN });
  });

  it("starts over when the server renumbered the mailbox (UIDVALIDITY changed)", () => {
    expect(planFetch({ uidValidity: "1700", lastUid: 900 }, "1801", 301)).toEqual({
      range: `${300 - FIRST_SYNC_LIMIT + 1}:300`,
      upTo: 300,
    });
  });
});
