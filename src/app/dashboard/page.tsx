import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/core/auth";

async function DashboardContent() {
  const session = await auth();
  if (!session?.tenantId) redirect("/login");

  return (
    <>
      <p className="text-sm opacity-70">Signed in as {session.user?.email}</p>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <button type="submit" className="rounded-lg border px-4 py-2">
          Sign out
        </button>
      </form>
    </>
  );
}

export default function DashboardPage() {
  return (
    <main className="flex min-h-screen flex-col items-start gap-4 p-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <Suspense fallback={<p className="text-sm opacity-70">Loading...</p>}>
        <DashboardContent />
      </Suspense>
    </main>
  );
}
