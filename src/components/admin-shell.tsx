"use client";

import {
  Activity,
  ArrowLeft,
  CreditCard,
  LayoutDashboard,
  ScrollText,
  SlidersHorizontal,
  Sparkles,
  BarChart3,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

export type AdminNavItem = {
  href: string;
  label: string;
  icon: "overview" | "tenants" | "plans" | "leads" | "usage" | "health" | "settings" | "staff" | "audit";
};

const ICONS: Record<AdminNavItem["icon"], LucideIcon> = {
  overview: LayoutDashboard,
  tenants: Users,
  plans: CreditCard,
  leads: Sparkles,
  usage: BarChart3,
  health: Activity,
  settings: SlidersHorizontal,
  staff: UserCog,
  audit: ScrollText,
};

/** Overview is only its own page; the others also cover the pages under them. */
function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Links({ items, pathname, row }: { items: AdminNavItem[]; pathname: string; row?: boolean }) {
  return (
    <nav aria-label="Platform" className={cn(row ? "flex gap-1 overflow-x-auto px-3 pb-2" : "flex flex-col gap-1")}>
      {items.map(({ href, label, icon }) => {
        const Icon = ICONS[icon];
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent",
              active && "bg-sidebar-accent font-medium",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** The active item needs the page address, which is only known per request, so only this part waits for it. */
function LiveLinks({ items, row }: { items: AdminNavItem[]; row?: boolean }) {
  return <Links items={items} pathname={usePathname()} row={row} />;
}

/**
 * The frame of the platform dashboard: a menu with only the sections the signed-in role may open,
 * who is signed in and as what, and a way back to the normal dashboard.
 */
export function AdminShell({
  children,
  items,
  roleLabel,
  email,
}: {
  children: React.ReactNode;
  items: AdminNavItem[];
  roleLabel: string;
  email: string;
}) {
  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="hidden border-r bg-sidebar p-4 md:flex md:flex-col md:gap-5">
        <div className="grid gap-1 px-2">
          <Logo />
          <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">Platform</p>
        </div>
        <Suspense fallback={<Links items={items} pathname="" />}>
          <LiveLinks items={items} />
        </Suspense>
        <div className="mt-auto grid gap-3">
          <div className="grid gap-0.5 px-2 text-xs">
            <span className="truncate text-muted-foreground">{email}</span>
            <span className="w-fit rounded-full bg-brand/15 px-2 py-0.5 font-medium text-brand dark:text-brand-light">{roleLabel}</span>
          </div>
          <Link href="/dashboard" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent">
            <ArrowLeft className="size-4" />
            Back to my dashboard
          </Link>
          <ThemeToggle />
        </div>
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="grid gap-2 border-b pt-3 md:hidden">
          <div className="flex items-center justify-between px-4">
            <Logo markClassName="size-7" className="gap-2" />
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-brand/15 px-2 py-0.5 text-xs font-medium text-brand dark:text-brand-light">{roleLabel}</span>
              <ThemeToggle />
            </div>
          </div>
          <Suspense fallback={<Links items={items} pathname="" row />}>
            <LiveLinks items={items} row />
          </Suspense>
        </header>
        <div className="flex-1 p-4 md:p-8">{children}</div>
      </div>
    </div>
  );
}
