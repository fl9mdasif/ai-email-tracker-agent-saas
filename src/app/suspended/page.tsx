import { Suspense } from "react";
import { signOutAction } from "@/app/sign-out-action";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Workspace suspended" };

/**
 * Where a suspended workspace lands. It does not check the workspace itself (that would loop), it
 * only explains and offers to sign out. Mail is not fetched or analyzed while a workspace is suspended.
 */
export default function SuspendedPage() {
  return (
    <main className="flex min-h-screen flex-col items-start justify-center gap-4 p-6">
      <h1 className="font-display text-2xl font-semibold">Your workspace is suspended</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Access to this workspace has been paused, so mail is not being fetched or analyzed right now. Nothing has been deleted. Contact the
        Loopify team to get it switched back on.
      </p>
      <Suspense fallback={null}>
        <form action={signOutAction}>
          <Button type="submit" variant="outline">
            Sign out
          </Button>
        </form>
      </Suspense>
    </main>
  );
}
