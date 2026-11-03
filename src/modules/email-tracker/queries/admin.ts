import { sql } from "drizzle-orm";
import type { Database } from "@/core/db";
import { estimateCostUsd } from "@/core/platform/costs";
import { ANALYSIS_USAGE_TAG } from "../ai/analyze-email";
import { fillDays } from "./admin-pure";
import { likePattern } from "./dashboard-pure";

/**
 * Platform-wide numbers for the staff dashboard. Counts and metadata only: nothing here ever reads an
 * email subject, text or sender, or an account credential.
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

// ---------------------------------------------------------------------------------------------
// Tenants (platform staff)

export type TenantOverviewRow = {
  id: string;
  name: string;
  ownerEmail: string | null;
  planKey: string | null;
  planName: string | null;
  status: "active" | "suspended";
  createdAt: Date;
  lastLoginAt: Date | null;
  accounts: number;
  mailLast24h: number;
  /** AI-detected leads: different senders of mail the AI marked "Lead replied". */
  leads: number;
  aiCalls30d: number;
  estCostUsd: number;
};

type CountByTenant = { tenant_id: string; n: number };

const byTenant = (rows: unknown[]): Map<string, number> => new Map((rows as CountByTenant[]).map((row) => [row.tenant_id, row.n]));

/** Per-tenant AI calls and estimated cost over the last 30 days, from the usage log. */
export async function getAiUsageByTenant(db: Database, now: Date): Promise<Map<string, { calls: number; costUsd: number }>> {
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const result = await db.execute(sql`
    select tenant_id, model, count(*)::int as calls,
      coalesce(sum(input_tokens), 0)::bigint as input_tokens,
      coalesce(sum(output_tokens), 0)::bigint as output_tokens
    from llm_usage
    where status = 'ok' and created_at >= ${since}
    group by tenant_id, model
  `);
  const usage = new Map<string, { calls: number; costUsd: number }>();
  for (const row of result.rows as Array<{ tenant_id: string; model: string; calls: number; input_tokens: string | number; output_tokens: string | number }>) {
    const entry = usage.get(row.tenant_id) ?? { calls: 0, costUsd: 0 };
    entry.calls += row.calls;
    entry.costUsd += estimateCostUsd(row.model, Number(row.input_tokens), Number(row.output_tokens));
    usage.set(row.tenant_id, entry);
  }
  return usage;
}

/** All workspaces, newest first, optionally narrowed by a search on the workspace name or the owner email. */
export async function listTenantsOverview(db: Database, options: { search?: string; now?: Date } = {}): Promise<TenantOverviewRow[]> {
  const now = options.now ?? new Date();
  const day = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const pattern = options.search ? likePattern(options.search) : null;

  const tenantRows = await db.execute(sql`
    select
      t.id, t.name, t.status, t.created_at,
      p.key as plan_key, p.name as plan_name,
      (select u.email from users u where u.tenant_id = t.id order by (u.role = 'owner') desc, u.created_at asc limit 1) as owner_email,
      (select max(u.last_login_at) from users u where u.tenant_id = t.id) as last_login_at
    from tenants t
    left join plans p on p.id = t.plan_id
    where ${pattern ? sql`(t.name ilike ${pattern} or exists (select 1 from users u where u.tenant_id = t.id and u.email ilike ${pattern}))` : sql`true`}
    order by t.created_at desc
    limit 200
  `);

  const [accounts, mail, leads, usage] = await Promise.all([
    db.execute(sql`select tenant_id, count(*)::int as n from connected_accounts group by tenant_id`),
    db.execute(sql`select tenant_id, count(*)::int as n from et_emails where created_at >= ${day} group by tenant_id`),
    db.execute(sql`
      select e.tenant_id, count(distinct e.from_address)::int as n
      from et_emails e join et_email_analysis a on a.email_id = e.id
      where a.status = 'analyzed' and a.category = 'lead_reply'
      group by e.tenant_id
    `),
    getAiUsageByTenant(db, now),
  ]);
  const accountCount = byTenant(accounts.rows);
  const mailCount = byTenant(mail.rows);
  const leadCount = byTenant(leads.rows);

  return (tenantRows.rows as Array<Record<string, unknown>>).map((row) => {
    const id = String(row.id);
    return {
      id,
      name: String(row.name),
      ownerEmail: row.owner_email ? String(row.owner_email) : null,
      planKey: row.plan_key ? String(row.plan_key) : null,
      planName: row.plan_name ? String(row.plan_name) : null,
      status: row.status === "suspended" ? "suspended" : "active",
      createdAt: new Date(String(row.created_at)),
      lastLoginAt: row.last_login_at ? new Date(String(row.last_login_at)) : null,
      accounts: accountCount.get(id) ?? 0,
      mailLast24h: mailCount.get(id) ?? 0,
      leads: leadCount.get(id) ?? 0,
      aiCalls30d: usage.get(id)?.calls ?? 0,
      estCostUsd: usage.get(id)?.costUsd ?? 0,
    };
  });
}

export type TenantDetail = TenantOverviewRow & {
  timezone: string;
  planId: string | null;
  aiDailyLimit: number | null;
  mailStored: number;
  accountList: Array<{ id: string; provider: string; identity: string; status: "connected" | "error"; statusMessage: string | null; lastSyncedAt: Date | null }>;
  recentRuns: Array<{ account: string; status: "running" | "success" | "error"; fetched: number; inserted: number; error: string | null; startedAt: Date }>;
  aiByDay: Array<{ day: string; calls: number }>;
  scan: { paused: boolean; lastScanStartedAt: Date | null };
};

/** One workspace in detail for platform staff, or null. Account rows carry no credentials, sync rows only safe messages. */
export async function getTenantDetail(db: Database, tenantId: string, now: Date = new Date()): Promise<TenantDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(tenantId)) return null;
  // The list query is reused for the headline numbers. The platform is small, so picking one row from it is fine for now.
  const overview = (await listTenantsOverview(db, { now })).find((row) => row.id === tenantId);
  if (!overview) return null;

  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [meta, accountList, runs, byDay, stored, scan] = await Promise.all([
    db.execute(sql`select timezone, plan_id, ai_daily_limit from tenants where id = ${tenantId}`),
    db.execute(sql`select id, provider, identity, status, status_message, last_synced_at from connected_accounts where tenant_id = ${tenantId} order by created_at asc`),
    db.execute(sql`
      select a.identity, r.status, r.fetched_count, r.inserted_count, r.error, r.started_at
      from et_sync_runs r join connected_accounts a on a.id = r.account_id and a.tenant_id = ${tenantId}
      where r.tenant_id = ${tenantId}
      order by r.started_at desc limit 15
    `),
    db.execute(sql`
      select to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as day, count(*)::int as calls
      from llm_usage where tenant_id = ${tenantId} and status = 'ok' and created_at >= ${since}
      group by 1
    `),
    db.execute(sql`select count(*)::int as n from et_emails where tenant_id = ${tenantId}`),
    db.execute(sql`select paused, last_scan_started_at from et_scan_state where tenant_id = ${tenantId}`),
  ]);

  const m = (meta.rows[0] ?? {}) as { timezone?: string; plan_id?: string | null; ai_daily_limit?: number | null };
  const s = (scan.rows[0] ?? {}) as { paused?: boolean; last_scan_started_at?: string | null };
  return {
    ...overview,
    timezone: m.timezone ?? "UTC",
    planId: m.plan_id ?? null,
    aiDailyLimit: m.ai_daily_limit ?? null,
    mailStored: ((stored.rows[0] ?? {}) as { n?: number }).n ?? 0,
    accountList: (accountList.rows as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      provider: String(row.provider),
      identity: String(row.identity),
      status: row.status === "error" ? "error" : "connected",
      statusMessage: row.status_message ? String(row.status_message) : null,
      lastSyncedAt: row.last_synced_at ? new Date(String(row.last_synced_at)) : null,
    })),
    recentRuns: (runs.rows as Array<Record<string, unknown>>).map((row) => ({
      account: String(row.identity),
      status: row.status === "error" ? "error" : row.status === "running" ? "running" : "success",
      fetched: Number(row.fetched_count),
      inserted: Number(row.inserted_count),
      error: row.error ? String(row.error) : null,
      startedAt: new Date(String(row.started_at)),
    })),
    aiByDay: fillDays(byDay.rows as Array<{ day: string; calls: number }>, 30, now),
    scan: { paused: s.paused === true, lastScanStartedAt: s.last_scan_started_at ? new Date(String(s.last_scan_started_at)) : null },
  };
}
