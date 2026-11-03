import { z } from "zod";

export const CURRENCIES = ["USD", "EUR", "GBP", "BDT"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** "19", "19.5" or "19.50" into cents. Anything else (negative, text, three decimals, huge) gives null. */
export function parseMoneyToCents(input: string): number | null {
  const text = input.trim().replace(/,/g, "");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

/** Cents as a price for a screen, for example 1900 USD becomes "$19.00". */
export function formatMoney(cents: number, currency: string): string {
  const code = (CURRENCIES as readonly string[]).includes(currency) ? currency : "USD";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(cents / 100);
}

/** The price field of a form (dollars) shown back as plain digits: 1900 becomes "19.00". */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** What a super admin may enter for a plan. Everything is checked again on the server. */
export const planInputSchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,29}$/, "Use 2 to 30 letters, digits or dashes, for example starter."),
  name: z.string().trim().min(1, "Give the plan a name.").max(40, "Keep the name under 40 characters."),
  priceMonthlyCents: z.number().int().min(0).max(999_999_999),
  currency: z.enum(CURRENCIES),
  maxAccounts: z.number().int().min(1, "At least 1 account.").max(100, "At most 100 accounts."),
  dailyAiLimit: z.number().int().min(0, "Zero or more.").max(100_000, "At most 100,000 a day."),
  active: z.boolean(),
});

export type PlanInput = z.infer<typeof planInputSchema>;

/** Reads the plan form. Prices are typed in whole units (19.00), everything else as numbers. */
export function parsePlanForm(form: { get(name: string): FormDataEntryValue | null }): { ok: true; value: PlanInput } | { ok: false; message: string } {
  const text = (name: string) => (typeof form.get(name) === "string" ? (form.get(name) as string) : "");
  const cents = parseMoneyToCents(text("price"));
  if (cents === null) return { ok: false, message: "Enter the price like 19 or 19.50." };
  const parsed = planInputSchema.safeParse({
    key: text("key"),
    name: text("name"),
    priceMonthlyCents: cents,
    currency: text("currency"),
    maxAccounts: Number(text("maxAccounts")),
    dailyAiLimit: Number(text("dailyAiLimit")),
    active: text("active") === "on",
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Please check the plan details." };
  return { ok: true, value: parsed.data };
}

export type PlanUsage = { planId: string | null; tenants: number };
export type PlanRevenue = { currency: string; monthlyCents: number };

/** Estimated monthly revenue per currency: each active workspace counts once at its plan's price. Currencies are never mixed. */
export function estimateMonthlyRevenue(
  plans: Array<{ id: string; priceMonthlyCents: number; currency: string }>,
  usage: PlanUsage[],
): PlanRevenue[] {
  const tenantsByPlan = new Map(usage.map((entry) => [entry.planId, entry.tenants]));
  const totals = new Map<string, number>();
  for (const plan of plans) {
    const count = tenantsByPlan.get(plan.id) ?? 0;
    if (count > 0 && plan.priceMonthlyCents > 0) totals.set(plan.currency, (totals.get(plan.currency) ?? 0) + plan.priceMonthlyCents * count);
  }
  return [...totals.entries()].map(([currency, monthlyCents]) => ({ currency, monthlyCents })).sort((a, b) => a.currency.localeCompare(b.currency));
}
