import { CalendarClock, Flame, LayoutDashboard, Mail, MessageSquare, Plug, Reply, Settings, ShieldCheck, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

/** The menu on a computer, top to bottom. */
export const BASE_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Today", icon: LayoutDashboard },
  { href: "/dashboard/needs-reply", label: "Needs reply", icon: Reply },
  { href: "/dashboard/follow-ups", label: "Follow-ups", icon: CalendarClock },
  { href: "/dashboard/leads", label: "Leads", icon: Flame },
  { href: "/dashboard/chat", label: "Chat", icon: MessageSquare },
  { href: "/dashboard/mail", label: "Mail", icon: Mail },
  { href: "/dashboard/accounts", label: "Accounts", icon: Plug },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

/** Shown only to platform staff. */
export const ADMIN_NAV_ITEM: NavItem = { href: "/admin", label: "Platform", icon: ShieldCheck };

/** The items that get their own button on a phone. Everything else lives under "More". */
export const PHONE_PRIMARY_HREFS = ["/dashboard", "/dashboard/needs-reply", "/dashboard/chat", "/dashboard/mail"] as const;

export function navItemsFor(showAdmin: boolean): NavItem[] {
  return showAdmin ? [...BASE_NAV_ITEMS, ADMIN_NAV_ITEM] : BASE_NAV_ITEMS;
}

/** Splits the menu for a phone: the main buttons in a fixed order, and the rest for the More menu. Nothing is lost or repeated. */
export function splitForPhone(items: NavItem[]): { primary: NavItem[]; more: NavItem[] } {
  const primary = PHONE_PRIMARY_HREFS.flatMap((href) => items.filter((item) => item.href === href));
  const shown = new Set(primary.map((item) => item.href));
  return { primary, more: items.filter((item) => !shown.has(item.href)) };
}

/** Today is only its own page; the other items also cover the pages under them (a mail's detail page, for example). */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}
