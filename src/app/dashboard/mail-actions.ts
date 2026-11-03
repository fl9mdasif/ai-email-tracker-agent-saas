"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/core/db";
import { startOfLocalDate } from "@/core/lib/time";
import { requireModule } from "@/core/modules/guard";
import { getTodayWindow } from "@/modules/email-tracker/scan/scan-state";
import { type ReminderPreset, reminderDueDate } from "@/modules/email-tracker/queries/dashboard-pure";
import { analyzeSingleEmail } from "@/modules/email-tracker/ai/analyze-pending";
import { createReminder, setFollowUpStatus, setHandled } from "@/modules/email-tracker/queries/mutations";

const MODULE_KEY = "email-tracker";

export type ActionResult = { ok: boolean; message: string };

/** Every page that lists mail or follow-ups is re-read after a change. */
function refresh(): void {
  for (const path of ["/dashboard", "/dashboard/needs-reply", "/dashboard/follow-ups", "/dashboard/mail"]) revalidatePath(path);
}

const idSchema = z.string().regex(/^[0-9a-f-]{36}$/i);
const presetSchema = z.enum(["tomorrow", "three_days", "one_week"]);

/** Marks a mail handled (or undoes it). The tenant comes from the session. */
export async function setHandledAction(emailId: string, handled: boolean): Promise<ActionResult> {
  const session = await requireModule(MODULE_KEY);
  if (!idSchema.safeParse(emailId).success) return { ok: false, message: "Email not found." };
  const done = await setHandled(getDb(), session.tenantId, emailId, handled);
  if (!done) return { ok: false, message: "Email not found." };
  refresh();
  return { ok: true, message: handled ? "Marked as handled." : "Moved back to your list." };
}

/** Adds a reminder, either a preset (tomorrow, in 3 days, in a week) or a chosen calendar date. */
export async function remindAction(emailId: string, when: ReminderPreset | { date: string }, reason = ""): Promise<ActionResult> {
  const session = await requireModule(MODULE_KEY);
  if (!idSchema.safeParse(emailId).success) return { ok: false, message: "Email not found." };

  const db = getDb();
  const now = new Date();
  const { timeZone } = await getTodayWindow(db, session.tenantId, now);

  let dueAt: Date | null;
  if (typeof when === "string") {
    const preset = presetSchema.safeParse(when);
    dueAt = preset.success ? reminderDueDate(preset.data, timeZone, now) : null;
  } else {
    dueAt = startOfLocalDate(when.date, timeZone);
    // A date in the past would be "overdue" the moment it is made; ask for today or later.
    if (dueAt && dueAt.getTime() < now.getTime() - 24 * 60 * 60 * 1000) dueAt = null;
  }
  if (!dueAt) return { ok: false, message: "Pick a valid date, today or later." };

  const id = await createReminder(db, session.tenantId, emailId, dueAt, reason);
  if (!id) return { ok: false, message: "Email not found." };
  refresh();
  return { ok: true, message: "Reminder set." };
}

/** Marks a follow-up done or dismissed, or opens it again. */
export async function followUpStatusAction(followUpId: string, status: "open" | "done" | "dismissed"): Promise<ActionResult> {
  const session = await requireModule(MODULE_KEY);
  if (!idSchema.safeParse(followUpId).success) return { ok: false, message: "Follow-up not found." };
  const done = await setFollowUpStatus(getDb(), session.tenantId, followUpId, status);
  if (!done) return { ok: false, message: "Follow-up not found." };
  refresh();
  return { ok: true, message: status === "open" ? "Follow-up reopened." : status === "done" ? "Marked done." : "Dismissed." };
}

/** Runs the AI on one email now, for mail the automatic scan skipped (older than today). */
export async function analyzeEmailNowAction(emailId: string): Promise<ActionResult> {
  const session = await requireModule(MODULE_KEY);
  if (!idSchema.safeParse(emailId).success) return { ok: false, message: "Email not found." };
  const outcome = await analyzeSingleEmail(getDb(), session.tenantId, emailId);
  if (!outcome.ok) return { ok: false, message: outcome.message };
  refresh();
  revalidatePath(`/dashboard/mail/${emailId}`);
  return { ok: true, message: "Analyzed." };
}
