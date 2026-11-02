import { Suspense } from "react";
import { requireModule } from "@/core/modules/guard";

async function ModuleGate({ children }: { children: React.ReactNode }) {
  await requireModule("email-tracker");
  return <>{children}</>;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p className="p-6 text-sm opacity-70">Loading...</p>}>
      <ModuleGate>{children}</ModuleGate>
    </Suspense>
  );
}
