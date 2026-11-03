import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getConfig } from "@/core/config";
import { requireModule } from "@/core/modules/guard";
import {
  OAUTH_RETURN_COOKIE,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_MAX_AGE_SECONDS,
  newOAuthState,
} from "@/modules/email-tracker/connectors/gmail/oauth-state";
import { buildConsentUrl } from "@/modules/email-tracker/connectors/gmail/tokens";

const hintSchema = z.email();
const leadIdSchema = z.uuid();

/**
 * Starts "Connect Gmail": sends the signed-in user to Google to approve read-only mail access.
 * With `?send=<lead id>` (the Allow sending button on a draft) it asks for the separate send
 * permission instead, and the callback returns the user to that lead. This is separate from
 * signing in. The tenant comes from the session, never from the request.
 */
export async function GET(request: NextRequest) {
  await requireModule("email-tracker");
  const params = request.nextUrl.searchParams;

  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: getConfig().NODE_ENV === "production",
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
    path: "/api/connect/google",
  };
  const state = newOAuthState();
  const cookieStore = await cookies();
  cookieStore.set(OAUTH_STATE_COOKIE, state, cookieOptions);

  const sendFor = leadIdSchema.safeParse(params.get("send"));
  if (sendFor.success) cookieStore.set(OAUTH_RETURN_COOKIE, sendFor.data, cookieOptions);
  else cookieStore.delete({ name: OAUTH_RETURN_COOKIE, path: "/api/connect/google" });

  // On Reconnect and Allow sending the page passes the address so Google pre-selects that account.
  const hint = hintSchema.safeParse(params.get("hint"));
  return NextResponse.redirect(buildConsentUrl(state, hint.success ? hint.data : undefined, { allowSending: sendFor.success }));
}
