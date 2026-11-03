import { EMAIL_CATEGORIES } from "../ai/schema";
import type { MailFilters } from "./dashboard";

type Params = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

/**
 * Turns the address's query string into safe filters. Anything unknown or malformed is simply
 * ignored, so a hand-edited address can never break the page or reach the database as raw text.
 */
export function parseMailFilters(params: Params): MailFilters {
  const filters: MailFilters = {};

  const account = first(params.account);
  if (account && /^[0-9a-f-]{36}$/i.test(account)) filters.accountId = account;

  const category = first(params.category);
  if (category && (EMAIL_CATEGORIES as readonly string[]).includes(category)) filters.category = category as MailFilters["category"];

  const priority = Number(first(params.priority));
  if (priority === 1 || priority === 2 || priority === 3) filters.priority = priority;

  if (first(params.unread) === "1") filters.unreadOnly = true;

  const handled = first(params.handled);
  if (handled === "yes" || handled === "no") filters.handled = handled;

  const query = first(params.q)?.trim();
  if (query) filters.query = query.slice(0, 100);

  return filters;
}

/** The filters as a query string, so "next page" and "clear" links keep the same view. */
export function filtersToQuery(filters: MailFilters, cursor?: string): string {
  const query = new URLSearchParams();
  if (filters.query) query.set("q", filters.query);
  if (filters.accountId) query.set("account", filters.accountId);
  if (filters.category) query.set("category", filters.category);
  if (filters.priority) query.set("priority", String(filters.priority));
  if (filters.unreadOnly) query.set("unread", "1");
  if (filters.handled) query.set("handled", filters.handled);
  if (cursor) query.set("cursor", cursor);
  const text = query.toString();
  return text ? `?${text}` : "";
}
