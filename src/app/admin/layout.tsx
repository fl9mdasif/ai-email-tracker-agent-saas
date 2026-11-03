import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { requireSuperAdmin } from "@/core/auth/super-admin";

export const metadata = { title: "Platform dashboard" };

async function AdminGate({ children }: { children: React.ReactNode }) {
  await requireSuperAdmin();
  // The menu is only built once the check has passed, so nobody else ever sees the Platform link.
  return <AppShell showAdmin>{children}</AppShell>;
}

/** Everything under /admin is for super admins only; anyone else gets a 404. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <AdminGate>{children}</AdminGate>
    </Suspense>
  );
}
