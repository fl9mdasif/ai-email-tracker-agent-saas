import { describe, expect, it } from "vitest";
import { centsToInput, estimateMonthlyRevenue, formatMoney, parseMoneyToCents, parsePlanForm } from "./plans-pure";

const form = (values: Record<string, string>) => ({ get: (name: string) => (name in values ? values[name] : null) });
const valid = { key: "Starter", name: " Starter ", price: "19.50", currency: "USD", maxAccounts: "3", dailyAiLimit: "300", active: "on" };

describe("parseMoneyToCents", () => {
  it("reads whole and decimal prices", () => {
    expect(parseMoneyToCents("19")).toBe(1900);
    expect(parseMoneyToCents("19.5")).toBe(1950);
    expect(parseMoneyToCents("19.05")).toBe(1905);
    expect(parseMoneyToCents(" 1,299.99 ")).toBe(129_999);
    expect(parseMoneyToCents("0")).toBe(0);
  });

  it("rejects anything that is not a plain price", () => {
    for (const bad of ["", "-5", "abc", "19.999", "1e3", "$19", "19.", ".5", "12345678", "1 9"]) {
      expect(parseMoneyToCents(bad), bad).toBeNull();
    }
  });
});

describe("money display", () => {
  it("formats cents for a screen and for a form field", () => {
    expect(formatMoney(1900, "USD")).toBe("$19.00");
    expect(formatMoney(0, "USD")).toBe("$0.00");
    expect(centsToInput(1950)).toBe("19.50");
    expect(centsToInput(0)).toBe("0.00");
  });

  it("falls back to dollars for an unknown currency instead of throwing", () => {
    expect(formatMoney(1900, "XXX")).toBe("$19.00");
  });
});

describe("parsePlanForm", () => {
  it("reads a good form and tidies the key", () => {
    expect(parsePlanForm(form(valid))).toEqual({
      ok: true,
      value: { key: "starter", name: "Starter", priceMonthlyCents: 1950, currency: "USD", maxAccounts: 3, dailyAiLimit: 300, active: true },
    });
  });

  it("an unticked box means inactive", () => {
    const result = parsePlanForm(form({ ...valid, active: "" }));
    expect(result).toMatchObject({ ok: true, value: { active: false } });
  });

  it("refuses bad input with a readable message", () => {
    for (const change of [
      { price: "free" },
      { key: "x" },
      { key: "has space" },
      { name: "" },
      { currency: "DOGE" },
      { maxAccounts: "0" },
      { maxAccounts: "2.5" },
      { maxAccounts: "abc" },
      { dailyAiLimit: "-1" },
      { dailyAiLimit: "9999999" },
    ]) {
      const result = parsePlanForm(form({ ...valid, ...change }));
      expect(result.ok, JSON.stringify(change)).toBe(false);
      if (!result.ok) expect(result.message.length).toBeGreaterThan(3);
    }
  });
});

describe("estimateMonthlyRevenue", () => {
  const plans = [
    { id: "free", priceMonthlyCents: 0, currency: "USD" },
    { id: "starter", priceMonthlyCents: 1900, currency: "USD" },
    { id: "pro", priceMonthlyCents: 4900, currency: "USD" },
    { id: "local", priceMonthlyCents: 200_000, currency: "BDT" },
  ];

  it("adds each workspace once at its plan price, per currency", () => {
    expect(
      estimateMonthlyRevenue(plans, [
        { planId: "free", tenants: 10 },
        { planId: "starter", tenants: 2 },
        { planId: "pro", tenants: 1 },
        { planId: "local", tenants: 3 },
        { planId: null, tenants: 4 },
      ]),
    ).toEqual([
      { currency: "BDT", monthlyCents: 600_000 },
      { currency: "USD", monthlyCents: 8700 },
    ]);
  });

  it("is empty when nobody pays", () => {
    expect(estimateMonthlyRevenue(plans, [{ planId: "free", tenants: 5 }])).toEqual([]);
    expect(estimateMonthlyRevenue(plans, [])).toEqual([]);
  });
});
