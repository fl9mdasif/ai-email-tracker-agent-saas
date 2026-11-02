import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/core/auth";
import { Button } from "@/components/ui/button";
import { LatestMail } from "./latest-mail";

async function DashboardContent() {
  const session = await auth();
  if (!session?.tenantId) redirect("/login");

  return (
    <>
      <p className="text-sm text-muted-foreground">Signed in as {session.user?.email}</p>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <Button type="submit" variant="outline">
          Sign out
        </Button>
      </form>
    </>
  );
}

export default function DashboardPage() {
  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="font-display text-2xl font-semibold">Today</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading...</p>}>
        <DashboardContent />
      </Suspense>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading mail...</p>}>
        <LatestMail />
      </Suspense>
    </div>
  );
}
