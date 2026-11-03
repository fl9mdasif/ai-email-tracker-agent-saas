"use client";

import { CalendarClock, LayoutDashboard, Mail, Plug, Reply, Settings, ShieldCheck, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon };
type Badges = Record<string, number>;

const BASE_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Today", icon: LayoutDashboard },
  { href: "/dashboard/needs-reply", label: "Needs reply", icon: Reply },
  { href: "/dashboard/follow-ups", label: "Follow-ups", icon: CalendarClock },
  { href: "/dashboard/mail", label: "Mail", icon: Mail },
  { href: "/dashboard/accounts", label: "Accounts", icon: Plug },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

/** Shown only to super admins. */
const ADMIN_NAV_ITEM: NavItem = { href: "/admin", label: "Platform", icon: ShieldCheck };

/** Today is only its own page; the other items also cover the pages under them (a mail's detail page, for example). */
function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] leading-5 font-semibold text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

type NavProps = { items: NavItem[]; badges: Badges };

function SideNav({ items, badges, pathname }: NavProps & { pathname: string }) {
  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {items.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent",
              active && "bg-sidebar-accent font-medium",
            )}
          >
            <Icon className="size-4" />
            {label}
            <Badge count={badges[href] ?? 0} />
          </Link>
        );
      })}
    </nav>
  );
}

function BottomNav({ items, badges, pathname }: NavProps & { pathname: string }) {
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t bg-background py-1.5 md:hidden">
      {items.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        const count = badges[href] ?? 0;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-1 text-[10px] text-muted-foreground",
              active && "text-primary",
            )}
          >
            <span className="relative">
              <Icon className="size-5" />
              {count > 0 ? <span aria-label={`${count} waiting`} className="absolute -top-1 -right-1.5 size-2.5 rounded-full bg-brand" /> : null}
            </span>
            <span className="max-w-full truncate">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The menus need the current page address to mark the active item. That is only known at request
 * time, so just these two small parts wait for it, and the rest of the shell does not. Until it
 * arrives the menu is drawn with nothing marked active.
 */
function LiveSideNav(props: NavProps) {
  return <SideNav {...props} pathname={usePathname()} />;
}

function LiveBottomNav(props: NavProps) {
  return <BottomNav {...props} pathname={usePathname()} />;
}

export function AppShell({
  children,
  showAdmin = false,
  badges = {},
}: {
  children: React.ReactNode;
  showAdmin?: boolean;
  /** Small counts beside a menu item, by its address (for example the unhandled needs-reply mail). */
  badges?: Badges;
}) {
  const items = showAdmin ? [...BASE_NAV_ITEMS, ADMIN_NAV_ITEM] : BASE_NAV_ITEMS;

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="hidden border-r bg-sidebar p-4 md:flex md:flex-col md:gap-6">
        <Link href="/dashboard" aria-label="Loopify dashboard" className="px-2">
          <Logo />
        </Link>
        <Suspense fallback={<SideNav items={items} badges={badges} pathname="" />}>
          <LiveSideNav items={items} badges={badges} />
        </Suspense>
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

      <Suspense fallback={<BottomNav items={items} badges={badges} pathname="" />}>
        <LiveBottomNav items={items} badges={badges} />
      </Suspense>
    </div>
  );
}
