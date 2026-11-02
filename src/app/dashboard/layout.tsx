import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { requireModule } from "@/core/modules/guard";

async function ModuleGate({ children }: { children: React.ReactNode }) {
  await requireModule("email-tracker");
  return <>{children}</>;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading...</p>}>
        <ModuleGate>{children}</ModuleGate>
      </Suspense>
    </AppShell>
  );
}
