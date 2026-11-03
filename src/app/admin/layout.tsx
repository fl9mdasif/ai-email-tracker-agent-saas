import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminShell } from "@/components/admin-shell";
import { ROLE_LABELS } from "@/core/platform/permissions";
import { getPlatformActor } from "@/core/platform/require-permission";
import { sectionsFor } from "./sections";

export const metadata = { title: "Platform dashboard" };

async function AdminGate({ children }: { children: React.ReactNode }) {
  const actor = await getPlatformActor();
  // Anyone who is not staff gets a plain 404. The menu is only built after this check passes,
  // and shows only the sections this role may open. Each page checks its own permission too.
  if (!actor) notFound();
  return (
    <AdminShell items={sectionsFor(actor.role)} roleLabel={ROLE_LABELS[actor.role]} email={actor.email}>
      {children}
    </AdminShell>
  );
}

/** Everything under /admin is for platform staff only. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <AdminGate>{children}</AdminGate>
    </Suspense>
  );
}
