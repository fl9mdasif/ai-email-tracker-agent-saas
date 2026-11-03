import { describe, expect, it } from "vitest";
import { ADMIN_NAV_ITEM, BASE_NAV_ITEMS, PHONE_PRIMARY_HREFS, isActive, navItemsFor, splitForPhone } from "./nav-items";

describe("menu items", () => {
  it("has Chat for everyone and Platform only for staff", () => {
    expect(navItemsFor(false).map((item) => item.href)).toContain("/dashboard/chat");
    expect(navItemsFor(false)).not.toContain(ADMIN_NAV_ITEM);
    expect(navItemsFor(true)[navItemsFor(true).length - 1]).toBe(ADMIN_NAV_ITEM);
  });

  it("never repeats an address", () => {
    const hrefs = navItemsFor(true).map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("splitForPhone", () => {
  it("gives the four main buttons in a fixed order, and everything else goes under More", () => {
    const { primary, more } = splitForPhone(BASE_NAV_ITEMS);
    expect(primary.map((item) => item.href)).toEqual([...PHONE_PRIMARY_HREFS]);
    expect(more.map((item) => item.href)).toEqual(["/dashboard/follow-ups", "/dashboard/accounts", "/dashboard/settings"]);
  });

  it("puts Platform under More for staff", () => {
    const { primary, more } = splitForPhone(navItemsFor(true));
    expect(primary).toHaveLength(4);
    expect(more.map((item) => item.href)).toContain("/admin");
  });

  it("loses nothing and repeats nothing", () => {
    for (const showAdmin of [false, true]) {
      const items = navItemsFor(showAdmin);
      const { primary, more } = splitForPhone(items);
      expect([...primary, ...more].map((item) => item.href).sort()).toEqual(items.map((item) => item.href).sort());
    }
  });
});

describe("isActive", () => {
  it("Today is only its own page", () => {
    expect(isActive("/dashboard", "/dashboard")).toBe(true);
    expect(isActive("/dashboard/chat", "/dashboard")).toBe(false);
  });

  it("other items also cover the pages under them, but not look-alike addresses", () => {
    expect(isActive("/dashboard/mail", "/dashboard/mail")).toBe(true);
    expect(isActive("/dashboard/mail/3f8c", "/dashboard/mail")).toBe(true);
    expect(isActive("/dashboard/mailbox", "/dashboard/mail")).toBe(false);
    expect(isActive("/dashboard/chat", "/dashboard/mail")).toBe(false);
  });
});
