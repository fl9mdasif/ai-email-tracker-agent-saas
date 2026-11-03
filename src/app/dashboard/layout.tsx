import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { getSuperAdminEmail } from "@/core/auth/super-admin";
import { requireModule } from "@/core/modules/guard";
import { Skeleton } from "@/components/ui/skeleton";

/** Shown for a moment while the signed-in check runs, before the page itself streams in. */
function PageSkeleton() {
  return (
    <div role="status" aria-busy="true" className="grid gap-4">
      <span className="sr-only">Loading...</span>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-80 max-w-full" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}

async function ModuleGate({ children }: { children: React.ReactNode }) {
  await requireModule("email-tracker");
  return <>{children}</>;
}

/** The shell needs to know up front whether to show the super-admin link. */
async function ShellWithAdminLink({ children }: { children: React.ReactNode }) {
  const isSuperAdmin = (await getSuperAdminEmail()) !== null;
  return <AppShell showAdmin={isSuperAdmin}>{children}</AppShell>;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<AppShell>{<PageSkeleton />}</AppShell>}>
      <ShellWithAdminLink>
        <Suspense fallback={<PageSkeleton />}>
          <ModuleGate>{children}</ModuleGate>
        </Suspense>
      </ShellWithAdminLink>
    </Suspense>
  );
}
