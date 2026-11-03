import { AppShell } from "@/components/app-shell";
import { requireSuperAdmin } from "@/core/auth/super-admin";

export const metadata = { title: "Platform dashboard" };

/** Everything under /admin is for super admins only; anyone else gets a 404. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdmin();
  return <AppShell showAdmin>{children}</AppShell>;
}
