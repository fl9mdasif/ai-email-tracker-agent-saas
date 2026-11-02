"use server";

import { revalidatePath } from "next/cache";
import { getConnector } from "@/core/connectors/registry";
import { getDb } from "@/core/db";
import { requireModule } from "@/core/modules/guard";
import { AccountExistsError, deleteAccount, saveCredentials } from "@/core/vault";
import { registerEmailTrackerConnectors } from "@/modules/email-tracker/connectors";
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
  return { status: "success", message: "Account connected.", fieldErrors: {} };
}

/** Removes an account of the signed-in tenant, together with its stored credentials. */
export async function disconnectAccountAction(accountId: string): Promise<void> {
  const session = await requireModule(MODULE_KEY);
  if (!/^[0-9a-f-]{36}$/i.test(accountId)) return;
  await deleteAccount(getDb(), session.tenantId, accountId);
  revalidatePath("/dashboard/accounts");
}
