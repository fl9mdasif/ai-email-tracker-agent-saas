"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/core/db";
import { writeAudit } from "@/core/platform/audit";
import { createPlan, setDefaultPlan, updatePlan } from "@/core/platform/plans";
import { parsePlanForm } from "@/core/platform/plans-pure";
import { authorize } from "@/core/platform/require-permission";

export type PlanFormState = { status: "idle" | "success" | "error"; message: string };

export const initialPlanFormState: PlanFormState = { status: "idle", message: "" };

const NO_PERMISSION = "You do not have permission to change plans.";

/** Creates a plan, or edits one when the form carries its id. Only the roles allowed to manage plans can do this; it is audited. */
export async function savePlanAction(_previous: PlanFormState, formData: FormData): Promise<PlanFormState> {
  const actor = await authorize("plans.manage");
  if (!actor) return { status: "error", message: NO_PERMISSION };

  const parsed = parsePlanForm(formData);
  if (!parsed.ok) return { status: "error", message: parsed.message };

  const db = getDb();
  const planId = typeof formData.get("planId") === "string" ? (formData.get("planId") as string) : "";
  const { key, ...rest } = parsed.value;
  const result = planId ? await updatePlan(db, planId, rest) : await createPlan(db, parsed.value);
  if (!result.ok) return { status: "error", message: result.message };

  await writeAudit(db, {
    actorEmail: actor.email,
    actorRole: actor.role,
    action: planId ? "plan.update" : "plan.create",
    targetType: "plan",
    targetId: result.id,
    details: { key, priceMonthlyCents: rest.priceMonthlyCents, currency: rest.currency, maxAccounts: rest.maxAccounts, dailyAiLimit: rest.dailyAiLimit, active: rest.active },
  });
  revalidatePath("/admin/plans");
  return { status: "success", message: planId ? "Plan saved." : "Plan created." };
}

/** Makes a plan the one new workspaces start on. */
export async function makeDefaultPlanAction(planId: string): Promise<PlanFormState> {
  const actor = await authorize("plans.manage");
  if (!actor) return { status: "error", message: NO_PERMISSION };

  const db = getDb();
  const result = await setDefaultPlan(db, planId, actor.email);
  if (!result.ok) return { status: "error", message: result.message };

  await writeAudit(db, { actorEmail: actor.email, actorRole: actor.role, action: "plan.set_default", targetType: "plan", targetId: planId });
  revalidatePath("/admin/plans");
  return { status: "success", message: "This is now the default plan." };
}
