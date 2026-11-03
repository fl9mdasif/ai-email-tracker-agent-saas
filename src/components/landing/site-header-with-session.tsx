import { Suspense } from "react";
import { auth } from "@/core/auth";
import { SiteHeader } from "./site-header";

/** Reads the session without ever breaking the public page: any failure just means "signed out". */
async function isSignedIn(): Promise<boolean> {
  try {
    const session = await auth();
    return Boolean(session?.tenantId);
  } catch {
    return false;
  }
}

async function HeaderForSession() {
  return <SiteHeader signedIn={await isSignedIn()} />;
}

/** The homepage header: shows Dashboard and Log out when signed in, Sign in otherwise. */
export function SiteHeaderWithSession() {
  // The signed-out header is shown for the instant it takes to read the session.
  return (
    <Suspense fallback={<SiteHeader signedIn={false} />}>
      <HeaderForSession />
    </Suspense>
  );
}
