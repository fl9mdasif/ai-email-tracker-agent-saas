/**
 * What the AI costs, estimated from token counts. Prices change, so the usage log stores tokens
 * and this table turns them into money at report time. These are estimates for planning prices:
 * check the provider's current price list before relying on them.
 */
const PRICES_USD_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
};

/** The price row for a model name. A dated name such as "gpt-4.1-mini-2025-04-14" matches its family. */
function priceFor(model: string): { input: number; output: number } | null {
  const keys = Object.keys(PRICES_USD_PER_MILLION_TOKENS).sort((a, b) => b.length - a.length);
  const key = keys.find((candidate) => model.startsWith(candidate));
  return key ? PRICES_USD_PER_MILLION_TOKENS[key] : null;
}

/** Groq-style names ("openai/gpt-oss-20b") run on the free test tier, so they cost nothing. */
function isFreeTier(model: string): boolean {
  return model.includes("/");
}

/** Estimated cost in US dollars. Free-tier and unknown models count as zero. */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  if (isFreeTier(model)) return 0;
  const price = priceFor(model);
  if (!price) return 0;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

/** Whether we know what this model costs (free tier counts as known). Lets screens say "unknown model" instead of $0. */
export function isCostKnown(model: string): boolean {
  return isFreeTier(model) || priceFor(model) !== null;
}

/** A small dollar amount for a screen: $0.0042, $1.37. */
export function formatUsd(amount: number): string {
  if (amount === 0) return "$0.00";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}
