"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/core/db";
import { tenants } from "@/core/db/schema";
import { inngest } from "@/core/jobs/client";
import { writeAudit } from "@/core/platform/audit";
import type { Permission } from "@/core/platform/permissions";
import { type PlatformActor, authorize } from "@/core/platform/require-permission";
import { setTenantAiLimit, setTenantModule, setTenantPlan, setTenantStatus } from "@/core/platform/tenant-admin";
import { deleteTenant } from "@/core/tenancy/delete";
import { GMAIL_PROVIDER } from "@/modules/email-tracker/connectors/gmail";
import { revokeGmailAccess } from "@/modules/email-tracker/connectors/gmail/revoke";
import { ANALYZE_TENANT_EVENT } from "@/modules/email-tracker/jobs/events";
import { clearPause, markScanStarted } from "@/modules/email-tracker/scan/scan-state";
import { listAccounts } from "@/core/vault";

export type TenantActionResult = { ok: boolean; message: string };

const ID = /^[0-9a-f-]{36}$/i;
const REFUSED: TenantActionResult = { ok: false, message: "You do not have permission to do this." };
const NOT_FOUND: TenantActionResult = { ok: false, message: "Workspace not found." };

type Guarded = { actor: PlatformActor } | { refusal: TenantActionResult };

/** Every tenant action starts here: the person must hold the permission and the id must look like an id. */
async function guard(permission: Permission, tenantId: string): Promise<Guarded> {
  const actor = await authorize(permission);
  if (!actor) return { refusal: REFUSED };
  if (!ID.test(tenantId)) return { refusal: NOT_FOUND };
  return { actor };
}

async function audit(actor: PlatformActor, action: string, tenantId: string, details?: Record<string, unknown>) {
  await writeAudit(getDb(), { actorEmail: actor.email, actorRole: actor.role, action, targetType: "tenant", targetId: tenantId, details });
  revalidatePath("/admin/tenants");
  revalidatePath(`/admin/tenants/${tenantId}`);
}

/** Suspends or reactivates a workspace. Nobody can suspend their own workspace by accident. */
export async function setStatusAction(tenantId: string, status: "active" | "suspended"): Promise<TenantActionResult> {
  const g = await guard("tenants.manage", tenantId);
  if ("refusal" in g) return g.refusal;
  if (status === "suspended" && g.actor.tenantId === tenantId) return { ok: false, message: "You cannot suspend your own workspace." };
  const result = await setTenantStatus(getDb(), tenantId, status);
  if (!result.ok) return result;
  await audit(g.actor, status === "suspended" ? "tenant.suspend" : "tenant.reactivate", tenantId);
  return { ok: true, message: status === "suspended" ? "Workspace suspended." : "Workspace reactivated." };
}

export async function changePlanAction(tenantId: string, planId: string): Promise<TenantActionResult> {
  const g = await guard("tenants.manage", tenantId);
  if ("refusal" in g) return g.refusal;
  const result = await setTenantPlan(getDb(), tenantId, planId);
  if (!result.ok) return result;
  await audit(g.actor, "tenant.change_plan", tenantId, { planId });
  return { ok: true, message: "Plan changed." };
}

/** An empty value clears the override, so the plan's own limit applies again. */
export async function setAiLimitAction(tenantId: string, raw: string): Promise<TenantActionResult> {
  const g = await guard("tenants.manage", tenantId);
  if ("refusal" in g) return g.refusal;
  const text = raw.trim();
  const limit = text === "" ? null : /^\d{1,6}$/.test(text) ? Number(text) : Number.NaN;
  const result = await setTenantAiLimit(getDb(), tenantId, Number.isNaN(limit) ? -1 : limit);
  if (!result.ok) return result;
  await audit(g.actor, "tenant.set_ai_limit", tenantId, { limit });
  return { ok: true, message: limit === null ? "Limit cleared: the plan's limit applies." : "Daily AI limit saved." };
}

export async function setModuleAction(tenantId: string, moduleKey: string, enabled: boolean): Promise<TenantActionResult> {
  const g = await guard("tenants.manage", tenantId);
  if ("refusal" in g) return g.refusal;
  const result = await setTenantModule(getDb(), tenantId, moduleKey, enabled);
  if (!result.ok) return result;
  await audit(g.actor, enabled ? "tenant.module_on" : "tenant.module_off", tenantId, { module: moduleKey });
  return { ok: true, message: enabled ? "Module switched on." : "Module switched off." };
}

/** Starts an AI scan of the workspace's mail from today right now. */
export async function scanNowAction(tenantId: string): Promise<TenantActionResult> {
  const g = await guard("tenants.manage", tenantId);
  if ("refusal" in g) return g.refusal;
  const db = getDb();
  const [tenant] = await db.select({ status: tenants.status }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) return NOT_FOUND;
  if (tenant.status === "suspended") return { ok: false, message: "This workspace is suspended. Reactivate it first." };
  await markScanStarted(db, tenantId);
  try {
    await inngest.send({ name: ANALYZE_TENANT_EVENT, data: { tenantId } });
  } catch {
    return { ok: false, message: "Could not reach the background worker. Is it running?" };
  }
  await audit(g.actor, "tenant.scan_now", tenantId);
  return { ok: true, message: "Scan started." };
}

/** Lets automatic scans run again for a workspace whose user pressed Cancel. */
export async function clearPauseAction(tenantId: string): Promise<TenantActionResult> {
  const g = await guard("health.act", tenantId);
  if ("refusal" in g) return g.refusal;
  await clearPause(getDb(), tenantId);
  await audit(g.actor, "tenant.clear_pause", tenantId);
  return { ok: true, message: "Automatic scans will run again." };
}

/**
 * Deletes a workspace and everything in it, after the person types its name. Gmail access is
 * cancelled with Google first. Nobody can delete their own workspace here (they have a button in
 * their own Settings). The audit row keeps the id, never the name.
 */
export async function deleteTenantAction(tenantId: string, confirmation: string): Promise<TenantActionResult> {
  const g = await guard("tenants.delete", tenantId);
  if ("refusal" in g) return g.refusal;
  if (g.actor.tenantId === tenantId) return { ok: false, message: "You cannot delete your own workspace from here. Use Settings in your own dashboard." };

  const db = getDb();
  const [tenant] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) return NOT_FOUND;
  if (confirmation.trim() !== tenant.name.trim()) return { ok: false, message: "The name does not match. Nothing was deleted." };

  for (const account of await listAccounts(db, tenantId)) {
    if (account.provider === GMAIL_PROVIDER) await revokeGmailAccess(db, tenantId, account.id);
  }
  if (!(await deleteTenant(db, tenantId))) return NOT_FOUND;
  await audit(g.actor, "tenant.delete", tenantId);
  return { ok: true, message: "Workspace deleted." };
}
