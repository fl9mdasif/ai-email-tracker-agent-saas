"use client";

import { Ellipsis } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { type NavItem, isActive, navItemsFor, splitForPhone } from "./nav-items";

type Badges = Record<string, number>;
type NavProps = { items: NavItem[]; badges: Badges };

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] leading-5 font-semibold text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

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

const phoneButton = "relative flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 py-1 text-[10px] text-muted-foreground";

/**
 * The phone bar: four main buttons and a "More" button that opens the rest (Follow-ups, Accounts,
 * Settings and, for staff, Platform), so the bar never gets crowded.
 */
function BottomNav({ items, badges, pathname }: NavProps & { pathname: string }) {
  const { primary, more } = splitForPhone(items);
  // The menu remembers which page it was opened on, so going to another page closes it with no effect needed.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === pathname;
  const setOpen = (value: boolean) => setOpenFor(value ? pathname : null);
  const moreActive = more.some((item) => isActive(pathname, item.href));
  const moreCount = more.reduce((sum, item) => sum + (badges[item.href] ?? 0), 0);

  // Escape closes it.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpenFor(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t bg-background py-1.5 md:hidden">
      {primary.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        const count = badges[href] ?? 0;
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn(phoneButton, active && "text-primary")}>
            <span className="relative">
              <Icon className="size-5" />
              {count > 0 ? <span aria-label={`${count} waiting`} className="absolute -top-1 -right-1.5 size-2.5 rounded-full bg-brand" /> : null}
            </span>
            <span className="max-w-full truncate">{label}</span>
          </Link>
        );
      })}

      <div className="relative flex min-w-0 flex-1">
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen(!open)}
          className={cn(phoneButton, "w-full", (moreActive || open) && "text-primary")}
        >
          <span className="relative">
            <Ellipsis className="size-5" />
            {moreCount > 0 ? <span aria-label={`${moreCount} waiting`} className="absolute -top-1 -right-1.5 size-2.5 rounded-full bg-brand" /> : null}
          </span>
          <span>More</span>
        </button>
        {open ? (
          <div role="menu" aria-label="More" className="absolute right-1 bottom-full mb-2 grid w-48 gap-0.5 rounded-xl border bg-popover p-1.5 shadow-lg">
            {more.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                role="menuitem"
                aria-current={isActive(pathname, href) ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted", isActive(pathname, href) && "bg-muted font-medium")}
              >
                <Icon className="size-4" />
                {label}
                <Badge count={badges[href] ?? 0} />
              </Link>
            ))}
          </div>
        ) : null}
      </div>
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
  const items = navItemsFor(showAdmin);

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
