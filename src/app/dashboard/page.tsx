import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/core/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MailSkeleton } from "./mail-skeleton";
import { ScanNotice } from "./scan-notice";
import { TodayView } from "./today-view";

async function AccountLine() {
  const session = await auth();
  if (!session?.tenantId) redirect("/login");

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">Signed in as {session.user?.email}</p>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <Button type="submit" variant="outline" size="sm">
          Sign out
        </Button>
      </form>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-4">
      <h1 className="font-display text-2xl font-semibold">Today</h1>
      <Suspense fallback={<Skeleton className="h-9 w-full" />}>
        <AccountLine />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-16 w-full rounded-lg" />}>
        <ScanNotice />
      </Suspense>
      <Suspense fallback={<MailSkeleton />}>
        <TodayView />
      </Suspense>
    </div>
  );
}
