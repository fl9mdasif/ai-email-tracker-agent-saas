import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { auth } from "@/core/auth";
import { getDb } from "@/core/db";
import { requireModule } from "@/core/modules/guard";
import { getPlatformActor } from "@/core/platform/require-permission";
import { Skeleton } from "@/components/ui/skeleton";
import { getTodayOverview } from "@/modules/email-tracker/queries/dashboard";

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

/** The counts shown beside "Needs reply" and "Follow-ups". A failure here must never break the page. */
async function menuBadges(): Promise<Record<string, number>> {
  try {
    const session = await auth();
    if (!session?.tenantId) return {};
    const overview = await getTodayOverview(getDb(), session.tenantId);
    return { "/dashboard/needs-reply": overview.needsReply, "/dashboard/follow-ups": overview.followUpsDue };
  } catch {
    return {};
  }
}

/** The shell needs to know up front whether to show the Platform link (any staff role) and the menu counts. */
async function ShellWithAccountInfo({ children }: { children: React.ReactNode }) {
  const [actor, badges] = await Promise.all([getPlatformActor().catch(() => null), menuBadges()]);
  return (
    <AppShell showAdmin={actor !== null} badges={badges}>
      {children}
    </AppShell>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<AppShell>{<PageSkeleton />}</AppShell>}>
      <ShellWithAccountInfo>
        <Suspense fallback={<PageSkeleton />}>
          <ModuleGate>{children}</ModuleGate>
        </Suspense>
      </ShellWithAccountInfo>
    </Suspense>
  );
}
