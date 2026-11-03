"use server";

import { revalidatePath } from "next/cache";
import { getConfig } from "@/core/config";
import { getConnector } from "@/core/connectors/registry";
import { getDb } from "@/core/db";
import { inngest } from "@/core/jobs/client";
import { requireModule } from "@/core/modules/guard";
import { AccountExistsError, deleteAccount, getAccount, saveCredentials } from "@/core/vault";
import { SYNC_ACCOUNT_EVENT } from "@/modules/email-tracker/jobs/events";
import { brandForPreset } from "@/modules/email-tracker/providers/brands";
import { registerEmailTrackerConnectors } from "@/modules/email-tracker/connectors";
import { GMAIL_PROVIDER } from "@/modules/email-tracker/connectors/gmail";
import { revokeGmailAccess } from "@/modules/email-tracker/connectors/gmail/revoke";
import { IMAP_PROVIDER } from "@/modules/email-tracker/connectors/imap";
import { IMAP_PRESETS } from "@/modules/email-tracker/connectors/imap/presets";
import {
  buildImapCredentials,
  imapAccountSchema,
  type ImapCredentials,
} from "@/modules/email-tracker/connectors/imap/schema";
import type { AccountField, AccountFormState } from "./form-state";

const MODULE_KEY = "email-tracker";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * "Test connection" (intent=test) checks the mailbox and stores nothing. "Save account"
 * (intent=save) tests first and stores the account, encrypted, only if the test passes.
 * The tenant always comes from the session, and no result ever contains the password.
 */
export async function accountFormAction(
  _previous: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const session = await requireModule(MODULE_KEY);
  const intent = text(formData, "intent") === "save" ? "save" : "test";

  const parsed = imapAccountSchema.safeParse({
    preset: text(formData, "preset"),
    email: text(formData, "email"),
    password: text(formData, "password"),
    label: text(formData, "label") || undefined,
  });
  if (!parsed.success) {
    const fieldErrors: AccountFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as AccountField | undefined;
      if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors };
  }

  registerEmailTrackerConnectors();
  const connector = getConnector<ImapCredentials>(IMAP_PROVIDER);
  if (!connector) return { status: "error", message: "This provider is not available.", fieldErrors: {} };

  const credentials = buildImapCredentials(parsed.data);
  const test = await connector.testConnection(credentials);
  if (!test.ok) return { status: "error", message: test.message, fieldErrors: {} };

  if (intent === "test") {
    return {
      status: "success",
      message: "The connection works. Press Save account to add this mailbox.",
      fieldErrors: {},
    };
  }

  try {
    await saveCredentials(getDb(), {
      tenantId: session.tenantId,
      provider: IMAP_PROVIDER,
      authType: connector.authType,
      label: parsed.data.label || IMAP_PRESETS[parsed.data.preset].label,
      identity: credentials.user,
      brand: brandForPreset(parsed.data.preset),
      credentials,
    });
  } catch (error) {
    if (error instanceof AccountExistsError) {
      return { status: "error", message: "This mailbox is already connected.", fieldErrors: {} };
    }
    // Deliberately no logging of the error: it could carry request data.
    return { status: "error", message: "Could not save the account. Please try again.", fieldErrors: {} };
  }

  revalidatePath("/dashboard/accounts");
  return { status: "success", message: "Account connected.", fieldErrors: {}, saved: true };
}

/**
 * Queues a background sync for one account. The sync itself never runs inside this request:
 * a worker (Inngest) picks the event up and runs it.
 */
export async function syncAccountNowAction(accountId: string): Promise<{ ok: boolean; message: string }> {
  const session = await requireModule(MODULE_KEY);
  if (!/^[0-9a-f-]{36}$/i.test(accountId)) return { ok: false, message: "Account not found." };

  // Only this tenant's own accounts can be synced.
  const account = await getAccount(getDb(), session.tenantId, accountId);
  if (!account) return { ok: false, message: "Account not found." };

  try {
    await inngest.send({
      name: SYNC_ACCOUNT_EVENT,
      data: { tenantId: session.tenantId, accountId },
    });
  } catch {
    const message =
      getConfig().NODE_ENV === "production"
        ? "Could not queue the sync. Please try again in a moment."
        : "Could not reach the background worker. Start it with npm run inngest:dev and try again.";
    return { ok: false, message };
  }
  return { ok: true, message: "Sync queued. New mail will appear in a moment." };
}

/** Removes an account of the signed-in tenant, together with its stored credentials. */
export async function disconnectAccountAction(accountId: string): Promise<void> {
  const session = await requireModule(MODULE_KEY);
  if (!/^[0-9a-f-]{36}$/i.test(accountId)) return;
  const db = getDb();
  const account = await getAccount(db, session.tenantId, accountId);
  // End the access on Google's side too, so a removed Gmail account cannot be read any more.
  if (account?.provider === GMAIL_PROVIDER) await revokeGmailAccess(db, session.tenantId, accountId);
  await deleteAccount(db, session.tenantId, accountId);
  revalidatePath("/dashboard/accounts");
}
