"use client";

import { Inbox, Plug, Settings, ShieldCheck, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon };

// Each milestone adds its own entries (Needs reply, Follow-ups, Chat, Settings).
const BASE_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Today", icon: Inbox },
  { href: "/dashboard/accounts", label: "Accounts", icon: Plug },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

/** Shown only to super admins. */
const ADMIN_NAV_ITEM: NavItem = { href: "/admin", label: "Platform", icon: ShieldCheck };

export function AppShell({ children, showAdmin = false }: { children: React.ReactNode; showAdmin?: boolean }) {
  const pathname = usePathname();
  const NAV_ITEMS = showAdmin ? [...BASE_NAV_ITEMS, ADMIN_NAV_ITEM] : BASE_NAV_ITEMS;

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="hidden border-r bg-sidebar p-4 md:flex md:flex-col md:gap-6">
        <Link href="/dashboard" aria-label="Loopify dashboard" className="px-2">
          <Logo />
        </Link>
        <nav className="flex flex-col gap-1" aria-label="Main">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent",
                pathname === href && "bg-sidebar-accent font-medium",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto">
          <ThemeToggle />
        </div>
      </aside>

      <div className="flex min-h-screen flex-col pb-16 md:pb-0">
        <header className="flex items-center justify-between border-b px-4 py-3 md:hidden">
          <Link href="/dashboard" aria-label="Loopify dashboard">
            <Logo markClassName="size-7" className="gap-2" />
          </Link>
          <ThemeToggle />
        </header>
        <div className="flex-1 p-4 md:p-8">{children}</div>
      </div>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 flex justify-around border-t bg-background py-2 md:hidden"
      >
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={pathname === href ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-1 px-4 py-1 text-xs text-muted-foreground",
              pathname === href && "text-primary",
            )}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
