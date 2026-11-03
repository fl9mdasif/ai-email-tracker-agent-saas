import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAppUrl } from "@/core/config";
import { getDb } from "@/core/db";
import { inngest } from "@/core/jobs/client";
import { requireModule } from "@/core/modules/guard";
import { findAccountByIdentity, saveCredentials, updateCredentials } from "@/core/vault";
import { GMAIL_PROVIDER } from "@/modules/email-tracker/connectors/gmail";
import { GmailError } from "@/modules/email-tracker/connectors/gmail/errors";
import { getGmailAddress } from "@/modules/email-tracker/connectors/gmail/fetch-messages";
import { OAUTH_RETURN_COOKIE, OAUTH_STATE_COOKIE, isValidOAuthState } from "@/modules/email-tracker/connectors/gmail/oauth-state";
import { GMAIL_SEND_SCOPE } from "@/modules/email-tracker/connectors/gmail/schema";
import { exchangeCode } from "@/modules/email-tracker/connectors/gmail/tokens";
import { SYNC_ACCOUNT_EVENT } from "@/modules/email-tracker/jobs/events";

type Outcome = "connected" | "reconnected" | "denied" | "error" | "api_disabled" | "scope" | "send_allowed" | "send_denied";

/** Back to Accounts, or (after Allow sending) back to the lead whose draft is waiting. */
function back(outcome: Outcome, leadId: string | null): NextResponse {
  const target = leadId ? `/dashboard/leads/${leadId}` : "/dashboard/accounts";
  const response = NextResponse.redirect(`${getAppUrl()}${target}?gmail=${outcome}`);
  response.cookies.delete({ name: OAUTH_STATE_COOKIE, path: "/api/connect/google" });
  response.cookies.delete({ name: OAUTH_RETURN_COOKIE, path: "/api/connect/google" });
  return response;
}

/**
 * Where Google sends the user after consent. It checks the state, trades the code for a refresh
 * token, finds out which address was connected, and stores only the refresh token (encrypted)
 * with the permissions Google granted. Connecting an address that is already there replaces its
 * credentials: that is Reconnect, and Allow sending. Nothing from Google's replies is shown or
 * logged, and the tenant comes from the session.
 */
export async function GET(request: NextRequest) {
  const session = await requireModule("email-tracker");
  const params = request.nextUrl.searchParams;

  const cookieStore = await cookies();
  const returnTo = z.uuid().safeParse(cookieStore.get(OAUTH_RETURN_COOKIE)?.value);
  const leadId = returnTo.success ? returnTo.data : null;
  // The logs below say only which step failed and a safe code, never tokens, codes or Google's text.
  const stateOk = isValidOAuthState(cookieStore.get(OAUTH_STATE_COOKIE)?.value, params.get("state"));
  if (!stateOk) {
    console.error("[gmail-connect] failed at state check (cookie missing or different)");
    return back("error", leadId);
  }
  const googleError = params.get("error");
  if (googleError) {
    console.error(`[gmail-connect] Google returned error code: ${googleError.slice(0, 60)}`);
    if (googleError === "access_denied") return back(leadId ? "send_denied" : "denied", leadId);
    return back("error", leadId);
  }

  const code = params.get("code");
  if (!code) {
    console.error("[gmail-connect] failed: no code in the address");
    return back("error", leadId);
  }

  let outcome: Outcome;
  let accountId: string;
  let step = "exchanging the code for tokens";
  try {
    const { accessToken, refreshToken, scopes } = await exchangeCode(code);
    step = "reading the Gmail address (is the Gmail API enabled?)";
    const address = await getGmailAddress(accessToken);
    step = "saving the account";
    const db = getDb();
    const existing = await findAccountByIdentity(db, session.tenantId, GMAIL_PROVIDER, address);
    if (existing) {
      await updateCredentials(db, session.tenantId, existing.id, { refreshToken, scopes });
      accountId = existing.id;
      outcome = "reconnected";
    } else {
      const saved = await saveCredentials(db, {
        tenantId: session.tenantId,
        provider: GMAIL_PROVIDER,
        authType: "oauth",
        label: "Gmail",
        identity: address,
        brand: "gmail",
        credentials: { refreshToken, scopes },
      });
      accountId = saved.id;
      outcome = "connected";
    }
    // Allow sending: Google lets the user untick a permission, so check what was really granted.
    if (leadId) outcome = scopes.includes(GMAIL_SEND_SCOPE) ? "send_allowed" : "send_denied";
  } catch (error) {
    const kind = error instanceof GmailError ? `${error.kind}, HTTP ${error.status ?? "none"}` : (error as Error)?.name ?? "unknown";
    console.error(`[gmail-connect] failed while ${step}: ${kind}`);
    if (error instanceof GmailError && error.kind === "apiDisabled") return back("api_disabled", leadId);
    if (error instanceof GmailError && error.kind === "scope") return back("scope", leadId);
    return back("error", leadId);
  }

  // Start the first sync right away. If the background worker is not running, the 15-minute
  // schedule picks the account up anyway.
  try {
    await inngest.send({ name: SYNC_ACCOUNT_EVENT, data: { tenantId: session.tenantId, accountId } });
  } catch {
    // Not fatal: the account is saved.
  }
  return back(outcome, leadId);
}
