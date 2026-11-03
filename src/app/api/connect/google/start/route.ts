import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getConfig } from "@/core/config";
import { requireModule } from "@/core/modules/guard";
import {
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_MAX_AGE_SECONDS,
  newOAuthState,
} from "@/modules/email-tracker/connectors/gmail/oauth-state";
import { buildConsentUrl } from "@/modules/email-tracker/connectors/gmail/tokens";

const hintSchema = z.email();

/**
 * Starts "Connect Gmail": sends the signed-in user to Google to approve read-only mail access.
 * This is separate from signing in. The tenant comes from the session, never from the request.
 */
export async function GET(request: NextRequest) {
  await requireModule("email-tracker");

  const state = newOAuthState();
  const cookieStore = await cookies();
  cookieStore.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: getConfig().NODE_ENV === "production",
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
    path: "/api/connect/google",
  });

  // On Reconnect the card passes the address so Google pre-selects that account.
  const hint = hintSchema.safeParse(request.nextUrl.searchParams.get("hint"));
  return NextResponse.redirect(buildConsentUrl(state, hint.success ? hint.data : undefined));
}
