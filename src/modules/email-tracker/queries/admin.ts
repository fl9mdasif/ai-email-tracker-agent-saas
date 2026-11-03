import { sql } from "drizzle-orm";
import type { Database } from "@/core/db";
import { ANALYSIS_USAGE_TAG } from "../ai/analyze-email";

/**
 * Platform-wide numbers for the staff dashboard. Counts only: nothing here ever reads an email's
 * subject, text or sender, or an account's credentials.
 */
export type PlatformTotals = {
  tenants: number;
  /** Tenants where someone signed in during the last 7 days. */
  activeTenants7d: number;
  newTenants7d: number;
  accounts: number;
  accountsInError: number;
  emailsStored: number;
  emailsLast24h: number;
  analysesOkLast24h: number;
  analysesFailedLast24h: number;
};

export async function getPlatformTotals(db: Database, now: Date = new Date()): Promise<PlatformTotals> {
  const day = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const week = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const result = await db.execute(sql`
    select
      (select count(*) from tenants)::int as tenants,
      (select count(distinct tenant_id) from users where last_login_at >= ${week})::int as active_tenants,
      (select count(*) from tenants where created_at >= ${week})::int as new_tenants,
      (select count(*) from connected_accounts)::int as accounts,
      (select count(*) from connected_accounts where status = 'error')::int as accounts_in_error,
      (select count(*) from et_emails)::int as emails_stored,
      (select count(*) from et_emails where created_at >= ${day})::int as emails_24h,
      (select count(*) from llm_usage where usage_tag = ${ANALYSIS_USAGE_TAG} and status = 'ok' and created_at >= ${day})::int as analyses_ok,
      (select count(*) from llm_usage where usage_tag = ${ANALYSIS_USAGE_TAG} and status <> 'ok' and created_at >= ${day})::int as analyses_failed
  `);
  const row = (result.rows[0] ?? {}) as Record<string, number | undefined>;
  return {
    tenants: row.tenants ?? 0,
    activeTenants7d: row.active_tenants ?? 0,
    newTenants7d: row.new_tenants ?? 0,
    accounts: row.accounts ?? 0,
    accountsInError: row.accounts_in_error ?? 0,
    emailsStored: row.emails_stored ?? 0,
    emailsLast24h: row.emails_24h ?? 0,
    analysesOkLast24h: row.analyses_ok ?? 0,
    analysesFailedLast24h: row.analyses_failed ?? 0,
  };
}
